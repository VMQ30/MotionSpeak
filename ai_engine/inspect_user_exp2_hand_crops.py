import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def inspect_hand_crops():
    video_path = "../user_exp2.mp4"
    if not os.path.exists(video_path):
        video_path = "user_exp2.mp4"

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="hand_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)

    pose_options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="pose_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
    )
    pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

    # Inspect frames around frame 50..70 (between gesture 1 and gesture 2)
    # and frame 140..170 (between gesture 2 and gesture 3)
    test_frames = [20, 50, 120, 160, 265, 310, 488]

    frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        if frame_idx in test_frames:
            fh, fw = frame.shape[:2]
            max_dim = max(fh, fw)
            pad_w = (max_dim - fw) // 2
            pad_h = (max_dim - fh) // 2
            sq = cv2.copyMakeBorder(frame, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])
            rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            h_res = hand_landmarker.detect(mp_image)
            p_res = pose_landmarker.detect(mp_image)

            has_hand = bool(h_res.hand_landmarks and len(h_res.hand_landmarks) > 0)
            has_pose = bool(p_res.pose_landmarks and len(p_res.pose_landmarks) > 0)

            print(f"Frame {frame_idx:3d} ({frame_idx/fps:5.2f}s): Pose={has_pose}, Hand={has_hand}")
            if has_pose and p_res.pose_landmarks:
                plm = p_res.pose_landmarks[0]
                l_wrist, r_wrist = plm[15], plm[16]
                print(f"   Left Wrist : x={l_wrist.x:.3f}, y={l_wrist.y:.3f}, vis={l_wrist.visibility if hasattr(l_wrist, 'visibility') else 'N/A'}")
                print(f"   Right Wrist: x={r_wrist.x:.3f}, y={r_wrist.y:.3f}, vis={r_wrist.visibility if hasattr(r_wrist, 'visibility') else 'N/A'}")

        frame_idx += 1

    cap.release()
    hand_landmarker.close()
    pose_landmarker.close()

if __name__ == "__main__":
    inspect_hand_crops()
