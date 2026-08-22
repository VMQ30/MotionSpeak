import cv2
import numpy as np

def main():
    img = cv2.imread("sample_frames/frame_060.jpg")
    if img is None:
        print("Image not found!")
        return

    print("Image shape (height, width, channels):", img.shape)
    print("Mean brightness (BGR):", np.mean(img, axis=(0,1)))
    print("Min, Max pixel values:", np.min(img), np.max(img))

    # Test MediaPipe on rotated versions (0, 90, 180, 270)
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    base_options = python.BaseOptions(model_asset_path="hand_landmarker.task")
    options = vision.HandLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    detector = vision.HandLandmarker.create_from_options(options)

    for angle in [0, 90, 180, 270]:
        if angle == 0:
            rot_img = img
        elif angle == 90:
            rot_img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
        elif angle == 180:
            rot_img = cv2.rotate(img, cv2.ROTATE_180)
        elif angle == 270:
            rot_img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

        rgb = cv2.cvtColor(rot_img, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = detector.detect(mp_img)

        hands = []
        if result.hand_landmarks and result.handedness:
            for idx, h in enumerate(result.handedness):
                hands.append(f"{h[0].category_name} ({h[0].score:.2f})")

        print(f"Angle {angle:3d}° -> Shape: {rot_img.shape} -> Hands: {hands}")

if __name__ == "__main__":
    main()
