import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def analyze_motion_profile(video_path):
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

    cap = cv2.VideoCapture(video_path)
    frame_idx = 0
    hand_positions = [] # (frame, wrist_x, wrist_y, chest_x, chest_y)

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

        wrist_pos = None
        chest_pos = None

        if pose_res.pose_landmarks and len(pose_res.pose_landmarks[0]) > 12:
            p_list = pose_res.pose_landmarks[0]
            l_sh = p_list[11]
            r_sh = p_list[12]
            chest_pos = ((l_sh.x + r_sh.x)/2.0, (l_sh.y + r_sh.y)/2.0)

        if hand_res.hand_landmarks and len(hand_res.hand_landmarks) > 0:
            w = hand_res.hand_landmarks[0][0]
            wrist_pos = (w.x, w.y)

        if wrist_pos and chest_pos:
            # relative wrist position to chest anchor
            rel_x = wrist_pos[0] - chest_pos[0]
            rel_y = wrist_pos[1] - chest_pos[1]
            hand_positions.append((frame_idx, rel_x, rel_y))

        frame_idx += 1

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    if not hand_positions:
        return {"total_frames": frame_idx, "motion": "None"}

    rel_xs = [p[1] for p in hand_positions]
    rel_ys = [p[2] for p in hand_positions]

    # Calculate motion range and trajectory
    x_min, x_max = min(rel_xs), max(rel_xs)
    y_min, y_max = min(rel_ys), max(rel_ys)
    x_span = x_max - x_min
    y_span = y_max - y_min

    # Check for circular chest motion (Sorry) vs vertical chin motion (Good/Thank You) vs wave (Hello/Goodbye)
    # Circular chest motion: rel_y is around 0.0 (chest height), rel_x oscillates with circular motion
    mean_y = np.mean(rel_ys) # y relative to shoulders/chest (0 = shoulder line, + = below chest, - = above shoulders)

    return {
        "total_frames": frame_idx,
        "tracked_frames": len(hand_positions),
        "mean_rel_y": float(mean_y),
        "y_span": float(y_span),
        "x_span": float(x_span),
        "x_std": float(np.std(rel_xs)),
        "y_std": float(np.std(rel_ys)),
    }

def main():
    sample_p = "../sample.mp4"
    if not os.path.exists(sample_p): sample_p = "sample.mp4"

    res_sample = analyze_motion_profile(sample_p)
    print("=== MOTION PROFILE OF sample.mp4 ===")
    for k, v in res_sample.items():
        print(f"  {k:20s}: {v}")

    print("\n=== COMPARING WITH DATASET CLASSES ===")
    test_folders = ["Hello", "Yes", "No", "Sorry", "please", "thankyou", "Good"]
    for folder in test_folders:
        fpath = f"dataset/new_videos/{folder}"
        if os.path.exists(fpath):
            files = [f for f in os.listdir(fpath) if f.endswith(".mp4")][:2]
            for fname in files:
                full_p = os.path.join(fpath, fname)
                r = analyze_motion_profile(full_p)
                print(f"  {folder:10s} ({fname}): mean_y={r.get('mean_rel_y', 0):.3f}, y_span={r.get('y_span', 0):.3f}, x_span={r.get('x_span', 0):.3f}")

if __name__ == "__main__":
    main()
