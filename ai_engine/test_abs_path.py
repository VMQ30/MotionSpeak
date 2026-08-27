import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def main():
    p = "../sample.mp4"
    if not os.path.exists(p): p = "sample.mp4"

    pose_model_path = os.path.abspath("pose_landmarker.task")
    hand_model_path = os.path.abspath("hand_landmarker.task")

    print("Pose model path:", pose_model_path, "Exists:", os.path.exists(pose_model_path))
    print("Hand model path:", hand_model_path, "Exists:", os.path.exists(hand_model_path))

    pose_options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=pose_model_path),
        running_mode=vision.RunningMode.IMAGE,
    )
    pose_detector = vision.PoseLandmarker.create_from_options(pose_options)

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=hand_model_path),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    hand_detector = vision.HandLandmarker.create_from_options(hand_options)

    cap = cv2.VideoCapture(p)
    pose_cnt = 0
    hand_cnt = 0
    total = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        total += 1

        fh, fw = frame.shape[:2]
        max_dim = max(fh, fw)
        pad_w = (max_dim - fw) // 2
        pad_h = (max_dim - fh) // 2
        sq = cv2.copyMakeBorder(frame, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])

        rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        p_res = pose_detector.detect(mp_img)
        h_res = hand_detector.detect(mp_img)

        if p_res.pose_landmarks and len(p_res.pose_landmarks) > 0: pose_cnt += 1
        if h_res.hand_landmarks and len(h_res.hand_landmarks) > 0: hand_cnt += 1

    cap.release()
    pose_detector.close()
    hand_detector.close()

    print(f"Absolute Model Path Test -> Total={total}, Pose={pose_cnt}, Hand={hand_cnt}")

if __name__ == "__main__":
    main()
