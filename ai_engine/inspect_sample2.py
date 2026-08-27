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

def process_video(video_path, angle):
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
    hand_count = 0
    pose_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        if angle == 90:
            frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
        elif angle == 180:
            frame = cv2.rotate(frame, cv2.ROTATE_180)
        elif angle == 270:
            frame = cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)

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
            pose_count += 1
        if has_hand:
            hand_count += 1

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

    if len(frames_keypoints) == 0:
        return 0, 0, None

    indices = np.linspace(0, len(frames_keypoints) - 1, 30, dtype=int)
    sampled_kp = np.array([frames_keypoints[i] for i in indices])
    input_data = np.expand_dims(sampled_kp, axis=0).astype(np.float32)

    interpreter = tf.lite.Interpreter(model_path="motion_speak_model.tflite")
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    interpreter.set_tensor(input_details[0]['index'], input_data)
    interpreter.invoke()
    output = interpreter.get_tensor(output_details[0]['index'])[0]

    return pose_count, hand_count, output

def main():
    video_path = "../sample_2.mp4"
    if not os.path.exists(video_path):
        print(f"Video file not found: {video_path}")
        return

    cap = cv2.VideoCapture(video_path)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_f = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    cap.release()

    print(f"--- sample_2.mp4 Info: {w}x{h} @ {fps:.1f} FPS, {total_f} frames ---")

    for angle in [0, 90, 180, 270]:
        pose_cnt, hand_cnt, output = process_video(video_path, angle)
        print(f"\nAngle {angle:3d}° -> Poses={pose_cnt}/{total_f}, Hands={hand_cnt}/{total_f}")
        if output is not None:
            indexed_probs = sorted(enumerate(output), key=lambda x: x[1], reverse=True)
            top1_cls, top1_prob = indexed_probs[0]
            top2_cls, top2_prob = indexed_probs[1]
            sorry_prob = output[TARGET_GLOSSES.index("sorry")]
            print(f"  Top 1: {TARGET_GLOSSES[top1_cls]:12s} ({top1_prob*100:6.2f}%)")
            print(f"  Top 2: {TARGET_GLOSSES[top2_cls]:12s} ({top2_prob*100:6.2f}%)")
            print(f"  Sorry: {'sorry':12s} ({sorry_prob*100:6.2f}%)")

if __name__ == "__main__":
    main()
