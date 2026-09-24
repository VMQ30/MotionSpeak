import os
import cv2
import numpy as np

def inspect_user_exp2():
    video_path = "../user_exp2.mp4"
    if not os.path.exists(video_path):
        video_path = "user_exp2.mp4"

    cap = cv2.VideoCapture(video_path)
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"Video Path: {video_path}")
    print(f"Dimensions: {fw}x{fh}, FPS: {fps:.2f}, Frames: {total}")

    out_dir = "user_exp2_frames_sample"
    os.makedirs(out_dir, exist_ok=True)

    frame_indices = [15, 45, 90, 150, 220, 270, 350, 485, 600]
    idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        if idx in frame_indices:
            cv2.imwrite(os.path.join(out_dir, f"frame_{idx:04d}.jpg"), frame)
            print(f"Saved sample frame {idx}")
        idx += 1
    cap.release()

if __name__ == "__main__":
    inspect_user_exp2()
