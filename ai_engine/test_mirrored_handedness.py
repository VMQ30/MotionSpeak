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

def main():
    video_path = "../sample.mp4"
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

    frames_normal = []
    frames_swapped = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        upright = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
        rgb = cv2.cvtColor(upright, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        pose_result = pose_landmarker.detect(mp_image)
        hand_result = hand_landmarker.detect(mp_image)

        pose = np.zeros((33, 3))
        lh_norm = np.zeros((21, 3))
        rh_norm = np.zeros((21, 3))

        has_pose = pose_result.pose_landmarks and len(pose_result.pose_landmarks) > 0
        has_hand = hand_result.hand_landmarks and len(hand_result.hand_landmarks) > 0

        if has_hand and hand_result.handedness:
            for idx, hand_info in enumerate(hand_result.handedness):
                label = hand_info[0].category_name
                raw_hand = np.array([[lm.x, lm.y, lm.z] for lm in hand_result.hand_landmarks[idx]])

                if has_pose:
                    pose = np.array([[lm.x, lm.y, lm.z] for lm in pose_result.pose_landmarks[0]])
                    left_shoulder, right_shoulder = pose[11], pose[12]
                    center_anchor = (left_shoulder + right_shoulder) / 2.0
                    shoulder_dist = np.linalg.norm(left_shoulder - right_shoulder)
                    scale_factor = shoulder_dist if shoulder_dist > 1e-6 else 1.0
                    pose = (pose - center_anchor) / scale_factor
                    norm_hand = (raw_hand - center_anchor) / scale_factor
                else:
                    norm_hand = raw_hand

                if label == "Left":
                    lh_norm = norm_hand
                elif label == "Right":
                    rh_norm = norm_hand

        # Normal vector: Pose + Left + Right
        kp_normal = np.concatenate([pose.flatten(), lh_norm.flatten(), rh_norm.flatten()])

        # Swapped vector: Pose + Right in Left slot, Left in Right slot (simulating selfie mirror swap)
        kp_swapped = np.concatenate([pose.flatten(), rh_norm.flatten(), lh_norm.flatten()])

        frames_normal.append(kp_normal)
        frames_swapped.append(kp_swapped)

    cap.release()

    # Load TFLite
    interpreter = tf.lite.Interpreter(model_path="motion_speak_model.tflite")
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    # Evaluate Normal
    indices = np.linspace(0, len(frames_normal) - 1, 30, dtype=int)
    inp_norm = np.expand_dims(np.array([frames_normal[i] for i in indices]), axis=0).astype(np.float32)
    interpreter.set_tensor(input_details[0]['index'], inp_norm)
    interpreter.invoke()
    out_norm = interpreter.get_tensor(output_details[0]['index'])[0]

    # Evaluate Swapped
    inp_swap = np.expand_dims(np.array([frames_swapped[i] for i in indices]), axis=0).astype(np.float32)
    interpreter.set_tensor(input_details[0]['index'], inp_swap)
    interpreter.invoke()
    out_swap = interpreter.get_tensor(output_details[0]['index'])[0]

    print("\n--- NORMAL (Right hand in Right Hand slot: index 162..224) ---")
    indexed_norm = sorted(enumerate(out_norm), key=lambda x: x[1], reverse=True)
    for rank, (cls_idx, prob) in enumerate(indexed_norm[:5], 1):
        print(f"Rank {rank}: {TARGET_GLOSSES[cls_idx]:12s} -> {prob * 100:6.2f}%")

    print("\n--- SWAPPED (Right hand placed into Left Hand slot: index 99..161) ---")
    indexed_swap = sorted(enumerate(out_swap), key=lambda x: x[1], reverse=True)
    for rank, (cls_idx, prob) in enumerate(indexed_swap[:5], 1):
        print(f"Rank {rank}: {TARGET_GLOSSES[cls_idx]:12s} -> {prob * 100:6.2f}%")

if __name__ == "__main__":
    main()
