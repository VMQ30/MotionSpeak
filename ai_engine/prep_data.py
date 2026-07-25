import cv2
import json
import os
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# 1. Configure Pose Landmarker
pose_options = vision.PoseLandmarkerOptions(
    base_options=python.BaseOptions(model_asset_path="pose_landmarker.task"),
    running_mode=vision.RunningMode.IMAGE,
)
pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

# 2. Configure Hand Landmarker
hand_options = vision.HandLandmarkerOptions(
    base_options=python.BaseOptions(model_asset_path="hand_landmarker.task"),
    running_mode=vision.RunningMode.IMAGE,
    num_hands=2,
)
hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)


def extract_keypoints(pose_result, hand_result):
    # Extract Pose landmarks (33 joints * 3 coords)
    if pose_result.pose_landmarks and len(pose_result.pose_landmarks) > 0:
        pose = np.array(
            [[lm.x, lm.y, lm.z] for lm in pose_result.pose_landmarks[0]]
        ).flatten()
    else:
        pose = np.zeros(33 * 3)

    # Separate Left and Right Hand landmarks
    lh = np.zeros(21 * 3)
    rh = np.zeros(21 * 3)

    if hand_result.hand_landmarks and hand_result.handedness:
        for idx, hand_info in enumerate(hand_result.handedness):
            label = hand_info[0].category_name  # "Left" or "Right"
            landmarks = np.array(
                [[lm.x, lm.y, lm.z] for lm in hand_result.hand_landmarks[idx]]
            ).flatten()

            if label == "Left":
                lh = landmarks
            elif label == "Right":
                rh = landmarks

    return np.concatenate([pose, lh, rh])


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

                # Convert frame to MediaPipe Image object
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

                # Process detections using Tasks API
                pose_result = pose_landmarker.detect(mp_image)
                hand_result = hand_landmarker.detect(mp_image)

                keypoints = extract_keypoints(pose_result, hand_result)
                frames_keypoints.append(keypoints)

            cap.release()

            if len(frames_keypoints) == 0:
                continue

            # Uniformly sample/pad to exactly 30 frames
            indices = np.linspace(
                0, len(frames_keypoints) - 1, SEQUENCE_LENGTH, dtype=int
            )
            sampled = [frames_keypoints[i] for i in indices]

            # Save numpy feature array
            save_path = f"processed_data/{gloss}_{idx}.npy"
            np.save(save_path, np.array(sampled))
            processed_samples.append((save_path, label_idx))

# Clean up task objects
pose_landmarker.close()
hand_landmarker.close()

with open("keypoint_dataset.json", "w") as f:
    json.dump(processed_samples, f)

print(
    f"Dataset extraction complete! Saved keypoint samples for {len(processed_samples)} videos."
)
