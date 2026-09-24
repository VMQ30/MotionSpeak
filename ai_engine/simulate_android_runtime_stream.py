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

def simulate_app_runtime_stream(video_path, gloss_name, is_front_camera=True):
    print("=" * 80)
    print(f"SIMULATING LIVE ANDROID APP STREAMING ON: {video_path} (Gloss: '{gloss_name}')")
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
    step_frames = max(1, int(round(video_fps * 0.075))) # 75ms polling step (~13.3 FPS)

    frame_history = []
    no_hand_frame_count = 0

    frame_idx = 0
    inferences_run = 0
    blocked_by_history_size = 0
    blocked_by_raise_hand = 0
    blocked_by_no_hand = 0
    history_cleared_count = 0

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

            center_anchor_x = 0.5
            center_anchor_y = 0.5
            center_anchor_z = 0.0
            scale_factor = 1.0
            is_pose_valid = False

            if pose_landmarks and len(pose_landmarks) > 0 and len(pose_landmarks[0]) > 12:
                p_list = pose_landmarks[0]
                l_sh, r_sh = p_list[11], p_list[12]
                cx, cy, cz = (l_sh.x + r_sh.x)/2.0, (l_sh.y + r_sh.y)/2.0, (l_sh.z + r_sh.z)/2.0
                dist = np.sqrt((l_sh.x-r_sh.x)**2 + (l_sh.y-r_sh.y)**2 + (l_sh.z-r_sh.z)**2)

                if 0.05 <= dist <= 0.70 and 0.05 <= cx <= 0.95 and 0.05 <= cy <= 0.95:
                    center_anchor_x, center_anchor_y, center_anchor_z = cx, cy, cz
                    scale_factor = max(dist, 0.15)
                    is_pose_valid = True

                    for p in range(min(33, len(p_list))):
                        lm = p_list[p]
                        frame_features[p*3] = (lm.x - center_anchor_x) / scale_factor
                        frame_features[p*3+1] = (lm.y - center_anchor_y) / scale_factor
                        frame_features[p*3+2] = (lm.z - center_anchor_z) / scale_factor

            # Hand check
            if hand_landmarks and len(hand_landmarks) > 0 and handedness and len(handedness) > 0:
                is_hand_detected = True

                # Line 363 filter: hand below chest
                first_wrist = hand_landmarks[0][0]
                if is_pose_valid and first_wrist.y > center_anchor_y + 0.40:
                    blocked_by_raise_hand += 1
                    logs.append(f"Frame {frame_idx:3d}: BLOCKED by Raise Hand filter (wrist y={first_wrist.y:.2f} > anchor {center_anchor_y:.2f}+0.40)")
                    frame_idx += 1
                    continue

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
                blocked_by_no_hand += 1
                if no_hand_frame_count > 5:
                    if len(frame_history) > 0:
                        history_cleared_count += 1
                        logs.append(f"Frame {frame_idx:3d}: History CLEARED because noHandFrameCount ({no_hand_frame_count}) > 5")
                    frame_history.clear()
                logs.append(f"Frame {frame_idx:3d}: NO HAND DETECTED (noHandCount={no_hand_frame_count})")
                frame_idx += 1
                continue
            else:
                no_hand_frame_count = 0

            frame_history.append(frame_features)
            if len(frame_history) > 30:
                frame_history.pop(0)

            # Check history threshold gate (Line 448)
            if len(frame_history) < 12:
                blocked_by_history_size += 1
                logs.append(f"Frame {frame_idx:3d}: BLOCKED by History Size Gate (history size = {len(frame_history)} < 12)")
                frame_idx += 1
                continue

            # Run inference!
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
            inferences_run += 1

            logs.append(f"Frame {frame_idx:3d}: INFERENCE EXECUTED! History={cnt}/30 -> Top1='{TARGET_GLOSSES[top_idx]}' ({top_prob:.1f}%)")

        frame_idx += 1

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    print("\n--- SIMULATION SUMMARY LOGS ---")
    for log in logs[:15]:
        print(" ", log)
    if len(logs) > 15:
        print(f"  ... ({len(logs)-15} additional frame logs omitted)")

    print("\n--- STATISTICS ---")
    print(f"Total Polling Frames Evaluated: {frame_idx // step_frames}")
    print(f"Blocked by Raise Hand filter   : {blocked_by_raise_hand}")
    print(f"Blocked by No Hand filter      : {blocked_by_no_hand}")
    print(f"History Buffer Clear Events    : {history_cleared_count}")
    print(f"Blocked by History Size (< 12) : {blocked_by_history_size}")
    print(f"Total Inferences Executed      : {inferences_run}")

if __name__ == "__main__":
    test_video = "dataset/new_videos/Hello/1.mp4"
    if not os.path.exists(test_video):
        for root, dirs, files in os.walk("dataset"):
            for f in files:
                if f.endswith(".mp4"):
                    test_video = os.path.join(root, f)
                    break
            if os.path.exists(test_video): break
    
    simulate_app_runtime_stream(test_video, "hello", is_front_camera=True)
