import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def main():
    video_path = "../sample.mp4"
    if not os.path.exists(video_path):
        video_path = "sample.mp4"

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
    ret, frame = cap.read()
    cap.release()

    if not ret:
        print("Failed to read frame")
        return

    print("Testing auto-orientation check on first frame of sample.mp4:")
    for angle in [0, 90, 180, 270]:
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

        has_pose = pose_res.pose_landmarks and len(pose_res.pose_landmarks) > 0
        has_hand = hand_res.hand_landmarks and len(hand_res.hand_landmarks) > 0

        pose_score = 0.0
        if has_pose and len(pose_res.pose_landmarks[0]) > 12:
            l_sh = pose_res.pose_landmarks[0][11]
            r_sh = pose_res.pose_landmarks[0][12]
            # In upright posture, shoulders are roughly horizontal (y coordinates are close) and y is in upper half (0.1 - 0.6)
            dy = abs(l_sh.y - r_sh.y)
            dx = abs(l_sh.x - r_sh.x)
            if dx > 0.05:
                pose_score = dx / (dy + 1e-5) # Higher ratio means upright shoulders

        hand_info = []
        if has_hand and hand_res.handedness:
            for h in hand_res.handedness:
                hand_info.append(f"{h[0].category_name}:{h[0].score:.2f}")

        print(f"Angle {angle:3d}° | Pose: {has_pose} (Shoulder dx/dy ratio: {pose_score:6.2f}) | Hands: {has_hand} {hand_info}")

if __name__ == "__main__":
    main()
