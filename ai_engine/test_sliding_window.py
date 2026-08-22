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
    if not os.path.exists(video_path):
        print(f"Video file not found: {video_path}")
        return

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

    cap = cv2.VideoCapture(video_path)
    frames_keypoints = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        pose_result = pose_landmarker.detect(mp_image)
        hand_result = hand_landmarker.detect(mp_image)

        pose = np.zeros((33, 3))
        lh = np.zeros((21, 3))
        rh = np.zeros((21, 3))

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
                    lh = norm_hand
                elif label == "Right":
                    rh = norm_hand

        kp = np.concatenate([pose.flatten(), lh.flatten(), rh.flatten()])
        frames_keypoints.append(kp)

    cap.release()
    total_frames = len(frames_keypoints)
    print(f"Total frames extracted: {total_frames}")

    interpreter = tf.lite.Interpreter(model_path="motion_speak_model.tflite")
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    print("\n--- Sliding 30-Frame Window Predictions across sample.mp4 ---")

    # Sliding window of 30-45 frames (~1.0 to 1.5 seconds)
    window_sizes = [30, 45, 60]
    best_sorry_score = 0.0
    best_window_info = ""

    for win_size in window_sizes:
        for start_f in range(0, total_frames - win_size + 1, 10):
            sub_seq = frames_keypoints[start_f : start_f + win_size]
            indices = np.linspace(0, len(sub_seq) - 1, 30, dtype=int)
            sampled_kp = np.array([sub_seq[i] for i in indices])
            input_data = np.expand_dims(sampled_kp, axis=0).astype(np.float32)

            interpreter.set_tensor(input_details[0]['index'], input_data)
            interpreter.invoke()
            output = interpreter.get_tensor(output_details[0]['index'])[0]

            indexed_probs = sorted(enumerate(output), key=lambda x: x[1], reverse=True)
            top1_cls, top1_prob = indexed_probs[0]
            top1_gloss = TARGET_GLOSSES[top1_cls]
            sorry_prob = output[TARGET_GLOSSES.index("sorry")]

            if sorry_prob > best_sorry_score:
                best_sorry_score = sorry_prob
                best_window_info = f"Frames {start_f:3d}..{start_f+win_size:3d}: Top1={top1_gloss} ({top1_prob*100:.1f}%), sorry={sorry_prob*100:.2f}%"

            if top1_gloss == "sorry" or sorry_prob > 0.20 or top1_prob > 0.50:
                print(f"Window {win_size}f | Frames {start_f:3d}..{start_f+win_size:3d}: Top1={top1_gloss:12s} ({top1_prob*100:5.1f}%) | sorry={sorry_prob*100:5.1f}%")

    print(f"\nBest 'sorry' score window: {best_window_info}")

if __name__ == "__main__":
    main()
