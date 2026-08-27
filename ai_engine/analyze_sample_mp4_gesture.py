import os
import json
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def analyze_video(video_path):
    if not os.path.exists(video_path):
        print(f"Error: {video_path} not found.")
        return

    cap = cv2.VideoCapture(video_path)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0

    print("=" * 80)
    print(f"DETAILED ANALYSIS OF VIDEO: {os.path.basename(video_path)}")
    print("=" * 80)
    print(f"Resolution:     {width} x {height} ({'Portrait' if height > width else 'Landscape'})")
    print(f"Aspect Ratio:   {width/height:.3f}")
    print(f"FPS:            {fps:.2f}")
    print(f"Total Frames:   {total_frames}")
    print(f"Duration:       {duration:.2f} seconds")

    pose_options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=os.path.abspath("pose_landmarker.task")),
        running_mode=vision.RunningMode.IMAGE,
    )
    pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=os.path.abspath("hand_landmarker.task")),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)

    frame_idx = 0
    pose_detected_count = 0
    hand_detected_count = 0
    left_hand_count = 0
    right_hand_count = 0

    hand_positions_x = []
    hand_positions_y = []
    shoulder_dists = []
    shoulder_centers_x = []
    shoulder_centers_y = []
    wrist_rel_xs = []
    wrist_rel_ys = []

    first_hand_frame = -1
    last_hand_frame = -1

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        fh, fw = frame.shape[:2]
        max_dim = max(fh, fw)
        pad_w = (max_dim - fw) // 2
        pad_h = (max_dim - fh) // 2
        sq = cv2.copyMakeBorder(frame, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])

        rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        p_res = pose_landmarker.detect(mp_img)
        h_res = hand_landmarker.detect(mp_img)

        has_p = bool(p_res.pose_landmarks and len(p_res.pose_landmarks[0]) > 12)
        has_h = bool(h_res.hand_landmarks and len(h_res.hand_landmarks) > 0)

        if has_p:
            pose_detected_count += 1
            p_list = p_res.pose_landmarks[0]
            l_sh, r_sh = p_list[11], p_list[12]
            cx, cy = (l_sh.x + r_sh.x) / 2.0, (l_sh.y + r_sh.y) / 2.0
            dist = np.sqrt((l_sh.x - r_sh.x)**2 + (l_sh.y - r_sh.y)**2 + (l_sh.z - r_sh.z)**2)
            shoulder_dists.append(dist)
            shoulder_centers_x.append(cx)
            shoulder_centers_y.append(cy)

        if has_h:
            hand_detected_count += 1
            if first_hand_frame == -1: first_hand_frame = frame_idx
            last_hand_frame = frame_idx

            for idx in range(min(len(h_res.hand_landmarks), len(h_res.handedness))):
                cat = h_res.handedness[idx][0].categoryName
                if cat.lower() == "left": left_hand_count += 1
                else: right_hand_count += 1

                wrist = h_res.hand_landmarks[idx][0]
                hand_positions_x.append(wrist.x)
                hand_positions_y.append(wrist.y)

                if has_p:
                    p_list = p_res.pose_landmarks[0]
                    l_sh, r_sh = p_list[11], p_list[12]
                    cx, cy = (l_sh.x + r_sh.x) / 2.0, (l_sh.y + r_sh.y) / 2.0
                    dist = max(np.sqrt((l_sh.x - r_sh.x)**2 + (l_sh.y - r_sh.y)**2 + (l_sh.z - r_sh.z)**2), 0.15)
                    wrist_rel_xs.append((wrist.x - cx) / dist)
                    wrist_rel_ys.append((wrist.y - cy) / dist)

        frame_idx += 1

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    print("\n--- LANDMARK & TRACKING STATS ---")
    print(f"Pose Detected Frames:  {pose_detected_count} / {total_frames} ({pose_detected_count/total_frames*100:.1f}%)")
    print(f"Hand Detected Frames:  {hand_detected_count} / {total_frames} ({hand_detected_count/total_frames*100:.1f}%)")
    print(f"MediaPipe Raw Handedness: Left Category (Mirrored Right Hand)={left_hand_count}, Right Category={right_hand_count}")
    print(f"First Hand Detection:  Frame {first_hand_frame} ({first_hand_frame/fps:.2f}s)")
    print(f"Last Hand Detection:   Frame {last_hand_frame} ({last_hand_frame/fps:.2f}s)")
    print(f"Hand Active Duration:  {(last_hand_frame - first_hand_frame)/fps:.2f}s ({last_hand_frame - first_hand_frame} frames)")

    if shoulder_dists:
        print(f"\n--- FRAMING & DISTANCE STATS ---")
        print(f"Mean Shoulder Scale (dist): {np.mean(shoulder_dists):.3f} (Range: {np.min(shoulder_dists):.3f} .. {np.max(shoulder_dists):.3f})")
        print(f"Mean Shoulder Center X:     {np.mean(shoulder_centers_x):.3f}")
        print(f"Mean Shoulder Center Y:     {np.mean(shoulder_centers_y):.3f}")

    if wrist_rel_xs:
        print(f"\n--- GESTURE MOTION PROFILE ---")
        print(f"Normalized Rel X Range:     {np.min(wrist_rel_xs):.3f} .. {np.max(wrist_rel_xs):.3f} (Span: {np.max(wrist_rel_xs)-np.min(wrist_rel_xs):.3f})")
        print(f"Normalized Rel Y Range:     {np.min(wrist_rel_ys):.3f} .. {np.max(wrist_rel_ys):.3f} (Span: {np.max(wrist_rel_ys)-np.min(wrist_rel_ys):.3f})")
        print(f"Mean Rel X Position:        {np.mean(wrist_rel_xs):.3f}")
        print(f"Mean Rel Y Position:        {np.mean(wrist_rel_ys):.3f}")
        print(f"Std Dev Rel X (Horiz Motion): {np.std(wrist_rel_xs):.3f}")
        print(f"Std Dev Rel Y (Vert Motion):  {np.std(wrist_rel_ys):.3f}")

def main():
    sample_p = "../sample.mp4"
    if not os.path.exists(sample_p): sample_p = "sample.mp4"
    analyze_video(sample_p)

    print("\n" + "=" * 80)
    print("COMPARISON WITH DATASET TRAINING VIDEOS (Sorry/1.mp4)")
    print("=" * 80)
    ds_sorry = "dataset/new_videos/Sorry/1.mp4"
    if not os.path.exists(ds_sorry): ds_sorry = "dataset/videos/sorry/1.mp4"
    if os.path.exists(ds_sorry):
        analyze_video(ds_sorry)

if __name__ == "__main__":
    main()
