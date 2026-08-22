import os
import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def main():
    base_options = python.BaseOptions(model_asset_path="hand_landmarker.task")
    options = vision.HandLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
        min_hand_detection_confidence=0.15,
        min_hand_presence_confidence=0.15,
        min_tracking_confidence=0.15,
    )
    detector = vision.HandLandmarker.create_from_options(options)

    frame_files = sorted(os.listdir("sample_frames"))
    for f in frame_files:
        path = os.path.join("sample_frames", f)
        img = cv2.imread(path)
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = detector.detect(mp_img)

        hands_found = []
        if result.hand_landmarks and result.handedness:
            for idx, h in enumerate(result.handedness):
                label = h[0].category_name
                score = h[0].score
                hands_found.append(f"{label} ({score:.2f})")
        print(f"File {f:20s}: Hands={hands_found}")

if __name__ == "__main__":
    main()
