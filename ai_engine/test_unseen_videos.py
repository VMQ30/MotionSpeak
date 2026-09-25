import os
import cv2
import numpy as np
import tensorflow as tf
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse", "background"
]

def process_video_and_predict(video_path, tflite_path, expected_gesture):
    pose_task = "android/app/src/main/assets/pose_landmarker.task"
    if not os.path.exists(pose_task):
        pose_task = "pose_landmarker.task"

    hand_task = "android/app/src/main/assets/hand_landmarker.task"
    if not os.path.exists(hand_task):
        hand_task = "hand_landmarker.task"

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

    cap = cv2.VideoCapture(video_path)
    frames_keypoints = []
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

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

        if has_pose:
            pose = np.array([[lm.x, lm.y, lm.z] for lm in pose_result.pose_landmarks[0]])
            left_shoulder, right_shoulder = pose[11], pose[12]
            center_anchor = (left_shoulder + right_shoulder) / 2.0
            shoulder_dist = np.linalg.norm(left_shoulder - right_shoulder)
            scale_factor = shoulder_dist if shoulder_dist > 1e-6 else 1.0
            pose = (pose - center_anchor) / scale_factor

        if has_hand:
            for idx, hand_info in enumerate(hand_result.handedness):
                raw_label = hand_info[0].category_name
                raw_hand = np.array([[lm.x, lm.y, lm.z] for lm in hand_result.hand_landmarks[idx]])

                if has_pose:
                    norm_hand = (raw_hand - center_anchor) / scale_factor
                else:
                    norm_hand = raw_hand

                if raw_label == "Left":
                    lh = norm_hand
                elif raw_label == "Right":
                    rh = norm_hand

        kp = np.concatenate([pose.flatten(), lh.flatten(), rh.flatten()])
        frames_keypoints.append(kp)

    cap.release()

    if len(frames_keypoints) == 0:
        return {
            "video": video_path,
            "expected": expected_gesture,
            "status": "No frames extracted"
        }

    indices = np.linspace(0, len(frames_keypoints) - 1, 30, dtype=int)
    sampled_kp = np.array([frames_keypoints[i] for i in indices])
    input_tensor = np.expand_dims(sampled_kp, axis=0).astype(np.float32)

    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    interpreter.set_tensor(input_details[0]['index'], input_tensor)
    interpreter.invoke()
    output = interpreter.get_tensor(output_details[0]['index'])[0]

    indexed_probs = sorted(enumerate(output), key=lambda x: x[1], reverse=True)
    top1_gloss = TARGET_GLOSSES[indexed_probs[0][0]]
    top1_prob = float(indexed_probs[0][1])

    top2_gloss = TARGET_GLOSSES[indexed_probs[1][0]]
    top2_prob = float(indexed_probs[1][1])

    return {
        "video": video_path,
        "expected": expected_gesture,
        "total_frames": total_frames,
        "top1_pred": top1_gloss,
        "top1_conf": top1_prob,
        "top2_pred": top2_gloss,
        "top2_conf": top2_prob,
        "tensor_min": float(np.min(input_tensor)),
        "tensor_max": float(np.max(input_tensor)),
        "tensor_mean": float(np.mean(input_tensor)),
        "tensor_std": float(np.std(input_tensor)),
        "is_correct": top1_gloss.lower() == expected_gesture.lower()
    }

def main():
    print("=" * 80)
    print("EVALUATING MODEL ON UNSEEN REAL-WORLD SAMPLE VIDEOS")
    print("=" * 80)

    tflite_path = "android/app/src/main/assets/motion_speak_model.tflite"
    if not os.path.exists(tflite_path):
        tflite_path = "motion_speak_model.tflite"

    # Find sample mp4 / avi / mov files in project root or subfolders
    sample_files = []
    for root, dirs, files in os.walk("."):
        if "node_modules" in root or ".git" in root or "venv" in root or "processed_data" in root:
            continue
        for f in files:
            if f.endswith((".mp4", ".mov", ".avi")):
                sample_files.append(os.path.join(root, f))

    print(f"Found {len(sample_files)} sample video files: {sample_files}")

    for v_path in sample_files:
        expected = "sorry"
        low = v_path.lower()
        if "hello" in low: expected = "hello"
        elif "yes" in low: expected = "yes"
        elif "no" in low: expected = "no"
        elif "good" in low: expected = "good"
        elif "thank" in low: expected = "thank you"
        elif "welcome" in low: expected = "welcome"
        elif "please" in low: expected = "please"
        elif "sorry" in low: expected = "sorry"

        res = process_video_and_predict(v_path, tflite_path, expected)
        if "top1_pred" in res:
            print(f"\nVideo: {res['video']}")
            print(f"Expected gesture: {res['expected']}")
            print(f"Python TFLite Prediction: {res.get('top1_pred')} ({res.get('top1_conf', 0)*100:.1f}%)")
            print(f"Second Prediction: {res.get('top2_pred')} ({res.get('top2_conf', 0)*100:.1f}%)")
            print(f"Tensor Min/Max: {res.get('tensor_min'):.2f} / {res.get('tensor_max'):.2f}")
            print(f"Correct: {res.get('is_correct')}")

if __name__ == "__main__":
    main()
