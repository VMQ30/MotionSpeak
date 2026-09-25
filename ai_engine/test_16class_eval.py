import os, sys, cv2, numpy as np, tensorflow as tf, mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

TARGET_GLOSSES_16 = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse",
    "background"
]

def test_16class_eval():
    tflite_path = "android/app/src/main/assets/motion_speak_model.tflite"
    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    print(f"Model Input shape: {input_details[0]['shape']}")
    print(f"Model Output shape: {output_details[0]['shape']}")

    cap = cv2.VideoCapture("sample.mp4")
    fps = cap.get(cv2.CAP_PROP_FPS)

    pose_options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="ai_engine/pose_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
    )
    pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="ai_engine/hand_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)

    frame_history = []
    frame_idx = 0
    
    total_evals = 0
    accepted_as_fsl = 0
    classified_as_bg = 0
    rejected_margin_conf = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        frame_idx += 1
        
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

        if has_hand and hand_res.handedness:
            for idx in range(min(len(hand_res.hand_landmarks), len(hand_res.handedness))):
                raw_cat = hand_res.handedness[idx][0].category_name
                h_list = hand_res.hand_landmarks[idx]

                if not is_pose_valid and idx == 0:
                    wrist = h_list[0]
                    mid = h_list[9] if len(h_list) > 9 else wrist
                    hdist = np.sqrt((wrist.x-mid.x)**2 + (wrist.y-mid.y)**2 + (wrist.z-mid.z)**2)
                    center_anchor = [wrist.x, wrist.y + 0.15, wrist.z]
                    scale_factor = max(hdist * 2.2, 0.25)

                offset = 99 if raw_cat.lower() == 'left' else 162

                for h in range(min(21, len(h_list))):
                    lm = h_list[h]
                    features[offset + h*3] = (lm.x - center_anchor[0]) / scale_factor
                    features[offset + h*3+1] = (lm.y - center_anchor[1]) / scale_factor
                    features[offset + h*3+2] = (lm.z - center_anchor[2]) / scale_factor

        if has_hand:
            frame_history.append(features)
            if len(frame_history) > 30:
                frame_history.pop(0)

        if has_hand and len(frame_history) == 30:
            total_evals += 1
            input_tensor = np.expand_dims(np.array(frame_history, dtype=np.float32), axis=0)
            interpreter.set_tensor(input_details[0]['index'], input_tensor)
            interpreter.invoke()
            out = interpreter.get_tensor(output_details[0]['index'])[0]

            indexed = sorted(enumerate(out), key=lambda x: x[1], reverse=True)
            top1_idx, top1_prob = indexed[0]
            top2_idx, top2_prob = indexed[1]
            margin = top1_prob - top2_prob

            top1_gloss = TARGET_GLOSSES_16[top1_idx]
            is_recognized = (top1_prob >= 0.60) and (margin >= 0.25) and (top1_gloss != "background")

            if top1_gloss == "background":
                classified_as_bg += 1
            elif is_recognized:
                accepted_as_fsl += 1
            else:
                rejected_margin_conf += 1

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    print("\n==================================================")
    print("16-CLASS EVALUATION ON sample.mp4 (WITHOUT RETRAINING)")
    print("==================================================")
    print(f"Total Inference Windows: {total_evals}")
    print(f"Classified as 'background' (Class 15): {classified_as_bg} ({classified_as_bg/total_evals*100:.1f}%)")
    print(f"Accepted as valid FSL sign: {accepted_as_fsl} ({accepted_as_fsl/total_evals*100:.1f}%)")
    print(f"Rejected by confidence/margin rule: {rejected_margin_conf} ({rejected_margin_conf/total_evals*100:.1f}%)")
    print(f"Total Non-FSL Rejection Rate: {(classified_as_bg + rejected_margin_conf)/total_evals*100:.1f}%")

if __name__ == "__main__":
    test_16class_eval()
