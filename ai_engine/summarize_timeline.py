import os, sys, cv2, numpy as np, tensorflow as tf, mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse"
]

def summarize():
    video_path = os.path.abspath("sample.mp4")
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total_frames / fps

    pose_options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=os.path.abspath("ai_engine/pose_landmarker.task")),
        running_mode=vision.RunningMode.IMAGE,
    )
    pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=os.path.abspath("ai_engine/hand_landmarker.task")),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)

    tflite_path = os.path.abspath("android/app/src/main/assets/motion_speak_model.tflite")
    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    frame_idx = 0
    frame_history = []
    records = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1
        ts = frame_idx / fps

        img = frame.copy()
        fh, fw = img.shape[:2]
        max_dim = max(fh, fw)
        pad_w = (max_dim - fw) // 2
        pad_h = (max_dim - fh) // 2
        square_frame = cv2.copyMakeBorder(img, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])

        rgb = cv2.cvtColor(square_frame, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        pose_res = pose_landmarker.detect(mp_img)
        hand_res = hand_landmarker.detect(mp_img)

        features = np.zeros(225, dtype=np.float32)
        has_pose = bool(pose_res.pose_landmarks and len(pose_res.pose_landmarks) > 0)
        has_hand = bool(hand_res.hand_landmarks and len(hand_res.hand_landmarks) > 0)

        center_anchor = [0.5, 0.5, 0.0]
        scale_factor = 1.0
        is_pose_valid = False

        if has_pose and len(pose_res.pose_landmarks[0]) > 12:
            p_list = pose_res.pose_landmarks[0]
            l_sh = p_list[11]
            r_sh = p_list[12]
            cx = (l_sh.x + r_sh.x) / 2.0
            cy = (l_sh.y + r_sh.y) / 2.0
            cz = (l_sh.z + r_sh.z) / 2.0
            dist = np.sqrt((l_sh.x - r_sh.x)**2 + (l_sh.y - r_sh.y)**2 + (l_sh.z - r_sh.z)**2)

            if 0.05 <= dist <= 0.70 and 0.05 <= cx <= 0.95 and 0.05 <= cy <= 0.95:
                center_anchor = [cx, cy, cz]
                scale_factor = max(dist, 0.15)
                is_pose_valid = True

                for p in range(min(33, len(p_list))):
                    lm = p_list[p]
                    features[p*3] = (lm.x - center_anchor[0]) / scale_factor
                    features[p*3+1] = (lm.y - center_anchor[1]) / scale_factor
                    features[p*3+2] = (lm.z - center_anchor[2]) / scale_factor

        detected_handedness = []
        if has_hand and hand_res.handedness:
            for idx in range(min(len(hand_res.hand_landmarks), len(hand_res.handedness))):
                raw_cat = hand_res.handedness[idx][0].category_name
                detected_handedness.append(raw_cat)
                h_list = hand_res.hand_landmarks[idx]

                if not is_pose_valid and idx == 0:
                    wrist = h_list[0]
                    mid = h_list[9] if len(h_list) > 9 else wrist
                    hdist = np.sqrt((wrist.x-mid.x)**2 + (wrist.y-mid.y)**2 + (wrist.z-mid.z)**2)
                    center_anchor = [wrist.x, wrist.y + 0.15, wrist.z]
                    scale_factor = max(hdist * 2.2, 0.25)

                offset = 99 if raw_cat.lower() == "left" else 162

                for h in range(min(21, len(h_list))):
                    lm = h_list[h]
                    features[offset + h*3] = (lm.x - center_anchor[0]) / scale_factor
                    features[offset + h*3+1] = (lm.y - center_anchor[1]) / scale_factor
                    features[offset + h*3+2] = (lm.z - center_anchor[2]) / scale_factor

        if has_hand:
            frame_history.append(features)
            if len(frame_history) > 30:
                frame_history.pop(0)

        if not has_hand:
            records.append((ts, "No Hand", 0.0, "No Hand", 0.0, 0.0, False, "No Hand", False))
        elif len(frame_history) < 30:
            records.append((ts, "Scanning", 0.0, "Scanning", 0.0, 0.0, False, "Scanning...", True))
        else:
            input_tensor = np.expand_dims(np.array(frame_history, dtype=np.float32), axis=0)
            interpreter.set_tensor(input_details[0]['index'], input_tensor)
            interpreter.invoke()
            out = interpreter.get_tensor(output_details[0]['index'])[0]

            indexed = sorted(enumerate(out), key=lambda x: x[1], reverse=True)
            top1_idx, top1_prob = indexed[0]
            top2_idx, top2_prob = indexed[1]
            margin = top1_prob - top2_prob
            is_accepted = (top1_prob >= 0.60) and (margin >= 0.25)
            gloss_out = TARGET_GLOSSES[top1_idx] if is_accepted else "Unknown"

            records.append((ts, TARGET_GLOSSES[top1_idx], float(top1_prob), TARGET_GLOSSES[top2_idx], float(top2_prob), float(margin), is_accepted, gloss_out, True))

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    # Bucket timeline by 2-second windows
    step = 2.0
    for t_start in np.arange(0, duration, step):
        t_end = min(t_start + step, duration)
        window_recs = [r for r in records if t_start <= r[0] < t_end]
        if not window_recs:
            continue
        
        hands_in_win = sum(1 for r in window_recs if r[8])
        accepted_in_win = [r for r in window_recs if r[6]]
        
        if hands_in_win == 0:
            desc = "Hand not present | Prediction: none"
        elif not accepted_in_win:
            desc = "Hand present (nonsensical movement) | Rejection: Scanning... / Unknown"
        else:
            top_glosses = [r[7] for r in accepted_in_win]
            top_gloss = max(set(top_glosses), key=top_glosses.count)
            avg_p1 = np.mean([r[2] for r in accepted_in_win if r[7] == top_gloss])
            desc = f"Nonsensical movement | Prediction: {top_gloss} ({avg_p1*100:.0f}%) [ACCEPTED]"
            
        print(f"{t_start:4.1f}s – {t_end:4.1f}s | {desc}")

if __name__ == "__main__":
    summarize()
