import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def python_preprocess(frame, pose_landmarker, hand_landmarker):
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

    pose_result = pose_landmarker.detect(mp_image)
    hand_result = hand_landmarker.detect(mp_image)

    pose = np.zeros((33, 3))
    lh = np.zeros((21, 3))
    rh = np.zeros((21, 3))

    scale_factor = 1.0
    center_anchor = np.zeros(3)

    if pose_result.pose_landmarks and len(pose_result.pose_landmarks) > 0:
        pose = np.array([[lm.x, lm.y, lm.z] for lm in pose_result.pose_landmarks[0]])
        left_shoulder, right_shoulder = pose[11], pose[12]
        center_anchor = (left_shoulder + right_shoulder) / 2.0
        shoulder_dist = np.linalg.norm(left_shoulder - right_shoulder)
        scale_factor = shoulder_dist if shoulder_dist > 1e-6 else 1.0
        pose = (pose - center_anchor) / scale_factor

    if hand_result.hand_landmarks and hand_result.handedness:
        for idx, hand_info in enumerate(hand_result.handedness):
            label = hand_info[0].category_name
            raw_hand = np.array([[lm.x, lm.y, lm.z] for lm in hand_result.hand_landmarks[idx]])
            norm_hand = (raw_hand - center_anchor) / scale_factor
            if label == "Left":
                lh = norm_hand
            elif label == "Right":
                rh = norm_hand

    return np.concatenate([pose.flatten(), lh.flatten(), rh.flatten()]), scale_factor, center_anchor

def kotlin_updated_preprocess(frame, pose_landmarker, hand_landmarker):
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

    pose_result = pose_landmarker.detect(mp_image)
    hand_result = hand_landmarker.detect(mp_image)

    frame_features = np.zeros(225, dtype=np.float32)

    cand_x = 0.5
    cand_y = 0.5
    cand_z = 0.0
    scale_factor = 1.0

    if pose_result.pose_landmarks and len(pose_result.pose_landmarks) > 0:
        pose_list = pose_result.pose_landmarks[0]
        left_shoulder = pose_list[11]
        right_shoulder = pose_list[12]

        cand_x = (left_shoulder.x + right_shoulder.x) / 2.0
        cand_y = (left_shoulder.y + right_shoulder.y) / 2.0
        cand_z = (left_shoulder.z + right_shoulder.z) / 2.0

        dx = left_shoulder.x - right_shoulder.x
        dy = left_shoulder.y - right_shoulder.y
        dz = left_shoulder.z - right_shoulder.z
        shoulder_dist = np.sqrt(dx*dx + dy*dy + dz*dz)

        scale_factor = shoulder_dist if shoulder_dist > 1e-6 else 1.0

        for p in range(min(33, len(pose_list))):
            lm = pose_list[p]
            frame_features[p*3] = (lm.x - cand_x) / scale_factor
            frame_features[p*3+1] = (lm.y - cand_y) / scale_factor
            frame_features[p*3+2] = (lm.z - cand_z) / scale_factor

    if hand_result.hand_landmarks and hand_result.handedness:
        for idx in range(min(len(hand_result.hand_landmarks), len(hand_result.handedness))):
            raw_cat = hand_result.handedness[idx][0].category_name
            hand_list = hand_result.hand_landmarks[idx]

            offset = 99 if raw_cat.lower() == "left" else 162

            for h_idx in range(min(21, len(hand_list))):
                lm = hand_list[h_idx]
                frame_features[offset + h_idx*3] = (lm.x - cand_x) / scale_factor
                frame_features[offset + h_idx*3 + 1] = (lm.y - cand_y) / scale_factor
                frame_features[offset + h_idx*3 + 2] = (lm.z - cand_z) / scale_factor

    return frame_features

def main():
    print("=" * 80)
    print("PREPROCESSING EQUIVALENCE TEST (PYTHON VS UPDATED KOTLIN FORMULA)")
    print("=" * 80)

    pose_task = "android/app/src/main/assets/pose_landmarker.task"
    hand_task = "android/app/src/main/assets/hand_landmarker.task"

    pose_options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=pose_task),
        running_mode=vision.RunningMode.IMAGE,
    )
    pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=hand_task),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)

    cap = cv2.VideoCapture("sample.mp4")
    frame = None
    frame_idx = 0
    while cap.isOpened():
        ret, f = cap.read()
        frame_idx += 1
        if not ret:
            break
        if frame_idx > 50:
            frame = f
            break
    cap.release()

    if frame is None:
        print("No valid frame retrieved.")
        return

    py_tensor, py_scale, py_anchor = python_preprocess(frame, pose_landmarker, hand_landmarker)
    kt_tensor = kotlin_updated_preprocess(frame, pose_landmarker, hand_landmarker)

    l2_diff = float(np.linalg.norm(py_tensor - kt_tensor))
    max_abs_diff = float(np.max(np.abs(py_tensor - kt_tensor)))

    print(f"\nFrame Index: {frame_idx}")
    print(f"Shape:               Python={py_tensor.shape}, Kotlin={kt_tensor.shape}")
    print(f"Min:                 Python={np.min(py_tensor):.4f}, Kotlin={np.min(kt_tensor):.4f}")
    print(f"Max:                 Python={np.max(py_tensor):.4f}, Kotlin={np.max(kt_tensor):.4f}")
    print(f"Mean:                Python={np.mean(py_tensor):.4f}, Kotlin={np.mean(kt_tensor):.4f}")
    print(f"Std:                 Python={np.std(py_tensor):.4f}, Kotlin={np.std(kt_tensor):.4f}")
    print(f"Non-zero Count:      Python={np.sum(np.abs(py_tensor) > 1e-5)}, Kotlin={np.sum(np.abs(kt_tensor) > 1e-5)}")
    print(f"L2 Difference:       {l2_diff:.6f}")
    print(f"Max Abs Difference:  {max_abs_diff:.6f}")

    if max_abs_diff < 1e-4:
        print("\n[SUCCESS] PREPROCESSING TENSORS ARE NUMERICALLY IDENTICAL!")

if __name__ == "__main__":
    main()
