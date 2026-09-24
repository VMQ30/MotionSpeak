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

def verify_pipeline():
    video_path = "../user_exp2.mp4"
    if not os.path.exists(video_path):
        video_path = "user_exp2.mp4"

    print("=" * 90)
    print(f"VERIFYING FULL PIPELINE & UI LATCH ON REPRODUCTION VIDEO: {os.path.abspath(video_path)}")
    print("=" * 90)

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

    frame_history = []
    
    # UI Simulation state
    last_added_gloss = ""
    last_added_time = 0.0
    last_recognized_time = 0.0
    
    ui_commitments = []
    ui_active_states = []

    frame_idx = 0
    step_frames = max(1, int(round(fps * 0.075)))

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        if frame_idx % step_frames == 0:
            t_sec = frame_idx / fps

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
                    for p in range(min(33, len(p_list))):
                        lm = p_list[p]
                        feat[p*3] = (lm.x - center_anchor[0]) / scale_factor
                        feat[p*3+1] = (lm.y - center_anchor[1]) / scale_factor
                        feat[p*3+2] = (lm.z - center_anchor[2]) / scale_factor

            if has_hand and hand_result.handedness:
                for idx in range(min(len(hand_result.hand_landmarks), len(hand_result.handedness))):
                    raw_cat = hand_result.handedness[idx][0].category_name
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

            status = "no_hand"
            predicted_gloss = ""
            confidence = 0
            is_recognized = False

            if not has_hand:
                status = "no_hand"
            elif len(frame_history) < 3:
                status = "scanning"
            else:
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
                confidence = int(max_prob * 100)
                predicted_gloss = TARGET_GLOSSES[top[0][0]]
                is_recognized = max_prob >= 0.10
                status = "success" if is_recognized else "unrecognized"

            # React Native UI Latch logic (matching our updated HomepageScreen.tsx)
            is_within_latch = (last_recognized_time > 0 and (t_sec - last_recognized_time) < 2.5)
            
            ui_hand_detected = has_hand
            ui_gesture_recognized = False
            
            if status == "success" and predicted_gloss:
                ui_gesture_recognized = True
                last_recognized_time = t_sec
                
                # Check message board addition (1000ms cooldown)
                if last_added_gloss != predicted_gloss or (t_sec - last_added_time) > 1.0:
                    last_added_gloss = predicted_gloss
                    last_added_time = t_sec
                    ui_commitments.append({
                        "time": t_sec,
                        "frame": frame_idx,
                        "gloss": predicted_gloss,
                        "confidence": confidence
                    })
                    print(f"[{t_sec:5.2f}s | Frame {frame_idx:4d}] [COMMIT] MESSAGE BOARD COMMIT: '{predicted_gloss}' ({confidence}%)")
            elif is_within_latch:
                ui_gesture_recognized = True

            ui_active_states.append({
                "time": t_sec,
                "frame": frame_idx,
                "has_hand": ui_hand_detected,
                "is_recognized": ui_gesture_recognized,
                "gloss": predicted_gloss if status == "success" else ("Latched: " + last_added_gloss if is_within_latch else "")
            })

        frame_idx += 1

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    print("\n" + "=" * 90)
    print(f"SUMMARY OF UI GESTURE COMMITMENTS FOR {os.path.basename(video_path)}:")
    print("=" * 90)
    for c in ui_commitments:
        print(f"  • {c['time']:5.2f}s (Frame {c['frame']:4d}): '{c['gloss']}' with {c['confidence']}% confidence")

    print(f"\nTotal Committed Words: {len(ui_commitments)}")

if __name__ == "__main__":
    verify_pipeline()
