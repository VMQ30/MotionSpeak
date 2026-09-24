import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def analyze_timeline():
    video_path = "../user_exp2.mp4"
    if not os.path.exists(video_path):
        video_path = "user_exp2.mp4"

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="hand_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    landmarker = vision.HandLandmarker.create_from_options(options)

    pose_options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="pose_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
    )
    pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

    frame_idx = 0
    hand_segments = []
    curr_segment = None

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        fh, fw = frame.shape[:2]
        max_dim = max(fh, fw)
        pad_w = (max_dim - fw) // 2
        pad_h = (max_dim - fh) // 2
        sq = cv2.copyMakeBorder(frame, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])
        rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        h_res = landmarker.detect(mp_image)
        has_hand = bool(h_res.hand_landmarks and len(h_res.hand_landmarks) > 0)

        t_sec = frame_idx / fps

        if has_hand:
            if curr_segment is None:
                curr_segment = {"start_frame": frame_idx, "start_time": t_sec, "end_frame": frame_idx, "end_time": t_sec, "count": 1}
            else:
                curr_segment["end_frame"] = frame_idx
                curr_segment["end_time"] = t_sec
                curr_segment["count"] += 1
        else:
            if curr_segment is not None:
                hand_segments.append(curr_segment)
                curr_segment = None

        frame_idx += 1

    if curr_segment is not None:
        hand_segments.append(curr_segment)

    cap.release()
    landmarker.close()
    pose_landmarker.close()

    print("=" * 80)
    print(f"USER_EXP2.MP4 HAND DETECTION TIMELINE (Total Duration: {total/fps:.2f}s, {total} frames)")
    print("=" * 80)
    for i, seg in enumerate(hand_segments):
        duration = seg["end_time"] - seg["start_time"]
        print(f"Segment {i+1:2d}: Frames {seg['start_frame']:4d} .. {seg['end_frame']:4d} ({seg['start_time']:5.2f}s .. {seg['end_time']:5.2f}s) | Duration: {duration:5.2f}s ({seg['count']} frames)")

if __name__ == "__main__":
    analyze_timeline()
