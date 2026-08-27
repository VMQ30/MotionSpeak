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
    sample_path = "../sample.mp4"
    if not os.path.exists(sample_path):
        sample_path = "sample.mp4"

    cap = cv2.VideoCapture(sample_path)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0

    print("=" * 80)
    print("ACTUAL sample.mp4 METADATA & MULTI-ANGLE MEDIAPIPE DIAGNOSIS")
    print("=" * 80)
    print(f"Path: {os.path.abspath(sample_path)}")
    print(f"Resolution: {w} x {h}")
    print(f"Aspect Ratio: {w/h:.3f}")
    print(f"FPS: {fps:.2f}")
    print(f"Total Frames: {total_frames}")
    print(f"Duration: {duration:.2f} seconds")

    os.makedirs("actual_sample_frames", exist_ok=True)

    # Save representative frames from different parts of the video (start, 25%, 50%, 75%, 90%)
    sample_indices = [0, 50, 150, 300, 450, 600, 750, 850]
    for idx in sample_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret:
            cv2.imwrite(f"actual_sample_frames/frame_{idx:03d}.jpg", frame)
            print(f"Saved frame_{idx:03d}.jpg -> Shape: {frame.shape}")

    cap.release()

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

    tflite_path = "motion_speak_model.tflite"
    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    print("\n--- Testing MediaPipe Detection & Inference at 0°, 90°, 180°, 270° on sample.mp4 ---")

    for angle in [0, 90, 180, 270]:
        cap = cv2.VideoCapture(sample_path)
        frame_history = []
        no_hand_count = 0
        pose_cnt = 0
        hand_cnt = 0
        all_preds = []
        frame_idx = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            img = frame.copy()
            if angle == 90:
                img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
            elif angle == 180:
                img = cv2.rotate(img, cv2.ROTATE_180)
            elif angle == 270:
                img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            pose_res = pose_landmarker.detect(mp_img)
            hand_res = hand_landmarker.detect(mp_img)

            has_pose = bool(pose_res.pose_landmarks and len(pose_res.pose_landmarks) > 0)
            has_hand = bool(hand_res.hand_landmarks and len(hand_res.hand_landmarks) > 0)

            if has_pose:
                pose_cnt += 1
            if has_hand:
                hand_cnt += 1

            features = np.zeros(225, dtype=np.float32)
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

                if 0.10 <= dist <= 0.70 and 0.15 <= cx <= 0.85 and 0.15 <= cy <= 0.85:
                    center_anchor = [cx, cy, cz]
                    scale_factor = max(dist, 0.18)
                    is_pose_valid = True

                    for p in range(min(33, len(p_list))):
                        lm = p_list[p]
                        features[p*3] = (lm.x - center_anchor[0]) / scale_factor
                        features[p*3+1] = (lm.y - center_anchor[1]) / scale_factor
                        features[p*3+2] = (lm.z - center_anchor[2]) / scale_factor

            if has_hand and hand_res.handedness:
                for h_idx in range(min(len(hand_res.hand_landmarks), len(hand_res.handedness))):
                    raw_cat = hand_res.handedness[h_idx][0].category_name
                    h_list = hand_res.hand_landmarks[h_idx]

                    if not is_pose_valid and h_idx == 0:
                        wrist = h_list[0]
                        mid = h_list[9] if len(h_list) > 9 else wrist
                        hdist = np.sqrt((wrist.x-mid.x)**2 + (wrist.y-mid.y)**2 + (wrist.z-mid.z)**2)
                        center_anchor = [wrist.x, wrist.y + 0.15, wrist.z]
                        scale_factor = max(hdist * 2.2, 0.25)

                    # Swap handedness for front camera
                    effective_cat = "Right" if raw_cat.lower() == "left" else "Left"
                    offset = 99 if effective_cat.lower() == "left" else 162

                    for h in range(min(21, len(h_list))):
                        lm = h_list[h]
                        features[offset + h*3] = (lm.x - center_anchor[0]) / scale_factor
                        features[offset + h*3+1] = (lm.y - center_anchor[1]) / scale_factor
                        features[offset + h*3+2] = (lm.z - center_anchor[2]) / scale_factor

            if not has_hand:
                no_hand_count += 1
                if no_hand_count > 10:
                    frame_history.clear()
            else:
                no_hand_count = 0
                frame_history.append(features)
                if len(frame_history) > 30:
                    frame_history.pop(0)

            if len(frame_history) >= 6:
                input_tensor = np.zeros((1, 30, 225), dtype=np.float32)
                count = len(frame_history)
                for i in range(30):
                    src_idx = (i * count) // 30
                    input_tensor[0, i] = frame_history[min(src_idx, count - 1)]

                interpreter.set_tensor(input_details[0]['index'], input_tensor)
                interpreter.invoke()
                out = interpreter.get_tensor(output_details[0]['index'])[0]
                top_c = np.argmax(out)
                all_preds.append((frame_idx, TARGET_GLOSSES[top_c], out[top_c], out))

            frame_idx += 1

        cap.release()

        print(f"\nAngle {angle:3d}° -> Frame Shape: ({h}, {w})")
        print(f"  Pose Detected: {pose_cnt} / {total_frames} ({pose_cnt/total_frames*100:.1f}%)")
        print(f"  Hand Detected: {hand_cnt} / {total_frames} ({hand_cnt/total_frames*100:.1f}%)")

        if all_preds:
            best_pred = max(all_preds, key=lambda x: x[2])
            print(f"  Max Confidence Prediction: Frame {best_pred[0]} -> '{best_pred[1]}' ({best_pred[2]*100:.2f}%)")
            top3 = sorted(enumerate(best_pred[3]), key=lambda x: x[1], reverse=True)[:3]
            print(f"  Top 3 at Frame {best_pred[0]}:")
            for r, (c, p) in enumerate(top3, 1):
                print(f"    Rank {r}: {TARGET_GLOSSES[c]:12s} -> {p*100:6.2f}%")

if __name__ == "__main__":
    main()
