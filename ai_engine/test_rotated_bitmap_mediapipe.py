import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def test_rotated_image_detection():
    video_path = "../user_exp2.mp4"
    if not os.path.exists(video_path):
        video_path = "user_exp2.mp4"

    cap = cv2.VideoCapture(video_path)
    ret, frame = cap.read()
    cap.release()

    if not ret:
        print("Failed to read video frame")
        return

    # Frame is upright portrait (720x1588)
    # Simulate raw camera sensor output (rotated 90 degrees clockwise = 1588x720 landscape)
    frame_rotated_90 = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
    frame_rotated_270 = cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)

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

    def detect_on_img(img, name):
        fh, fw = img.shape[:2]
        max_dim = max(fh, fw)
        pad_w = (max_dim - fw) // 2
        pad_h = (max_dim - fh) // 2
        sq = cv2.copyMakeBorder(img, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])
        rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        p_res = pose_landmarker.detect(mp_img)
        h_res = hand_landmarker.detect(mp_img)

        has_p = bool(p_res.pose_landmarks and len(p_res.pose_landmarks) > 0)
        has_h = bool(h_res.hand_landmarks and len(h_res.hand_landmarks) > 0)
        print(f"[{name:<25s}] (Resolution {fw}x{fh}) -> Pose: {has_p}, Hand: {has_h}")

    print("=" * 80)
    print("EFFECT OF CAMERA IMAGE ROTATION ON MEDIAPIPE DETECTION:")
    print("=" * 80)
    detect_on_img(frame, "Upright Frame")
    detect_on_img(frame_rotated_90, "90-deg Clockwise Rotated")
    detect_on_img(frame_rotated_270, "270-deg Rotated")
    print("=" * 80)

    pose_landmarker.close()
    hand_landmarker.close()

if __name__ == "__main__":
    test_rotated_image_detection()
