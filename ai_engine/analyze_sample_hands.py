import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def main():
    video_path = "../sample.mp4"
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

    cap = cv2.VideoCapture(video_path)
    frame_idx = 0
    hands_summary = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        hand_result = hand_landmarker.detect(mp_image)
        detected_hands = []
        if hand_result.hand_landmarks and hand_result.handedness:
            for idx, hand_info in enumerate(hand_result.handedness):
                label = hand_info[0].category_name
                score = hand_info[0].score
                detected_hands.append(f"{label}({score:.2f})")

        if frame_idx % 20 == 0:
            hands_summary.append(f"Frame {frame_idx:3d}: {detected_hands}")
        frame_idx += 1

    cap.release()
    print("--- sample.mp4 Hand Detection Breakdown ---")
    for s in hands_summary:
        print(s)

if __name__ == "__main__":
    main()
