import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def main():
    img_path = "actual_sample_frames/frame_300.jpg"
    img = cv2.imread(img_path)
    if img is None:
        print("Image not found!")
        return

    print("=" * 70)
    print("INSPECTING actual_sample_frames/frame_300.jpg")
    print("=" * 70)
    print("Shape (Height, Width, Channels):", img.shape)
    print("Dtype:", img.dtype)
    print("Min, Max, Mean Pixel Values:", np.min(img), np.max(img), np.mean(img))

    # Test MediaPipe Pose with different options (MIN_POSE_DETECTION_CONFIDENCE, etc.)
    base_options = python.BaseOptions(model_asset_path="pose_landmarker.task")
    pose_options = vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.IMAGE,
        min_pose_detection_confidence=0.1,
        min_pose_presence_confidence=0.1
    )
    pose_detector = vision.PoseLandmarker.create_from_options(pose_options)

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="hand_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
        min_hand_detection_confidence=0.1,
        min_hand_presence_confidence=0.1
    )
    hand_detector = vision.HandLandmarker.create_from_options(hand_options)

    # Let's test original image, resized image (e.g. 640x1411 or square 640x640), rotated images, flipped images
    test_transforms = [
        ("Original (720x1588)", img),
        ("Rotated 90 CW", cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)),
        ("Rotated 180", cv2.rotate(img, cv2.ROTATE_180)),
        ("Rotated 270 (90 CCW)", cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)),
        ("Resized 640x1411", cv2.resize(img, (640, int(640 * 1588 / 720)))),
        ("Square Padded 1588x1588", cv2.copyMakeBorder(img, 0, 0, (1588-720)//2, (1588-720)//2, cv2.BORDER_CONSTANT, value=[0,0,0])),
        ("Flipped Horizontally", cv2.flip(img, 1)),
    ]

    for name, t_img in test_transforms:
        rgb = cv2.cvtColor(t_img, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        pose_res = pose_detector.detect(mp_img)
        hand_res = hand_detector.detect(mp_img)

        has_pose = pose_res.pose_landmarks and len(pose_res.pose_landmarks) > 0
        has_hand = hand_res.hand_landmarks and len(hand_res.hand_landmarks) > 0

        hands_label = [h[0].category_name for h in hand_res.handedness] if has_hand and hand_res.handedness else []
        print(f"{name:30s} -> Shape: {t_img.shape} -> Pose: {has_pose}, Hands: {has_hand} {hands_label}")

if __name__ == "__main__":
    main()
