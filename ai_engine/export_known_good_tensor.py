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

def export_tensor():
    test_video = "dataset/new_videos/Yes/1.mp4"
    if not os.path.exists(test_video):
        test_video = "../dataset/new_videos/Yes/1.mp4"

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
    pose_landmarker.close()
    hand_landmarker.close()

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

    # Save to binary file
    bin_path = "known_good_tensor.bin"
    inp_py.tofile(bin_path)

    # Save to Android assets
    asset_bin_path = "../android/app/src/main/assets/known_good_tensor.bin"
    inp_py.tofile(asset_bin_path)

    print(f"Exported known-good tensor to {bin_path} and {asset_bin_path}")
    print(f"Shape: {inp_py.shape}, Byte Size: {inp_py.nbytes} bytes")

    interpreter = tf.lite.Interpreter(model_path="motion_speak_model.tflite")
    interpreter.allocate_tensors()
    in_details = interpreter.get_input_details()
    out_details = interpreter.get_output_details()

    interpreter.set_tensor(in_details[0]['index'], inp_py)
    interpreter.invoke()
    out = interpreter.get_tensor(out_details[0]['index'])[0]

    top1_idx = np.argmax(out)
    print(f"Python TFLite Prediction on Exported Tensor: Gloss='{TARGET_GLOSSES[top1_idx]}' ({out[top1_idx]*100:.1f}%)")

if __name__ == "__main__":
    export_tensor()
