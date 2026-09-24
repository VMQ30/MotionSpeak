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

def format_gloss_text(g):
    return " ".join([w.capitalize() for w in g.split(" ")])

def analyze_user_experience():
    video_path = "../user_experience.mp4"
    if not os.path.exists(video_path):
        video_path = "user_experience.mp4"

    if not os.path.exists(video_path):
        print(f"Error: {video_path} not found!")
        return

    print("=" * 90)
    print(f"ANALYZING USER EXPERIENCE VIDEO: {os.path.abspath(video_path)}")
    print("=" * 90)

    cap = cv2.VideoCapture(video_path)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0.0

    print(f"Video Resolution: {width}x{height} | FPS: {fps:.2f} | Total Frames: {total_frames} | Duration: {duration:.2f}s")

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

    step_frames = max(1, int(round(fps * 0.075))) # 75ms step (~13.3 FPS)

    frame_records = []
    frame_history_unmirrored = []
    frame_history_mirrored = []

    frame_idx = 0
    sampled_frame_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        if frame_idx % step_frames == 0:
            sampled_frame_count += 1
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

            # Unmirrored Feature Extraction (Physical MediaPipe category -> offset 99 for Left, offset 162 for Right)
            feat_unmirrored = np.zeros(225, dtype=np.float32)
            # Mirrored Feature Extraction (Inverted category -> offset 162 for Left, offset 99 for Right)
            feat_mirrored = np.zeros(225, dtype=np.float32)

            center_anchor_x, center_anchor_y, center_anchor_z = 0.5, 0.5, 0.0
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
                    center_anchor_x, center_anchor_y, center_anchor_z = cx, cy, cz
                    scale_factor = max(shoulder_dist, 0.15)
                    is_pose_valid = True

                    for p in range(min(33, len(p_list))):
                        lm = p_list[p]
                        norm_x = (lm.x - center_anchor_x) / scale_factor
                        norm_y = (lm.y - center_anchor_y) / scale_factor
                        norm_z = (lm.z - center_anchor_z) / scale_factor
                        feat_unmirrored[p*3] = norm_x
                        feat_unmirrored[p*3+1] = norm_y
                        feat_unmirrored[p*3+2] = norm_z

                        feat_mirrored[p*3] = norm_x
                        feat_mirrored[p*3+1] = norm_y
                        feat_mirrored[p*3+2] = norm_z

            raw_handedness_labels = []
            lh_points_count = 0
            rh_points_count = 0

            if has_hand and hand_result.handedness:
                for idx in range(min(len(hand_result.hand_landmarks), len(hand_result.handedness))):
                    raw_cat = hand_result.handedness[idx][0].category_name
                    score = hand_result.handedness[idx][0].score
                    raw_handedness_labels.append(f"{raw_cat}:{score:.2f}")

                    h_list = hand_result.hand_landmarks[idx]

                    # Unmirrored: Left -> 99, Right -> 162
                    off_unmirrored = 99 if raw_cat.lower() == "left" else 162
                    # Mirrored: Left -> 162, Right -> 99
                    off_mirrored = 162 if raw_cat.lower() == "left" else 99

                    for h in range(min(21, len(h_list))):
                        lm = h_list[h]
                        nx = (lm.x - center_anchor_x) / scale_factor
                        ny = (lm.y - center_anchor_y) / scale_factor
                        nz = (lm.z - center_anchor_z) / scale_factor

                        feat_unmirrored[off_unmirrored + h*3] = nx
                        feat_unmirrored[off_unmirrored + h*3+1] = ny
                        feat_unmirrored[off_unmirrored + h*3+2] = nz

                        feat_mirrored[off_mirrored + h*3] = nx
                        feat_mirrored[off_mirrored + h*3+1] = ny
                        feat_mirrored[off_mirrored + h*3+2] = nz

            if has_hand:
                frame_history_unmirrored.append(feat_unmirrored)
                frame_history_mirrored.append(feat_mirrored)
                if len(frame_history_unmirrored) > 30:
                    frame_history_unmirrored.pop(0)
                    frame_history_mirrored.pop(0)

            # Evaluate Model Inference if buffer >= 3 frames
            pred_unmirrored = None
            pred_mirrored = None

            if len(frame_history_unmirrored) >= 3:
                # Unmirrored prediction
                cnt = len(frame_history_unmirrored)
                inp_u = np.zeros((1, 30, 225), dtype=np.float32)
                for i in range(30):
                    s_idx = (i * cnt) // 30
                    inp_u[0, i] = frame_history_unmirrored[min(s_idx, cnt - 1)]
                interpreter.set_tensor(input_details[0]['index'], inp_u)
                interpreter.invoke()
                out_u = interpreter.get_tensor(output_details[0]['index'])[0]
                top_u = sorted(enumerate(out_u), key=lambda x: x[1], reverse=True)[:3]
                pred_unmirrored = top_u

                # Mirrored prediction
                inp_m = np.zeros((1, 30, 225), dtype=np.float32)
                for i in range(30):
                    s_idx = (i * cnt) // 30
                    inp_m[0, i] = frame_history_mirrored[min(s_idx, cnt - 1)]
                interpreter.set_tensor(input_details[0]['index'], inp_m)
                interpreter.invoke()
                out_m = interpreter.get_tensor(output_details[0]['index'])[0]
                top_m = sorted(enumerate(out_m), key=lambda x: x[1], reverse=True)[:3]
                pred_mirrored = top_m

            frame_records.append({
                "frame": frame_idx,
                "time_sec": frame_idx / fps,
                "has_pose": has_pose,
                "has_hand": has_hand,
                "raw_handedness": raw_handedness_labels,
                "anchor": (round(center_anchor_x, 2), round(center_anchor_y, 2)),
                "scale": round(scale_factor, 2),
                "history_len": len(frame_history_unmirrored),
                "pred_unmirrored": pred_unmirrored,
                "pred_mirrored": pred_mirrored,
                "feat_unmirrored_nonzero": np.count_nonzero(feat_unmirrored),
                "lh_slot_nonzero": np.count_nonzero(feat_unmirrored[99:162]),
                "rh_slot_nonzero": np.count_nonzero(feat_unmirrored[162:225]),
            })

        frame_idx += 1

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    print("\n--- DETAILED FRAME-BY-FRAME TIMELINE OF USER EXPERIENCE VIDEO ---")
    print(f"{'Time':<6s} | {'Frame':<6s} | {'Pose?':<6s} | {'Hand?':<6s} | {'Raw Handedness':<18s} | {'Buffer':<6s} | {'Unmirrored Top-1 Pred':<24s} | {'Mirrored Top-1 Pred':<24s}")
    print("-" * 110)

    for rec in frame_records:
        u_str = "N/A"
        if rec['pred_unmirrored']:
            cls_idx, prob = rec['pred_unmirrored'][0]
            u_str = f"{TARGET_GLOSSES[cls_idx]} ({prob*100:.1f}%)"

        m_str = "N/A"
        if rec['pred_mirrored']:
            cls_idx, prob = rec['pred_mirrored'][0]
            m_str = f"{TARGET_GLOSSES[cls_idx]} ({prob*100:.1f}%)"

        h_str = ", ".join(rec['raw_handedness']) if rec['raw_handedness'] else "None"
        print(f"{rec['time_sec']:5.2f}s | {rec['frame']:6d} | {str(rec['has_pose']):6s} | {str(rec['has_hand']):6s} | {h_str:18s} | {rec['history_len']:6d} | {u_str:24s} | {m_str:24s}")

    total_samp = len(frame_records)
    pose_cnt = sum(1 for r in frame_records if r['has_pose'])
    hand_cnt = sum(1 for r in frame_records if r['has_hand'])

    print("\n--- SUMMARY OF USER EXPERIENCE VIDEO ---")
    print(f"Total Sampled Frames: {total_samp}")
    print(f"Pose Detected: {pose_cnt} / {total_samp} ({pose_cnt/total_samp*100:.1f}%)")
    print(f"Hand Detected: {hand_cnt} / {total_samp} ({hand_cnt/total_samp*100:.1f}%)")

if __name__ == "__main__":
    analyze_user_experience()
