import os
import cv2
import numpy as np
import tensorflow as tf
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def main():
    video_path = "../sample.mp4"
    if not os.path.exists(video_path):
        video_path = "sample.mp4"

    print("Opening video:", video_path)
    cap = cv2.VideoCapture(video_path)

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

    frame_idx = 0
    pose_cnt = 0
    hand_cnt = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        fh, fw = frame.shape[:2]
        max_dim = max(fh, fw)
        pad_w = (max_dim - fw) // 2
        pad_h = (max_dim - fh) // 2
        square_frame = cv2.copyMakeBorder(frame, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])

        rgb = cv2.cvtColor(square_frame, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        pose_res = pose_landmarker.detect(mp_img)
        hand_res = hand_landmarker.detect(mp_img)

        has_pose = bool(pose_res.pose_landmarks and len(pose_res.pose_landmarks) > 0)
        has_hand = bool(hand_res.hand_landmarks and len(hand_res.hand_landmarks) > 0)

        if has_pose: pose_cnt += 1
        if has_hand: hand_cnt += 1

        if frame_idx % 100 == 0:
            print(f"Frame {frame_idx:3d}: Shape={frame.shape} -> Square={square_frame.shape} | Pose={has_pose}, Hand={has_hand}")

        frame_idx += 1

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    print(f"Total: Frames={frame_idx}, Pose={pose_cnt}, Hand={hand_cnt}")

if __name__ == "__main__":
    main()
