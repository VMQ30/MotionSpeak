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

def dump_timeline():
    video_path = "../user_experience.mp4"
    if not os.path.exists(video_path):
        video_path = "user_experience.mp4"

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

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

    step_frames = max(1, int(round(fps * 0.075))) # 75ms

    frame_history = []
    lines = []

    frame_idx = 0
    lines.append(f"{'Time':<6s} | {'Frame':<6s} | {'Pose':<5s} | {'Hand':<5s} | {'Raw Handedness':<16s} | {'History':<7s} | {'Top-1 Pred':<22s} | {'Top-2 Pred':<22s}")
    lines.append("-" * 105)

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        if frame_idx % step_frames == 0:
            fh, fw = frame.shape[:2]
            max_dim = max(fh, fw)
            sq = cv2.copyMakeBorder(frame, (max_dim-fh)//2, (max_dim-fh)//2, (max_dim-fw)//2, (max_dim-fw)//2, cv2.BORDER_CONSTANT, value=[0,0,0])

            rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            pose_res = pose_landmarker.detect(mp_image)
            hand_res = hand_landmarker.detect(mp_image)

            has_pose = bool(pose_res.pose_landmarks and len(pose_res.pose_landmarks) > 0 and len(pose_res.pose_landmarks[0]) > 12)
            has_hand = bool(hand_res.hand_landmarks and len(hand_res.hand_landmarks) > 0)

            feat = np.zeros(225, dtype=np.float32)
            center_anchor_x, center_anchor_y, center_anchor_z = 0.5, 0.5, 0.0
            scale_factor = 1.0

            if has_pose:
                p_list = pose_res.pose_landmarks[0]
                l_sh, r_sh = p_list[11], p_list[12]
                cx, cy, cz = (l_sh.x + r_sh.x)/2.0, (l_sh.y + r_sh.y)/2.0, (l_sh.z + r_sh.z)/2.0
                dist = np.sqrt((l_sh.x - r_sh.x)**2 + (l_sh.y - r_sh.y)**2 + (l_sh.z - r_sh.z)**2)

                if 0.05 <= dist <= 0.70 and 0.05 <= cx <= 0.95 and 0.05 <= cy <= 0.95:
                    center_anchor_x, center_anchor_y, center_anchor_z = cx, cy, cz
                    scale_factor = max(dist, 0.15)
                    for p in range(min(33, len(p_list))):
                        lm = p_list[p]
                        feat[p*3] = (lm.x - center_anchor_x) / scale_factor
                        feat[p*3+1] = (lm.y - center_anchor_y) / scale_factor
                        feat[p*3+2] = (lm.z - center_anchor_z) / scale_factor

            raw_h_labels = []
            if has_hand and hand_res.handedness:
                for idx in range(min(len(hand_res.hand_landmarks), len(hand_res.handedness))):
                    raw_cat = hand_res.handedness[idx][0].category_name
                    score = hand_res.handedness[idx][0].score
                    raw_h_labels.append(f"{raw_cat}:{score:.2f}")

                    h_list = hand_res.hand_landmarks[idx]
                    off = 99 if raw_cat.lower() == "left" else 162

                    for h in range(min(21, len(h_list))):
                        lm = h_list[h]
                        feat[off + h*3] = (lm.x - center_anchor_x) / scale_factor
                        feat[off + h*3+1] = (lm.y - center_anchor_y) / scale_factor
                        feat[off + h*3+2] = (lm.z - center_anchor_z) / scale_factor

            if has_hand:
                frame_history.append(feat)
                if len(frame_history) > 30:
                    frame_history.pop(0)

            top1_str = "N/A"
            top2_str = "N/A"

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
                top1_str = f"{TARGET_GLOSSES[top[0][0]]} ({top[0][1]*100:.1f}%)"
                top2_str = f"{TARGET_GLOSSES[top[1][0]]} ({top[1][1]*100:.1f}%)"

            h_str = ", ".join(raw_h_labels) if raw_h_labels else "None"
            t_sec = frame_idx / fps
            lines.append(f"{t_sec:5.2f}s | {frame_idx:6d} | {str(has_pose):5s} | {str(has_hand):5s} | {h_str:16s} | {len(frame_history):7d} | {top1_str:22s} | {top2_str:22s}")

        frame_idx += 1

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    full_log = "\n".join(lines)
    with open("user_experience_timeline.txt", "w") as f:
        f.write(full_log)

    print(f"Timeline written to user_experience_timeline.txt ({len(lines)} lines)")

if __name__ == "__main__":
    dump_timeline()
