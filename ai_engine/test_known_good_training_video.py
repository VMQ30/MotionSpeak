import os
import cv2
import numpy as np
import tensorflow as tf
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse"
]

def run_isolation_test():
    # Find a sample training video from dataset/new_videos
    dataset_dir = "dataset/new_videos"
    if not os.path.exists(dataset_dir):
        dataset_dir = "../dataset/new_videos"

    test_video = None
    target_class = "yes"
    for root, dirs, files in os.walk(dataset_dir):
        for f in files:
            if f.endswith(".mp4") and "yes" in root.lower():
                test_video = os.path.join(root, f)
                break
        if test_video: break

    if not test_video:
        # Fallback to any video in dataset
        for root, dirs, files in os.walk(dataset_dir):
            for f in files:
                if f.endswith(".mp4"):
                    test_video = os.path.join(root, f)
                    target_class = os.path.basename(root).lower()
                    break
            if test_video: break

    if not test_video:
        print("No dataset video found for isolation test!")
        return

    print("=" * 90)
    print(f"ISOLATION TEST ON KNOWN-GOOD TRAINING SAMPLE: {test_video} (Class: {target_class})")
    print("=" * 90)

    # 1. TEST A: Offline Python Preprocessing Pipeline (prep_data.py)
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

    interpreter = tf.lite.Interpreter(model_path="motion_speak_model.tflite")
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    cap = cv2.VideoCapture(test_video)
    py_features = []

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

        feat = np.zeros(225, dtype=np.float32)
        has_pose = bool(pose_res.pose_landmarks and len(pose_res.pose_landmarks) > 0 and len(pose_res.pose_landmarks[0]) > 12)
        has_hand = bool(hand_res.hand_landmarks and len(hand_res.hand_landmarks) > 0)

        anchor = np.array([0.5, 0.5, 0.0], dtype=np.float32)
        scale = 1.0

        if has_pose:
            p_list = np.array([[lm.x, lm.y, lm.z] for lm in pose_res.pose_landmarks[0]], dtype=np.float32)
            l_sh, r_sh = p_list[11], p_list[12]
            cand_anchor = (l_sh + r_sh) / 2.0
            dist = np.linalg.norm(l_sh - r_sh)
            if 0.05 <= dist <= 0.70 and 0.05 <= cand_anchor[0] <= 0.95 and 0.05 <= cand_anchor[1] <= 0.95:
                anchor = cand_anchor
                scale = max(dist, 0.15)
                feat[:99] = ((p_list - anchor) / scale)[:33].flatten()

        if has_hand and hand_res.handedness:
            for idx, hand_info in enumerate(hand_res.handedness):
                label = hand_info[0].category_name
                raw_hand = np.array([[lm.x, lm.y, lm.z] for lm in hand_res.hand_landmarks[idx]], dtype=np.float32)
                norm_hand = (raw_hand - anchor) / scale
                if label.lower() == "left":
                    feat[99:162] = norm_hand[:21].flatten()
                elif label.lower() == "right":
                    feat[162:225] = norm_hand[:21].flatten()

        if has_hand:
            py_features.append(feat)

    cap.release()

    # Resample to 30 frames using lerp
    if len(py_features) > 0:
        indices = np.linspace(0, len(py_features) - 1, 30)
        inp_py = np.zeros((1, 30, 225), dtype=np.float32)
        for i, idx in enumerate(indices):
            low = int(np.floor(idx))
            high = int(np.ceil(idx))
            w = idx - low
            if low == high or high >= len(py_features):
                inp_py[0, i] = py_features[low]
            else:
                inp_py[0, i] = (1.0 - w) * py_features[low] + w * py_features[high]

        interpreter.set_tensor(input_details[0]['index'], inp_py)
        interpreter.invoke()
        out_py = interpreter.get_tensor(output_details[0]['index'])[0]
        top_py = sorted(enumerate(out_py), key=lambda x: x[1], reverse=True)

        print("Test A (Python Lerp Preprocessing):")
        print(f"   Top-1 Predicted Gloss: {TARGET_GLOSSES[top_py[0][0]]} ({top_py[0][1]*100:.1f}%)")
        print(f"   Top-2 Predicted Gloss: {TARGET_GLOSSES[top_py[1][0]]} ({top_py[1][1]*100:.1f}%)")

    # 2. TEST B: Android Native Equivalent (MotionSpeakAIModule.kt logic)
    cap = cv2.VideoCapture(test_video)
    kt_features = []

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

        feat = np.zeros(225, dtype=np.float32)
        has_pose = bool(pose_res.pose_landmarks and len(pose_res.pose_landmarks) > 0 and len(pose_res.pose_landmarks[0]) > 12)
        has_hand = bool(hand_res.hand_landmarks and len(hand_res.hand_landmarks) > 0)

        cx, cy, cz = 0.5, 0.5, 0.0
        scale = 1.0

        if has_pose:
            p_list = pose_res.pose_landmarks[0]
            l_sh, r_sh = p_list[11], p_list[12]
            cand_x = float((l_sh.x + r_sh.x) / 2.0)
            cand_y = float((l_sh.y + r_sh.y) / 2.0)
            cand_z = float((l_sh.z + r_sh.z) / 2.0)

            dx = float(l_sh.x - r_sh.x)
            dy = float(l_sh.y - r_sh.y)
            dz = float(l_sh.z - r_sh.z)
            sh_dist = float(np.sqrt(dx*dx + dy*dy + dz*dz))

            if sh_dist >= 0.05 and sh_dist <= 0.70 and cand_x >= 0.05 and cand_x <= 0.95 and cand_y >= 0.05 and cand_y <= 0.95:
                cx, cy, cz = cand_x, cand_y, cand_z
                scale = float(max(sh_dist, 0.15))
                for p in range(min(33, len(p_list))):
                    lm = p_list[p]
                    feat[p*3] = float((lm.x - cx) / scale)
                    feat[p*3+1] = float((lm.y - cy) / scale)
                    feat[p*3+2] = float((lm.z - cz) / scale)

        if has_hand and hand_res.handedness:
            for idx in range(min(len(hand_res.hand_landmarks), len(hand_res.handedness))):
                raw_cat = hand_res.handedness[idx][0].category_name
                hand_list = hand_res.hand_landmarks[idx]
                offset = 99 if raw_cat.lower() == "left" else 162
                for h in range(min(21, len(hand_list))):
                    lm = hand_list[h]
                    feat[offset + h*3] = float((lm.x - cx) / scale)
                    feat[offset + h*3+1] = float((lm.y - cy) / scale)
                    feat[offset + h*3+2] = float((lm.z - cz) / scale)

        if has_hand:
            kt_features.append(feat)

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    if len(kt_features) > 0:
        count = len(kt_features)
        inp_kt = np.zeros((1, 30, 225), dtype=np.float32)
        for i in range(30):
            src_idx = (i * count) // 30
            inp_kt[0, i] = kt_features[min(src_idx, count - 1)]

        interpreter.set_tensor(input_details[0]['index'], inp_kt)
        interpreter.invoke()
        out_kt = interpreter.get_tensor(output_details[0]['index'])[0]
        top_kt = sorted(enumerate(out_kt), key=lambda x: x[1], reverse=True)

        print("\nTest B (Android NN Preprocessing):")
        print(f"   Top-1 Predicted Gloss: {TARGET_GLOSSES[top_kt[0][0]]} ({top_kt[0][1]*100:.1f}%)")
        print(f"   Top-2 Predicted Gloss: {TARGET_GLOSSES[top_kt[1][0]]} ({top_kt[1][1]*100:.1f}%)")

if __name__ == "__main__":
    run_isolation_test()
