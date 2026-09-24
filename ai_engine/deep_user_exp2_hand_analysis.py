import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def analyze_hand_detection_sensitivity():
    video_path = "../user_exp2.mp4"
    if not os.path.exists(video_path):
        video_path = "user_exp2.mp4"

    cap = cv2.VideoCapture(video_path)

    # Test with default vs lowered detection confidence
    options_default = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="hand_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5
    )
    landmarker_default = vision.HandLandmarker.create_from_options(options_default)

    options_sensitive = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="hand_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
        min_hand_detection_confidence=0.3,
        min_hand_presence_confidence=0.3
    )
    landmarker_sensitive = vision.HandLandmarker.create_from_options(options_sensitive)

    frame_idx = 0
    cnt_default = 0
    cnt_sensitive = 0
    cnt_unpadded = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        fh, fw = frame.shape[:2]
        max_dim = max(fh, fw)
        pad_w = (max_dim - fw) // 2
        pad_h = (max_dim - fh) // 2
        sq = cv2.copyMakeBorder(frame, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])

        rgb_sq = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
        mp_sq = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_sq)

        rgb_raw = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_raw = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_raw)

        res_def = landmarker_default.detect(mp_sq)
        res_sens = landmarker_sensitive.detect(mp_sq)
        res_unpad = landmarker_default.detect(mp_raw)

        if res_def.hand_landmarks and len(res_def.hand_landmarks) > 0:
            cnt_default += 1
        if res_sens.hand_landmarks and len(res_sens.hand_landmarks) > 0:
            cnt_sensitive += 1
        if res_unpad.hand_landmarks and len(res_unpad.hand_landmarks) > 0:
            cnt_unpadded += 1

        frame_idx += 1

    cap.release()
    landmarker_default.close()
    landmarker_sensitive.close()

    print("="*70)
    print(f"Total Video Frames: {frame_idx}")
    print(f"Hand Detected (Padded Square, Default 0.5 Conf)   : {cnt_default} / {frame_idx} ({cnt_default/frame_idx*100:.1f}%)")
    print(f"Hand Detected (Padded Square, Sensitive 0.3 Conf) : {cnt_sensitive} / {frame_idx} ({cnt_sensitive/frame_idx*100:.1f}%)")
    print(f"Hand Detected (Unpadded Raw Frame)                 : {cnt_unpadded} / {frame_idx} ({cnt_unpadded/frame_idx*100:.1f}%)")
    print("="*70)

if __name__ == "__main__":
    analyze_hand_detection_sensitivity()
