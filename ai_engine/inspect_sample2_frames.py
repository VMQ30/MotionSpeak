import os
import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def main():
    video_path = "../sample_2.mp4"
    cap = cv2.VideoCapture(video_path)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_f = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"sample_2.mp4 Info: {w}x{h} @ {fps:.1f} FPS, total {total_f} frames")

    os.makedirs("sample2_frames", exist_ok=True)

    # Save frames every 50 frames
    frame_idx = 0
    saved = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % 50 == 0:
            fn = f"sample2_frames/frame_{frame_idx:03d}.jpg"
            cv2.imwrite(fn, frame)
            saved += 1
        frame_idx += 1
    cap.release()

    print(f"Saved {saved} frames to sample2_frames/")

    # Test MediaPipe HandLandmarker on sample2 frames with different rotations and resizings
    base_options = python.BaseOptions(model_asset_path="hand_landmarker.task")
    options = vision.HandLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
        min_hand_detection_confidence=0.10,
        min_hand_presence_confidence=0.10,
    )
    detector = vision.HandLandmarker.create_from_options(options)

    frame_files = sorted(os.listdir("sample2_frames"))
    for f in frame_files:
        path = os.path.join("sample2_frames", f)
        img = cv2.imread(path)

        for rot in [0, 90, 180, 270]:
            if rot == 0:
                r_img = img
            elif rot == 90:
                r_img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
            elif rot == 180:
                r_img = cv2.rotate(img, cv2.ROTATE_180)
            elif rot == 270:
                r_img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

            rgb = cv2.cvtColor(r_img, cv2.COLOR_BGR2RGB)
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            res = detector.detect(mp_img)

            if res.hand_landmarks and len(res.hand_landmarks) > 0:
                hands = [h[0].category_name for h in res.handedness]
                print(f"SUCCESS! File {f} @ rot {rot:3d}° -> Found Hands: {hands}")

if __name__ == "__main__":
    main()
