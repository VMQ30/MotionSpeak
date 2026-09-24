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

def simulate_fixed_runtime_stream(video_path, gloss_name, is_front_camera=False):
    print("=" * 80)
    print(f"TESTING STREAM: {video_path} | Gloss: '{gloss_name}' | is_front_camera={is_front_camera}")
    print("=" * 80)

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

    cap = cv2.VideoCapture(video_path)
    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step_frames = max(1, int(round(video_fps * 0.075))) # 75ms step

    frame_history = []
    no_hand_frame_count = 0
    frame_idx = 0
    logs = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        if frame_idx % step_frames == 0:
            fh, fw = frame.shape[:2]
            max_dim = max(fh, fw)
            sq = cv2.copyMakeBorder(frame, (max_dim-fh)//2, (max_dim-fh)//2, (max_dim-fw)//2, (max_dim-fw)//2, cv2.BORDER_CONSTANT, value=[0,0,0])

            rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            pose_res = pose_landmarker.detect(mp_img)
            hand_res = hand_landmarker.detect(mp_img)

            frame_features = np.zeros(225, dtype=np.float32)
            is_hand_detected = False

            pose_landmarks = pose_res.pose_landmarks
            hand_landmarks = hand_res.hand_landmarks
            handedness = hand_res.handedness

            center_anchor_x, center_anchor_y, center_anchor_z = 0.5, 0.5, 0.0
            scale_factor = 1.0

            if pose_landmarks and len(pose_landmarks) > 0 and len(pose_landmarks[0]) > 12:
                p_list = pose_landmarks[0]
                l_sh, r_sh = p_list[11], p_list[12]
                cx, cy, cz = (l_sh.x + r_sh.x)/2.0, (l_sh.y + r_sh.y)/2.0, (l_sh.z + r_sh.z)/2.0
                dist = np.sqrt((l_sh.x-r_sh.x)**2 + (l_sh.y-r_sh.y)**2 + (l_sh.z-r_sh.z)**2)

                if 0.05 <= dist <= 0.70 and 0.05 <= cx <= 0.95 and 0.05 <= cy <= 0.95:
                    center_anchor_x, center_anchor_y, center_anchor_z = cx, cy, cz
                    scale_factor = max(dist, 0.15)
                    for p in range(min(33, len(p_list))):
                        lm = p_list[p]
                        frame_features[p*3] = (lm.x - center_anchor_x) / scale_factor
                        frame_features[p*3+1] = (lm.y - center_anchor_y) / scale_factor
                        frame_features[p*3+2] = (lm.z - center_anchor_z) / scale_factor

            if hand_landmarks and len(hand_landmarks) > 0 and handedness and len(handedness) > 0:
                is_hand_detected = True
                for idx in range(min(len(hand_landmarks), len(handedness))):
                    raw_cat = handedness[idx][0].category_name
                    h_list = hand_landmarks[idx]

                    eff_cat = ("Right" if raw_cat.lower() == "left" else "Left") if is_front_camera else raw_cat
                    off = 99 if eff_cat.lower() == "left" else 162

                    for h in range(min(21, len(h_list))):
                        lm = h_list[h]
                        frame_features[off + h*3] = (lm.x - center_anchor_x) / scale_factor
                        frame_features[off + h*3+1] = (lm.y - center_anchor_y) / scale_factor
                        frame_features[off + h*3+2] = (lm.z - center_anchor_z) / scale_factor

            if not is_hand_detected:
                no_hand_frame_count += 1
                if no_hand_frame_count > 15:
                    frame_history.clear()
                frame_idx += 1
                continue
            else:
                no_hand_frame_count = 0

            frame_history.append(frame_features)
            if len(frame_history) > 30:
                frame_history.pop(0)

            if len(frame_history) < 6:
                frame_idx += 1
                continue

            cnt = len(frame_history)
            input_tensor = np.zeros((1, 30, 225), dtype=np.float32)
            for i in range(30):
                s_idx = (i * cnt) // 30
                input_tensor[0, i] = frame_history[min(s_idx, cnt - 1)]

            interpreter.set_tensor(input_details[0]['index'], input_tensor)
            interpreter.invoke()
            out = interpreter.get_tensor(output_details[0]['index'])[0]

            top_idx = int(np.argmax(out))
            top_prob = float(out[top_idx] * 100)
            logs.append(f"Frame {frame_idx:3d}: History={cnt:2d}/30 -> Top1='{TARGET_GLOSSES[top_idx]:10s}' ({top_prob:5.1f}%)")

        frame_idx += 1

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    print("\n--- SIMULATION INFERENCE LOGS ---")
    for log in logs[-10:]:
        print(" ", log)

if __name__ == "__main__":
    test_gestures = [
        ("dataset/new_videos/Hello/1.mp4", "hello"),
        ("dataset/new_videos/Yes/1.mp4", "yes"),
        ("dataset/new_videos/No/1.mp4", "no"),
        ("dataset/new_videos/Good/1.mp4", "good"),
    ]
    for v_path, g_name in test_gestures:
        if os.path.exists(v_path):
            simulate_fixed_runtime_stream(v_path, g_name, is_front_camera=False)
