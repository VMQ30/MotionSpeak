"""Prepare sign-language keypoint data from video files for model training.

The script uses MediaPipe pose and hand landmarkers to extract normalized
keypoint features from each video, resamples the sequence length to a fixed
value, and stores the processed samples in a JSON dataset index.
"""

import json
import os

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# 1. Configure Pose & Hand Landmarkers
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


def normalize_and_extract(pose_result, hand_result):
    """Normalize pose and hand landmarks into a fixed keypoint feature vector.

    Args:
        pose_result: The MediaPipe pose detection result for a single image.
        hand_result: The MediaPipe hand detection result for a single image.

    Returns:
        A flattened numpy array containing normalized pose and hand keypoints.
        If no pose is detected, returns an all-zero feature vector.
    """
    pose = np.zeros((33, 3))
    lh = np.zeros((21, 3))
    rh = np.zeros((21, 3))

    # Check if pose landmarks exist
    if not pose_result.pose_landmarks or len(pose_result.pose_landmarks) == 0:
        # Return all zeroes if pose isn't detected to keep coordinate scale uniform
        return np.concatenate([pose.flatten(), lh.flatten(), rh.flatten()])

    pose = np.array([[lm.x, lm.y, lm.z] for lm in pose_result.pose_landmarks[0]])

    left_shoulder, right_shoulder = pose[11], pose[12]
    center_anchor = (left_shoulder + right_shoulder) / 2.0
    shoulder_dist = np.linalg.norm(left_shoulder - right_shoulder)
    scale_factor = shoulder_dist if shoulder_dist > 1e-6 else 1.0

    # Normalize Pose
    pose = (pose - center_anchor) / scale_factor

    # Normalize Hands relative to the same anchor & scale
    if hand_result.hand_landmarks and hand_result.handedness:
        for idx, hand_info in enumerate(hand_result.handedness):
            label = hand_info[0].category_name
            raw_hand = np.array(
                [[lm.x, lm.y, lm.z] for lm in hand_result.hand_landmarks[idx]]
            )
            norm_hand = (raw_hand - center_anchor) / scale_factor

            if label == "Left":
                lh = norm_hand
            elif label == "Right":
                rh = norm_hand

    return np.concatenate([pose.flatten(), lh.flatten(), rh.flatten()])


# Load JSON metadata
with open("dataset/WLASL_v0.3.json", "r") as f:
    wlasl_data = json.load(f)

TARGET_GLOSSES = [
    "hello",
    "yes",
    "no",
    "good",
    "bad",
    "what",
    "thank you",
    "welcome",
    "please",
    "sorry",
    "goodbye",
    "morning",
    "afternoon",
    "evening",
    "excuse",
]
SEQUENCE_LENGTH = 30  # Fixed 30 frames per sign

os.makedirs("processed_data", exist_ok=True)
processed_samples = []

for entry in wlasl_data:
    gloss = entry["gloss"]
    if gloss in TARGET_GLOSSES:
        label_idx = TARGET_GLOSSES.index(gloss)
        for idx, instance in enumerate(entry["instances"]):
            video_path = f"dataset/videos/{instance['video_id']}.mp4"
            if not os.path.exists(video_path):
                continue

            cap = cv2.VideoCapture(video_path)
            frames_keypoints = []

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

                pose_result = pose_landmarker.detect(mp_image)
                hand_result = hand_landmarker.detect(mp_image)

                keypoints = normalize_and_extract(pose_result, hand_result)
                frames_keypoints.append(keypoints)

            cap.release()

            if len(frames_keypoints) == 0:
                continue

            # Uniformly resample frames to exactly 30
            indices = np.linspace(
                0, len(frames_keypoints) - 1, SEQUENCE_LENGTH, dtype=int
            )
            sampled = [frames_keypoints[i] for i in indices]

            save_path = f"processed_data/{gloss}_{idx}.npy"
            np.save(save_path, np.array(sampled))
            processed_samples.append((save_path, label_idx))

pose_landmarker.close()
hand_landmarker.close()

with open("keypoint_dataset.json", "w") as f:
    json.dump(processed_samples, f)

print(
    f"Preprocessing complete! Extracted normalized keypoints for {len(processed_samples)} samples."
)
