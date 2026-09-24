import os
import cv2
import numpy as np
import tensorflow as tf
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse"
]

def analyze_user_exp3():
    video_path = "../user_exp3.mp4"
    if not os.path.exists(video_path):
        video_path = "user_exp3.mp4"

    if not os.path.exists(video_path):
        print(f"Error: {video_path} not found!")
        return

    print("=" * 90)
    print(f"EXHAUSTIVE RUNTIME TRACE OF REPRODUCTION VIDEO: {os.path.abspath(video_path)}")
    print("=" * 90)

    cap = cv2.VideoCapture(video_path)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0.0

    print(f"Video Specs: Resolution={width}x{height}, FPS={fps:.2f}, Frames={total_frames}, Duration={duration:.2f}s, AspectRatio={width/height if height>0 else 0:.3f}")

    pose_options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="pose_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
    )
    pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="hand_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)

    interpreter = tf.lite.Interpreter(model_path="motion_speak_model.tflite")
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    step_frames = max(1, int(round(fps * 0.075)))

    frame_history = []
    trace_logs = []
    frame_idx = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        if frame_idx % step_frames == 0:
            fh, fw = frame.shape[:2]
            max_dim = max(fh, fw)
            pad_w = (max_dim - fw) // 2
            pad_h = (max_dim - fh) // 2
            sq = cv2.copyMakeBorder(frame, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])

            rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            pose_result = pose_landmarker.detect(mp_image)
            hand_result = hand_landmarker.detect(mp_image)

            has_pose = bool(pose_result.pose_landmarks and len(pose_result.pose_landmarks) > 0 and len(pose_result.pose_landmarks[0]) > 12)
            has_hand = bool(hand_result.hand_landmarks and len(hand_result.hand_landmarks) > 0)

            feat = np.zeros(225, dtype=np.float32)
            center_anchor = [0.5, 0.5, 0.0]
            scale_factor = 1.0
            is_pose_valid = False
            shoulder_dist = 0.0

            if has_pose:
                p_list = pose_result.pose_landmarks[0]
                l_sh, r_sh = p_list[11], p_list[12]
                cx = (l_sh.x + r_sh.x) / 2.0
                cy = (l_sh.y + r_sh.y) / 2.0
                cz = (l_sh.z + r_sh.z) / 2.0
                shoulder_dist = np.sqrt((l_sh.x - r_sh.x)**2 + (l_sh.y - r_sh.y)**2 + (l_sh.z - r_sh.z)**2)

                if 0.05 <= shoulder_dist <= 0.70 and 0.05 <= cx <= 0.95 and 0.05 <= cy <= 0.95:
                    center_anchor = [cx, cy, cz]
                    scale_factor = max(shoulder_dist, 0.15)
                    is_pose_valid = True

                    for p in range(min(33, len(p_list))):
                        lm = p_list[p]
                        feat[p*3] = (lm.x - center_anchor[0]) / scale_factor
                        feat[p*3+1] = (lm.y - center_anchor[1]) / scale_factor
                        feat[p*3+2] = (lm.z - center_anchor[2]) / scale_factor

            raw_h_labels = []
            if has_hand and hand_result.handedness:
                for idx in range(min(len(hand_result.hand_landmarks), len(hand_result.handedness))):
                    raw_cat = hand_result.handedness[idx][0].category_name
                    score = hand_result.handedness[idx][0].score
                    raw_h_labels.append(f"{raw_cat}:{score:.2f}")

                    h_list = hand_result.hand_landmarks[idx]
                    off = 99 if raw_cat.lower() == "left" else 162

                    for h in range(min(21, len(h_list))):
                        lm = h_list[h]
                        feat[off + h*3] = (lm.x - center_anchor[0]) / scale_factor
                        feat[off + h*3+1] = (lm.y - center_anchor[1]) / scale_factor
                        feat[off + h*3+2] = (lm.z - center_anchor[2]) / scale_factor

            if has_hand:
                frame_history.append(feat)
                if len(frame_history) > 30:
                    frame_history.pop(0)

            top1_str, top2_str = "N/A", "N/A"
            max_prob = 0.0

            if len(frame_history) >= 3:
                cnt = len(frame_history)
                inp = np.zeros((1, 30, 225), dtype=np.float32)
                for i in range(30):
                    s_idx = (i * cnt) // 30
                    inp[0, i] = frame_history[min(s_idx, cnt - 1)]

                interpreter.set_tensor(input_details[0]['index'], inp)
                interpreter.invoke()
                out = interpreter.get_tensor(output_details[0]['index'])[0]

                top = sorted(enumerate(out), key=lambda x: x[1], reverse=True)
                max_prob = top[0][1]
                top1_str = f"{TARGET_GLOSSES[top[0][0]]} ({top[0][1]*100:.1f}%)"
                top2_str = f"{TARGET_GLOSSES[top[1][0]]} ({top[1][1]*100:.1f}%)"

            pose_nz = np.count_nonzero(feat[0:99])
            lh_nz = np.count_nonzero(feat[99:162])
            rh_nz = np.count_nonzero(feat[162:225])

            t_sec = frame_idx / fps
            trace_logs.append({
                "time": t_sec,
                "frame": frame_idx,
                "has_pose": has_pose,
                "is_pose_valid": is_pose_valid,
                "has_hand": has_hand,
                "handedness": raw_h_labels,
                "pose_nz": pose_nz,
                "lh_nz": lh_nz,
                "rh_nz": rh_nz,
                "total_nz": pose_nz + lh_nz + rh_nz,
                "history_len": len(frame_history),
                "top1": top1_str,
                "top2": top2_str,
                "max_prob": max_prob
            })

        frame_idx += 1

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    log_lines = []
    log_lines.append(f"{'Time':<6s} | {'Frame':<6s} | {'Pose?':<5s} | {'PValid':<6s} | {'Hand?':<5s} | {'Raw Handedness':<16s} | {'P_NZ':<5s} | {'LH_NZ':<5s} | {'RH_NZ':<5s} | {'Hist':<5s} | {'Top-1 Prediction':<22s} | {'Top-2 Prediction':<22s}")
    log_lines.append("-" * 125)

    for r in trace_logs:
        h_str = ", ".join(r['handedness']) if r['handedness'] else "None"
        log_lines.append(f"{r['time']:5.2f}s | {r['frame']:6d} | {str(r['has_pose']):5s} | {str(r['is_pose_valid']):6s} | {str(r['has_hand']):5s} | {h_str:16s} | {r['pose_nz']:5d} | {r['lh_nz']:5d} | {r['rh_nz']:5d} | {r['history_len']:5d} | {r['top1']:22s} | {r['top2']:22s}")

    full_output = "\n".join(log_lines)
    with open("user_exp3_trace_log.txt", "w") as f:
        f.write(full_output)

    print(f"Trace written to user_exp3_trace_log.txt ({len(log_lines)} lines)")

    pose_valid_cnt = sum(1 for r in trace_logs if r['is_pose_valid'])
    hand_cnt = sum(1 for r in trace_logs if r['has_hand'])

    print("\n--- SUMMARY FOR user_exp3.mp4 ---")
    print(f"Total Sampled Frames: {len(trace_logs)}")
    print(f"Pose Detected       : {sum(1 for r in trace_logs if r['has_pose'])} / {len(trace_logs)}")
    print(f"Valid Pose Shoulders: {pose_valid_cnt} / {len(trace_logs)} ({pose_valid_cnt/len(trace_logs)*100:.1f}%)")
    print(f"Hand Detected       : {hand_cnt} / {len(trace_logs)} ({hand_cnt/len(trace_logs)*100:.1f}%)")

if __name__ == "__main__":
    analyze_user_exp3()
