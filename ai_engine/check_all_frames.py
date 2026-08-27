import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def main():
    p = "../sample.mp4"
    if not os.path.exists(p): p = "sample.mp4"

    cap = cv2.VideoCapture(p)
    pose_options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="pose_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
    )
    pose_detector = vision.PoseLandmarker.create_from_options(pose_options)

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="hand_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    hand_detector = vision.HandLandmarker.create_from_options(hand_options)

    frame_idx = 0
    pose_detected = []
    hand_detected = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        fh, fw = frame.shape[:2]
        max_dim = max(fh, fw)
        pad_w = (max_dim - fw) // 2
        pad_h = (max_dim - fh) // 2
        sq = cv2.copyMakeBorder(frame, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])

        rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        p_res = pose_detector.detect(mp_img)
        h_res = hand_detector.detect(mp_img)

        hp = bool(p_res.pose_landmarks and len(p_res.pose_landmarks) > 0)
        hh = bool(h_res.hand_landmarks and len(h_res.hand_landmarks) > 0)

        if hp: pose_detected.append(frame_idx)
        if hh: hand_detected.append(frame_idx)

        frame_idx += 1

    cap.release()

    print(f"Total frames: {frame_idx}")
    print(f"Pose detected: {len(pose_detected)} / {frame_idx} (First: {pose_detected[0] if pose_detected else 'None'}, Last: {pose_detected[-1] if pose_detected else 'None'})")
    print(f"Hand detected: {len(hand_detected)} / {frame_idx} (First: {hand_detected[0] if hand_detected else 'None'}, Last: {hand_detected[-1] if hand_detected else 'None'})")

if __name__ == "__main__":
    main()
