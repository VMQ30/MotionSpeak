import os
import glob
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

def analyze_video(video_path, name):
    print(f"\n==================================================")
    print(f"ANALYZING VIDEO: {name} ({video_path})")
    print(f"==================================================")

    if not os.path.exists(video_path):
        print(f"File not found: {video_path}")
        return None

    cap = cv2.VideoCapture(video_path)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0

    print(f"Resolution: {w} x {h} (Aspect Ratio: {w/h:.2f})")
    print(f"FPS: {fps:.2f}, Total Frames: {total_frames}, Duration: {duration:.2f}s")

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

    frames_keypoints = []
    pose_detected_count = 0
    hand_detected_count = 0
    handedness_counts = {"Left": 0, "Right": 0}

    anchor_xs, anchor_ys, scale_factors = [], [], []
    rh_active_counts, lh_active_counts = 0, 0

    frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        pose_result = pose_landmarker.detect(mp_image)
        hand_result = hand_landmarker.detect(mp_image)

        pose = np.zeros((33, 3))
        lh = np.zeros((21, 3))
        rh = np.zeros((21, 3))

        has_pose = pose_result.pose_landmarks and len(pose_result.pose_landmarks) > 0
        has_hand = hand_result.hand_landmarks and len(hand_result.hand_landmarks) > 0

        if has_pose:
            pose_detected_count += 1
            pose_lms = pose_result.pose_landmarks[0]
            pose = np.array([[lm.x, lm.y, lm.z] for lm in pose_lms])
            left_shoulder, right_shoulder = pose[11], pose[12]
            center_anchor = (left_shoulder + right_shoulder) / 2.0
            shoulder_dist = np.linalg.norm(left_shoulder - right_shoulder)
            scale_factor = shoulder_dist if shoulder_dist > 1e-6 else 1.0

            anchor_xs.append(center_anchor[0])
            anchor_ys.append(center_anchor[1])
            scale_factors.append(scale_factor)

            pose = (pose - center_anchor) / scale_factor

        if has_hand:
            hand_detected_count += 1
            for idx, hand_info in enumerate(hand_result.handedness):
                label = hand_info[0].category_name
                handedness_counts[label] = handedness_counts.get(label, 0) + 1
                raw_hand = np.array([[lm.x, lm.y, lm.z] for lm in hand_result.hand_landmarks[idx]])

                if has_pose:
                    norm_hand = (raw_hand - center_anchor) / scale_factor
                else:
                    norm_hand = raw_hand

                if label == "Left":
                    lh = norm_hand
                    lh_active_counts += 1
                elif label == "Right":
                    rh = norm_hand
                    rh_active_counts += 1

        kp = np.concatenate([pose.flatten(), lh.flatten(), rh.flatten()])
        frames_keypoints.append(kp)
        frame_idx += 1

    cap.release()

    print(f"\nLandmark Detection Summary:")
    print(f"  Pose Detected: {pose_detected_count}/{total_frames} frames ({pose_detected_count/total_frames*100:.1f}%)")
    print(f"  Hand Detected: {hand_detected_count}/{total_frames} frames ({hand_detected_count/total_frames*100:.1f}%)")
    print(f"  Handedness Breakdown: {handedness_counts}")
    print(f"  Active Slots: LH={lh_active_counts} frames, RH={rh_active_counts} frames")

    if anchor_xs:
        print(f"  Anchor Stats:")
        print(f"    Center X: min={min(anchor_xs):.3f}, max={max(anchor_xs):.3f}, avg={np.mean(anchor_xs):.3f}")
        print(f"    Center Y: min={min(anchor_ys):.3f}, max={max(anchor_ys):.3f}, avg={np.mean(anchor_ys):.3f}")
        print(f"    Scale Factor (Shoulder Dist): min={min(scale_factors):.3f}, max={max(scale_factors):.3f}, avg={np.mean(scale_factors):.3f}")

    # Evaluate Model on sampled 30-frame sequence
    if len(frames_keypoints) > 0:
        indices = np.linspace(0, len(frames_keypoints) - 1, 30, dtype=int)
        sampled_kp = np.array([frames_keypoints[i] for i in indices])
        input_data = np.expand_dims(sampled_kp, axis=0).astype(np.float32)

        interpreter = tf.lite.Interpreter(model_path="motion_speak_model.tflite")
        interpreter.allocate_tensors()
        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()

        interpreter.set_tensor(input_details[0]['index'], input_data)
        interpreter.invoke()
        output = interpreter.get_tensor(output_details[0]['index'])[0]

        indexed_probs = sorted(enumerate(output), key=lambda x: x[1], reverse=True)
        print(f"\nModel Prediction (Standard prep_data.py extraction):")
        for rank, (cls_idx, prob) in enumerate(indexed_probs[:5], 1):
            gloss = TARGET_GLOSSES[cls_idx]
            print(f"  Rank {rank}: {gloss:12s} ({prob * 100:6.2f}%)")

    return frames_keypoints

def main():
    # 1. Analyze Training Videos in dataset/new_videos/Sorry
    training_sorry_vids = sorted(glob.glob("dataset/new_videos/Sorry/*.mp4"))[:3]
    for i, vid in enumerate(training_sorry_vids):
        analyze_video(vid, f"TRAINING VIDEO {i+1} (dataset/new_videos/Sorry/{os.path.basename(vid)})")

    # 2. Analyze Test Videos in Root Directory
    analyze_video("../sample.mp4", "TEST VIDEO 1 (sample.mp4)")
    analyze_video("../sample_2.mp4", "TEST VIDEO 2 (sample_2.mp4)")

if __name__ == "__main__":
    main()
