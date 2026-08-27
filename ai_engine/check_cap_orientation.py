import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def main():
    p = "../sample.mp4"
    if not os.path.exists(p):
        p = "sample.mp4"

    cap1 = cv2.VideoCapture(p)
    cap1.set(cv2.CAP_PROP_ORIENTATION_AUTO, 0) # Raw video frames without auto-rotation
    ret1, frame1 = cap1.read()
    cap1.release()

    cap2 = cv2.VideoCapture(p)
    cap2.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1) # Auto-rotated frames
    ret2, frame2 = cap2.read()
    cap2.release()

    print("CAP_PROP_ORIENTATION_AUTO = 0 -> Shape:", frame1.shape if ret1 else "Failed")
    print("CAP_PROP_ORIENTATION_AUTO = 1 -> Shape:", frame2.shape if ret2 else "Failed")

    pose_options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="pose_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
    )
    pose_detector = vision.PoseLandmarker.create_from_options(pose_options)

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="hand_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    hand_detector = vision.HandLandmarker.create_from_options(hand_options)

    for name, f in [("AUTO=0 (Raw)", frame1), ("AUTO=1 (AutoRotated)", frame2)]:
        if f is None: continue
        # Square pad
        fh, fw = f.shape[:2]
        max_dim = max(fh, fw)
        pad_w = (max_dim - fw) // 2
        pad_h = (max_dim - fh) // 2
        sq = cv2.copyMakeBorder(f, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0,0,0])

        rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        p_res = pose_detector.detect(mp_img)
        h_res = hand_detector.detect(mp_img)

        hp = bool(p_res.pose_landmarks and len(p_res.pose_landmarks) > 0)
        hh = bool(h_res.hand_landmarks and len(h_res.hand_landmarks) > 0)

        print(f"Test {name:20s} -> Shape: {f.shape} -> Square: {sq.shape} -> Pose: {hp}, Hand: {hh}")

        # Also test 90, 180, 270 rotations of f
        for angle in [90, 180, 270]:
            rf = f.copy()
            if angle == 90: rf = cv2.rotate(rf, cv2.ROTATE_90_CLOCKWISE)
            elif angle == 180: rf = cv2.rotate(rf, cv2.ROTATE_180)
            elif angle == 270: rf = cv2.rotate(rf, cv2.ROTATE_90_COUNTERCLOCKWISE)

            rfh, rfw = rf.shape[:2]
            rmax = max(rfh, rfw)
            rpad_w = (rmax - rfw) // 2
            rpad_h = (rmax - rfh) // 2
            rsq = cv2.copyMakeBorder(rf, rpad_h, rpad_h, rpad_w, rpad_w, cv2.BORDER_CONSTANT, value=[0,0,0])

            rrgb = cv2.cvtColor(rsq, cv2.COLOR_BGR2RGB)
            rmp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rrgb)

            rp_res = pose_detector.detect(rmp_img)
            rh_res = hand_detector.detect(rmp_img)

            rhp = bool(rp_res.pose_landmarks and len(rp_res.pose_landmarks) > 0)
            rhh = bool(rh_res.hand_landmarks and len(rh_res.hand_landmarks) > 0)

            print(f"  + Angle {angle:3d}° -> Shape: {rf.shape} -> Square: {rsq.shape} -> Pose: {rhp}, Hand: {rhh}")

if __name__ == "__main__":
    main()
