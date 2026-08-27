import os
import cv2
import json
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
    video_path = "../sample.mp4"
    if not os.path.exists(video_path):
        video_path = "sample.mp4"
    if not os.path.exists(video_path):
        print(f"Error: {video_path} not found")
        return

    cap = cv2.VideoCapture(video_path)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0

    print("=" * 60)
    print("1. INSPECTING sample.mp4 METADATA & PROPERTIES")
    print("=" * 60)
    print(f"File: {os.path.abspath(video_path)}")
    print(f"Resolution: {width} x {height}")
    print(f"Aspect Ratio: {width/height:.3f} ({width}:{height})")
    print(f"FPS: {fps:.2f}")
    print(f"Total Frames: {total_frames}")
    print(f"Duration: {duration:.2f} seconds")

    os.makedirs("sample_frames", exist_ok=True)

    # Save representative frames
    sample_indices = [0, total_frames // 4, total_frames // 2, (3 * total_frames) // 4, total_frames - 1]
    for idx in sample_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret:
            cv2.imwrite(f"sample_frames/frame_{idx:03d}.jpg", frame)
            print(f"Saved frame_{idx:03d}.jpg (Shape: {frame.shape})")

    cap.release()

    # Init MediaPipe models
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

    # Function to simulate Android MotionSpeakAIModule preprocessing on a bitmap/frame
    def process_frame_android_style(frame, facing_front=True, apply_android_transform=True):
        # In Android MotionSpeakCameraView:
        # 1. TextureView bitmap is 640x480 (or frame dimensions).
        # 2. Rotation 90 degrees clockwise (if facingFront or sensorOrientation=90)
        # 3. Horizontal flip (if facingFront)
        img = frame.copy()
        if apply_android_transform:
            # Rotate 90 CW
            img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
            if facing_front:
                # Horizontal flip
                img = cv2.flip(img, 1)

        rgb_frame = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        pose_result = pose_landmarker.detect(mp_image)
        hand_result = hand_landmarker.detect(mp_image)

        frame_features = np.zeros(225, dtype=np.float32)
        is_hand_detected = False

        center_anchor_x, center_anchor_y, center_anchor_z = 0.5, 0.5, 0.0
        scale_factor = 1.0
        is_pose_valid = False

        # 1. Pose landmark processing (0..98)
        if pose_result.pose_landmarks and len(pose_result.pose_landmarks) > 0 and len(pose_result.pose_landmarks[0]) > 12:
            pose_list = pose_result.pose_landmarks[0]
            left_shoulder = pose_list[11]
            right_shoulder = pose_list[12]

            cand_x = (left_shoulder.x + right_shoulder.x) / 2.0
            cand_y = (left_shoulder.y + right_shoulder.y) / 2.0
            cand_z = (left_shoulder.z + right_shoulder.z) / 2.0

            dx = left_shoulder.x - right_shoulder.x
            dy = left_shoulder.y - right_shoulder.y
            dz = left_shoulder.z - right_shoulder.z
            shoulder_dist = np.sqrt(dx*dx + dy*dy + dz*dz)

            if 0.10 <= shoulder_dist <= 0.70 and 0.15 <= cand_x <= 0.85 and 0.15 <= cand_y <= 0.85:
                center_anchor_x, center_anchor_y, center_anchor_z = cand_x, cand_y, cand_z
                scale_factor = max(shoulder_dist, 0.18)
                is_pose_valid = True

                for p in range(min(33, len(pose_list))):
                    lm = pose_list[p]
                    frame_features[p*3] = (lm.x - center_anchor_x) / scale_factor
                    frame_features[p*3+1] = (lm.y - center_anchor_y) / scale_factor
                    frame_features[p*3+2] = (lm.z - center_anchor_z) / scale_factor

        # 2. Hand landmark processing (99..161 left, 162..224 right)
        if hand_result.hand_landmarks and hand_result.handedness:
            is_hand_detected = True

            for idx in range(min(len(hand_result.hand_landmarks), len(hand_result.handedness))):
                raw_category = hand_result.handedness[idx][0].category_name
                hand_list = hand_result.hand_landmarks[idx]

                if not is_pose_valid and idx == 0:
                    wrist = hand_list[0]
                    middle_mcp = hand_list[9] if len(hand_list) > 9 else wrist
                    hdx = wrist.x - middle_mcp.x
                    hdy = wrist.y - middle_mcp.y
                    hdz = wrist.z - middle_mcp.z
                    hand_length = np.sqrt(hdx*hdx + hdy*hdy + hdz*hdz)

                    center_anchor_x = wrist.x
                    center_anchor_y = wrist.y + 0.15
                    center_anchor_z = wrist.z
                    scale_factor = max(hand_length * 2.2, 0.25)

                effective_category = ("Right" if raw_category.lower() == "left" else "Left") if facing_front else raw_category
                offset = 99 if effective_category.lower() == "left" else 162

                for h in range(min(21, len(hand_list))):
                    lm = hand_list[h]
                    frame_features[offset + h*3] = (lm.x - center_anchor_x) / scale_factor
                    frame_features[offset + h*3+1] = (lm.y - center_anchor_y) / scale_factor
                    frame_features[offset + h*3+2] = (lm.z - center_anchor_z) / scale_factor

        return frame_features, is_hand_detected, is_pose_valid, hand_result, pose_result, img

    # Evaluate multiple pipeline variations on sample.mp4
    print("\n" + "=" * 60)
    print("2. TESTING PIPELINE VARIATIONS ON sample.mp4")
    print("=" * 60)

    configs = [
        ("Android Native Default (Rotate 90 CW + Flip Horizontal + Front Hand Swap)", True, True),
        ("Raw Frame (No Rotate, No Flip, Facing Front Hand Swap)", True, False),
        ("Rotate 90 CW (No Flip, Front Hand Swap)", False, True),
        ("Rotate 90 CCW (No Flip)", False, False),
    ]

    tflite_path = "motion_speak_model.tflite"
    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    for config_name, facing_front, apply_transform in configs:
        cap = cv2.VideoCapture(video_path)
        frame_history = []
        no_hand_count = 0
        detections = []
        predictions = []

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            features, is_hand, is_pose, hand_res, pose_res, transformed_img = process_frame_android_style(
                frame, facing_front=facing_front, apply_android_transform=apply_transform
            )

            if not is_hand:
                no_hand_count += 1
                if no_hand_count > 10:
                    frame_history.clear()
            else:
                no_hand_count = 0
                frame_history.append(features)
                if len(frame_history) > 30:
                    frame_history.pop(0)

            raw_hands = [h[0].category_name for h in hand_res.handedness] if (hand_res and hand_res.handedness) else []
            detections.append((is_hand, is_pose, raw_hands))

            if len(frame_history) >= 6:
                # Build history input tensor (resampled to 30 frames)
                input_tensor = np.zeros((1, 30, 225), dtype=np.float32)
                count = len(frame_history)
                for i in range(30):
                    src_idx = (i * count) // 30
                    input_tensor[0, i] = frame_history[min(src_idx, count - 1)]

                interpreter.set_tensor(input_details[0]['index'], input_tensor)
                interpreter.invoke()
                output = interpreter.get_tensor(output_details[0]['index'])[0]

                top1_idx = np.argmax(output)
                top1_conf = output[top1_idx]
                predictions.append((top1_idx, top1_conf, output))
            else:
                predictions.append((-1, 0.0, None))

        cap.release()

        hand_det_count = sum(1 for d in detections if d[0])
        pose_det_count = sum(1 for d in detections if d[1])
        valid_preds = [p for p in predictions if p[0] != -1]
        
        print(f"\n--- Configuration: {config_name} ---")
        print(f"  Hand Detected Frames: {hand_det_count} / {len(detections)} ({hand_det_count/len(detections)*100:.1f}%)")
        print(f"  Pose Detected Frames: {pose_det_count} / {len(detections)} ({pose_det_count/len(detections)*100:.1f}%)")

        if valid_preds:
            # Look at frame with highest confidence prediction
            best_pred = max(valid_preds, key=lambda x: x[1])
            best_gloss = TARGET_GLOSSES[best_pred[0]]
            print(f"  Max Confidence Pred: Gloss='{best_gloss}' ({best_pred[1]*100:.2f}%)")

            # Look at final frame prediction
            last_pred = valid_preds[-1]
            last_gloss = TARGET_GLOSSES[last_pred[0]]
            print(f"  Final Frame Pred:    Gloss='{last_gloss}' ({last_pred[1]*100:.2f}%)")

            # Top 3 at max confidence frame
            indexed = sorted(enumerate(best_pred[2]), key=lambda x: x[1], reverse=True)
            print("  Top 3 Glosses at Max Confidence Frame:")
            for rank, (c_idx, prob) in enumerate(indexed[:3], 1):
                print(f"    Rank {rank}: {TARGET_GLOSSES[c_idx]:12s} -> {prob*100:6.2f}%")

if __name__ == "__main__":
    main()
