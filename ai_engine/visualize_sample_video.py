import os
import cv2
import numpy as np

def main():
    p = "../sample.mp4"
    if not os.path.exists(p):
        p = "sample.mp4"

    cap = cv2.VideoCapture(p)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total_frames / fps if fps > 0 else 0

    print(f"VIDEO METADATA FOR sample.mp4:")
    print(f"  Path:         {os.path.abspath(p)}")
    print(f"  Resolution:   {width} x {height}")
    print(f"  FPS:          {fps:.2f}")
    print(f"  Total Frames: {total_frames}")
    print(f"  Duration:     {duration:.2f} seconds")

    # Sample key frames at 10%, 25%, 50%, 75%, 90% of duration
    sample_indices = [
        int(total_frames * 0.10),
        int(total_frames * 0.25),
        int(total_frames * 0.50),
        int(total_frames * 0.75),
        int(total_frames * 0.90)
    ]

    out_dir = "sample_frames"
    os.makedirs(out_dir, exist_ok=True)

    curr_idx = 0
    saved_paths = []
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        if curr_idx in sample_indices:
            frame_path = os.path.join(out_dir, f"frame_{curr_idx:04d}.jpg")
            cv2.imwrite(frame_path, frame)
            saved_paths.append(frame_path)
            print(f"  Saved keyframe {curr_idx}/{total_frames} -> {frame_path} (Shape: {frame.shape})")

        curr_idx += 1

    cap.release()

if __name__ == "__main__":
    main()
