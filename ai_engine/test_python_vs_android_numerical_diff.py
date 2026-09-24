import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def compare_numerical_extractors():
    video_path = "../user_exp2.mp4"
    if not os.path.exists(video_path):
        video_path = "user_exp2.mp4"

    cap = cv2.VideoCapture(video_path)

    pose_options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="pose_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
    )
    pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="hand_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)

    frame_idx = 0
    max_abs_diffs = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        fh, fw = frame.shape[:2]
        max_dim = max(fh, fw)
        pad_w = (max_dim - fw) // 2
        pad_h = (max_dim - fh) // 2
        sq = cv2.copyMakeBorder(frame, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])
        rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        pose_res = pose_landmarker.detect(mp_image)
        hand_res = hand_landmarker.detect(mp_image)

        # 1. PYTHON EXTRACTOR (prep_data.py)
        py_feat = np.zeros(225, dtype=np.float32)
        has_pose = bool(pose_res.pose_landmarks and len(pose_res.pose_landmarks) > 0 and len(pose_res.pose_landmarks[0]) > 12)
        has_hand = bool(hand_res.hand_landmarks and len(hand_res.hand_landmarks) > 0)
        
        py_anchor = np.array([0.5, 0.5, 0.0], dtype=np.float32)
        py_scale = 1.0

        if has_pose:
            p_list = np.array([[lm.x, lm.y, lm.z] for lm in pose_res.pose_landmarks[0]], dtype=np.float32)
            l_sh, r_sh = p_list[11], p_list[12]
            cand_anchor = (l_sh + r_sh) / 2.0
            dist = np.linalg.norm(l_sh - r_sh)
            if 0.05 <= dist <= 0.70 and 0.05 <= cand_anchor[0] <= 0.95 and 0.05 <= cand_anchor[1] <= 0.95:
                py_anchor = cand_anchor
                py_scale = max(dist, 0.15)
                py_pose = (p_list - py_anchor) / py_scale
                py_feat[:99] = py_pose[:33].flatten()

        if has_hand and hand_res.handedness:
            for idx, hand_info in enumerate(hand_res.handedness):
                label = hand_info[0].category_name
                raw_hand = np.array([[lm.x, lm.y, lm.z] for lm in hand_res.hand_landmarks[idx]], dtype=np.float32)
                norm_hand = (raw_hand - py_anchor) / py_scale
                if label.lower() == "left":
                    py_feat[99:162] = norm_hand[:21].flatten()
                elif label.lower() == "right":
                    py_feat[162:225] = norm_hand[:21].flatten()

        # 2. KOTLIN EXTRACTOR (MotionSpeakAIModule.kt line-by-line float Math)
        kt_feat = np.zeros(225, dtype=np.float32)
        kt_cx = 0.5
        kt_cy = 0.5
        kt_cz = 0.0
        kt_scale = 1.0

        if has_pose:
            p_list_kt = pose_res.pose_landmarks[0]
            l_sh_kt, r_sh_kt = p_list_kt[11], p_list_kt[12]
            cand_x = float((l_sh_kt.x + r_sh_kt.x) / 2.0)
            cand_y = float((l_sh_kt.y + r_sh_kt.y) / 2.0)
            cand_z = float((l_sh_kt.z + r_sh_kt.z) / 2.0)

            dx = float(l_sh_kt.x - r_sh_kt.x)
            dy = float(l_sh_kt.y - r_sh_kt.y)
            dz = float(l_sh_kt.z - r_sh_kt.z)
            sh_dist = float(np.sqrt(dx*dx + dy*dy + dz*dz))

            if sh_dist >= 0.05 and sh_dist <= 0.70 and cand_x >= 0.05 and cand_x <= 0.95 and cand_y >= 0.05 and cand_y <= 0.95:
                kt_cx = cand_x
                kt_cy = cand_y
                kt_cz = cand_z
                kt_scale = float(max(sh_dist, 0.15))

                for p in range(min(33, len(p_list_kt))):
                    lm = p_list_kt[p]
                    kt_feat[p*3] = float((lm.x - kt_cx) / kt_scale)
                    kt_feat[p*3+1] = float((lm.y - kt_cy) / kt_scale)
                    kt_feat[p*3+2] = float((lm.z - kt_cz) / kt_scale)

        if has_hand and hand_res.handedness:
            for idx in range(min(len(hand_res.hand_landmarks), len(hand_res.handedness))):
                raw_cat = hand_res.handedness[idx][0].category_name
                hand_list = hand_res.hand_landmarks[idx]
                offset = 99 if raw_cat.lower() == "left" else 162
                for h in range(min(21, len(hand_list))):
                    lm = hand_list[h]
                    kt_feat[offset + h*3] = float((lm.x - kt_cx) / kt_scale)
                    kt_feat[offset + h*3+1] = float((lm.y - kt_cy) / kt_scale)
                    kt_feat[offset + h*3+2] = float((lm.z - kt_cz) / kt_scale)

        diff = np.abs(py_feat - kt_feat)
        max_diff = np.max(diff)
        max_abs_diffs.append(max_diff)

        frame_idx += 1

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    print("=" * 70)
    print(f"Total Evaluated Frames: {len(max_abs_diffs)}")
    print(f"Max Absolute Numerical Difference (Py vs Kt): {max(max_abs_diffs):.8f}")
    print(f"Average Max Absolute Difference per frame   : {np.mean(max_abs_diffs):.8f}")
    print("=" * 70)

if __name__ == "__main__":
    compare_numerical_extractors()
