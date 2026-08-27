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

def main():
    tflite_path = "motion_speak_model.tflite"
    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    def process_video_with_fixed_pipeline(video_path, is_front_camera=True):
        if not os.path.exists(video_path):
            return None

        pose_options = vision.PoseLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path=os.path.abspath("pose_landmarker.task")),
            running_mode=vision.RunningMode.IMAGE,
        )
        pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

        hand_options = vision.HandLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path=os.path.abspath("hand_landmarker.task")),
            running_mode=vision.RunningMode.IMAGE,
            num_hands=2,
        )
        hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)

        cap = cv2.VideoCapture(video_path)
        frame_history = []
        total_frames = 0
        hand_detected_frames = 0
        pose_detected_frames = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            total_frames += 1

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

            if has_pose:
                pose_detected_frames += 1
            if has_hand:
                hand_detected_frames += 1

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

                    # Single Swap for front camera:
                    effective_cat = ("Right" if raw_cat.lower() == "left" else "Left") if is_front_camera else raw_cat
                    offset = 99 if effective_cat.lower() == "left" else 162

                    for h in range(min(21, len(h_list))):
                        lm = h_list[h]
                        features[offset + h*3] = (lm.x - center_anchor[0]) / scale_factor
                        features[offset + h*3+1] = (lm.y - center_anchor[1]) / scale_factor
                        features[offset + h*3+2] = (lm.z - center_anchor[2]) / scale_factor

            if has_hand:
                frame_history.append(features)
                if len(frame_history) > 30:
                    frame_history.pop(0)

        pose_landmarker.close()
        hand_landmarker.close()

        if len(frame_history) < 6:
            return {
                "gloss": "No Hand",
                "confidence": 0.0,
                "hand_frames": hand_detected_frames,
                "total_frames": total_frames,
                "top3": []
            }

        input_tensor = np.zeros((1, 30, 225), dtype=np.float32)
        count = len(frame_history)
        for i in range(30):
            src_idx = (i * count) // 30
            input_tensor[0, i] = frame_history[min(src_idx, count - 1)]

        interpreter.set_tensor(input_details[0]['index'], input_tensor)
        interpreter.invoke()
        out = interpreter.get_tensor(output_details[0]['index'])[0]

        top_cls = np.argmax(out)
        top_prob = out[top_cls]

        return {
            "gloss": TARGET_GLOSSES[top_cls],
            "confidence": float(top_prob * 100),
            "hand_frames": hand_detected_frames,
            "pose_frames": pose_detected_frames,
            "total_frames": total_frames,
            "top3": [(TARGET_GLOSSES[idx], float(out[idx]*100)) for idx in np.argsort(out)[::-1][:3]]
        }

    print("=" * 70)
    print("VALIDATING FIXED PIPELINE ON sample.mp4 AND DATASET VIDEOS")
    print("=" * 70)

    # Test sample.mp4
    sample_path = "../sample.mp4"
    if not os.path.exists(sample_path): sample_path = "sample.mp4"
    res_sample = process_video_with_fixed_pipeline(sample_path)
    print("\nResult on sample.mp4 (Root Directory):")
    if res_sample:
        print(f"  Predicted Gloss: '{res_sample['gloss']}'")
        print(f"  Confidence:      {res_sample['confidence']:.2f}%")
        print(f"  Hand Frames:     {res_sample['hand_frames']} / {res_sample['total_frames']}")
        print(f"  Top 3:           {res_sample['top3']}")

    # Test representative dataset videos
    test_folders = ["Hello", "Yes", "No", "Sorry", "please", "thankyou", "Good"]
    print("\nResult on Representative Dataset Videos:")
    for folder in test_folders:
        fpath = f"dataset/new_videos/{folder}"
        if os.path.exists(fpath):
            files = [f for f in os.listdir(fpath) if f.endswith(".mp4")][:2]
            for fname in files:
                full_p = os.path.join(fpath, fname)
                r = process_video_with_fixed_pipeline(full_p, is_front_camera=False)
                if r:
                    print(f"  {folder}/{fname}: Expected='{folder.lower()}', Got='{r['gloss']}' ({r['confidence']:.1f}%) | Hand={r['hand_frames']}/{r['total_frames']}")

if __name__ == "__main__":
    main()
