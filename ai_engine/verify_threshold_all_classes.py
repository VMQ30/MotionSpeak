import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse"
]

def main():
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

    print("=" * 85)
    print("VERIFYING HAND POSITION THRESHOLD (rel_y = wrist.y - centerAnchorY) ACROSS ALL 15 SIGNS")
    print("=" * 85)
    print(f"{'Class Gloss':12s} | {'Video File':25s} | {'Min rel_y':10s} | {'Max rel_y':10s} | {'Threshold (0.40)':18s}")
    print("-" * 85)

    test_folders = ["Hello", "Yes", "No", "Good", "bad", "what", "thankyou", "welcome", "please", "Sorry", "goodbye", "morning", "afternoon", "evening", "excuse"]

    for folder in test_folders:
        fpath = f"dataset/new_videos/{folder}"
        if not os.path.exists(fpath):
            norm = folder.lower().replace(" ", "").replace("_", "")
            for candidate in os.listdir("dataset/new_videos"):
                if candidate.lower().replace(" ", "").replace("_", "") == norm:
                    fpath = f"dataset/new_videos/{candidate}"
                    break

        if os.path.exists(fpath):
            files = [f for f in os.listdir(fpath) if f.endswith(".mp4")][:1]
            if files:
                v_name = files[0]
                full_v = os.path.join(fpath, v_name)
                cap = cv2.VideoCapture(full_v)

                rel_ys = []
                while cap.isOpened():
                    ret, frame = cap.read()
                    if not ret: break
                    fh, fw = frame.shape[:2]
                    max_dim = max(fh, fw)
                    sq = cv2.copyMakeBorder(frame, (max_dim-fh)//2, (max_dim-fh)//2, (max_dim-fw)//2, (max_dim-fw)//2, cv2.BORDER_CONSTANT, value=[0,0,0])
                    rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
                    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

                    p_res = pose_landmarker.detect(mp_img)
                    h_res = hand_landmarker.detect(mp_img)

                    if p_res.pose_landmarks and len(p_res.pose_landmarks[0]) > 12 and h_res.hand_landmarks and len(h_res.hand_landmarks) > 0:
                        p_list = p_res.pose_landmarks[0]
                        l_sh, r_sh = p_list[11], p_list[12]
                        cy = (l_sh.y + r_sh.y) / 2.0
                        w_y = h_res.hand_landmarks[0][0].y
                        rel_y = w_y - cy
                        rel_ys.append(rel_y)

                cap.release()

                if rel_ys:
                    min_y = min(rel_ys)
                    max_y = max(rel_ys)
                    is_safe = max_y <= 0.40
                    safe_str = "SAFE (< 0.40)" if is_safe else f"RISK ({max_y:.2f} > 0.40)"
                    print(f"{folder:12s} | {v_name:25s} | {min_y:10.3f} | {max_y:10.3f} | {safe_str:18s}")

    pose_landmarker.close()
    hand_landmarker.close()

if __name__ == "__main__":
    main()
