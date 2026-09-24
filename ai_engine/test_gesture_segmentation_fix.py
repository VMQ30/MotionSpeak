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

def test_gesture_segmentation_on_user_video():
    video_path = "../user_experience.mp4"
    if not os.path.exists(video_path):
        video_path = "user_experience.mp4"

    if not os.path.exists(video_path):
        print(f"Error: {video_path} not found!")
        return

    print("=" * 90)
    print("TESTING MOTION-BASED GESTURE SEGMENTATION & BUFFER RESET ON user_experience.mp4")
    print("=" * 90)

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

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

    step_frames = max(1, int(round(fps * 0.075))) # 75ms step

    active_gesture_buffer = []
    last_wrist_pos = None
    motion_history = []
    
    frame_idx = 0
    events = []

    no_motion_count = 0
    is_in_gesture = False

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
            center_anchor = [0.5, 0.5, 0.0]
            scale_factor = 1.0

            if has_pose:
                p_list = pose_res.pose_landmarks[0]
                l_sh, r_sh = p_list[11], p_list[12]
                cx, cy, cz = (l_sh.x + r_sh.x)/2.0, (l_sh.y + r_sh.y)/2.0, (l_sh.z + r_sh.z)/2.0
                dist = np.sqrt((l_sh.x - r_sh.x)**2 + (l_sh.y - r_sh.y)**2 + (l_sh.z - r_sh.z)**2)

                if 0.05 <= dist <= 0.70 and 0.05 <= cx <= 0.95 and 0.05 <= cy <= 0.95:
                    center_anchor = [cx, cy, cz]
                    scale_factor = max(dist, 0.15)
                    for p in range(min(33, len(p_list))):
                        lm = p_list[p]
                        feat[p*3] = (lm.x - center_anchor[0]) / scale_factor
                        feat[p*3+1] = (lm.y - center_anchor[1]) / scale_factor
                        feat[p*3+2] = (lm.z - center_anchor[2]) / scale_factor

            current_wrist_pos = None
            if has_hand and hand_res.handedness:
                for idx in range(min(len(hand_res.hand_landmarks), len(hand_res.handedness))):
                    raw_cat = hand_res.handedness[idx][0].category_name
                    h_list = hand_res.hand_landmarks[idx]
                    off = 99 if raw_cat.lower() == "left" else 162

                    if idx == 0:
                        current_wrist_pos = np.array([h_list[0].x, h_list[0].y, h_list[0].z], dtype=np.float32)

                    for h in range(min(21, len(h_list))):
                        lm = h_list[h]
                        feat[off + h*3] = (lm.x - center_anchor[0]) / scale_factor
                        feat[off + h*3+1] = (lm.y - center_anchor[1]) / scale_factor
                        feat[off + h*3+2] = (lm.z - center_anchor[2]) / scale_factor

            # Hand Motion Velocity Calculation
            hand_velocity = 0.0
            if current_wrist_pos is not None and last_wrist_pos is not None:
                hand_velocity = float(np.linalg.norm(current_wrist_pos - last_wrist_pos))
            last_wrist_pos = current_wrist_pos if current_wrist_pos is not None else last_wrist_pos

            # Active Gesture Motion State Machine
            is_active_motion = has_hand and (hand_velocity > 0.015 or len(active_gesture_buffer) > 0)

            t_sec = frame_idx / fps

            if has_hand:
                # Gesture start detection: if buffer was empty and velocity is active, start new gesture segment
                if len(active_gesture_buffer) == 0 and hand_velocity > 0.015:
                    is_in_gesture = True

                active_gesture_buffer.append(feat)

                # If buffer exceeds 30 frames, keep last 30
                if len(active_gesture_buffer) > 30:
                    active_gesture_buffer.pop(0)

                # Run inference on active gesture buffer if length >= 5
                if len(active_gesture_buffer) >= 5:
                    cnt = len(active_gesture_buffer)
                    inp = np.zeros((1, 30, 225), dtype=np.float32)
                    for i in range(30):
                        s_idx = (i * cnt) // 30
                        inp[0, i] = active_gesture_buffer[min(s_idx, cnt - 1)]

                    interpreter.set_tensor(input_details[0]['index'], inp)
                    interpreter.invoke()
                    out = interpreter.get_tensor(output_details[0]['index'])[0]

                    top = sorted(enumerate(out), key=lambda x: x[1], reverse=True)
                    top1_gloss = TARGET_GLOSSES[top[0][0]]
                    top1_prob = top[0][1] * 100

                    if hand_velocity < 0.010:
                        no_motion_count += 1
                    else:
                        no_motion_count = 0

                    events.append({
                        "time": t_sec,
                        "frame": frame_idx,
                        "buffer_len": cnt,
                        "velocity": hand_velocity,
                        "top1": top1_gloss,
                        "prob": top1_prob,
                        "no_motion": no_motion_count
                    })

                    # If hand stops moving for 3 consecutive frames (gesture finished!), commit prediction & reset buffer
                    if no_motion_count >= 3 and top1_prob >= 50.0:
                        events.append({
                            "time": t_sec,
                            "frame": frame_idx,
                            "event": "GESTURE_COMMIT",
                            "gloss": format_gloss_text(top1_gloss),
                            "confidence": f"{top1_prob:.1f}%"
                        })
                        active_gesture_buffer.clear()
                        no_motion_count = 0

            else:
                # Hand lost: commit best prediction if buffer had >= 5 frames, then clear
                if len(active_gesture_buffer) >= 5:
                    cnt = len(active_gesture_buffer)
                    inp = np.zeros((1, 30, 225), dtype=np.float32)
                    for i in range(30):
                        s_idx = (i * cnt) // 30
                        inp[0, i] = active_gesture_buffer[min(s_idx, cnt - 1)]

                    interpreter.set_tensor(input_details[0]['index'], inp)
                    interpreter.invoke()
                    out = interpreter.get_tensor(output_details[0]['index'])[0]
                    top = sorted(enumerate(out), key=lambda x: x[1], reverse=True)
                    top1_gloss = TARGET_GLOSSES[top[0][0]]
                    top1_prob = top[0][1] * 100

                    if top1_prob >= 50.0:
                        events.append({
                            "time": t_sec,
                            "frame": frame_idx,
                            "event": "GESTURE_COMMIT_ON_RELEASE",
                            "gloss": format_gloss_text(top1_gloss),
                            "confidence": f"{top1_prob:.1f}%"
                        })

                active_gesture_buffer.clear()
                no_motion_count = 0

        frame_idx += 1

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    print("\n--- DETECTED GESTURE COMMIT EVENTS ON USER EXPERIENCE VIDEO ---")
    commits = [e for e in events if "event" in e]
    for c in commits:
        print(f"  [{c['time']:5.2f}s | Frame {c['frame']:3d}] Event: {c['event']} -> Committed Gloss: '{c['gloss']}' ({c['confidence']})")

if __name__ == "__main__":
    test_gesture_segmentation_on_user_video()
