import os
import cv2
import mediapipe as mp

def main():
    video_path = "../sample.mp4"
    cap = cv2.VideoCapture(video_path)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"Video Info: {width}x{height} @ {fps} fps, total {total_frames} frames")

    os.makedirs("sample_frames", exist_ok=True)

    # Save frames 0, 30, 60, 90, 120, 150, 180, 210, 300, 450
    target_indices = [0, 30, 60, 90, 120, 150, 180, 210, 300, 450]
    frame_idx = 0
    saved_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx in target_indices:
            filename = f"sample_frames/frame_{frame_idx:03d}.jpg"
            cv2.imwrite(filename, frame)
            saved_count += 1
            print(f"Saved {filename} (shape: {frame.shape})")
        frame_idx += 1

    cap.release()
    print(f"Done. Saved {saved_count} frames to sample_frames/")

if __name__ == "__main__":
    main()
