import os
import glob
import json
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

def analyze_video_full(video_path, name):
    print(f"\n==================================================================")
    print(f"FULL ANALYSIS: {name}")
    print(f"Path: {video_path}")
    print(f"==================================================================")

    if not os.path.exists(video_path):
        print(f"ERROR: Video file not found at {video_path}")
        return None

    cap = cv2.VideoCapture(video_path)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0

    print(f"[Video Metadata]")
    print(f"  Resolution: {w} x {h}")
    print(f"  Aspect Ratio: {w/h:.3f} ({'Landscape' if w >= h else 'Portrait'})")
    print(f"  FPS: {fps:.2f}")
    print(f"  Total Frames: {total_frames}")
    print(f"  Duration: {duration:.2f} seconds")

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

    results_by_angle = {}

    for angle in [0, 90, 180, 270]:
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        frames_keypoints_raw = []
        frames_keypoints_front_cam_fixed = []

        pose_cnt = 0
        hand_cnt = 0
        handedness_counts = {}

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
            lh_raw = np.zeros((21, 3))
            rh_raw = np.zeros((21, 3))
            lh_fixed = np.zeros((21, 3))
            rh_fixed = np.zeros((21, 3))

            has_pose = pose_result.pose_landmarks and len(pose_result.pose_landmarks) > 0
            has_hand = hand_result.hand_landmarks and len(hand_result.hand_landmarks) > 0

            if has_pose:
                pose_cnt += 1
                pose = np.array([[lm.x, lm.y, lm.z] for lm in pose_result.pose_landmarks[0]])
                left_shoulder, right_shoulder = pose[11], pose[12]
                center_anchor = (left_shoulder + right_shoulder) / 2.0
                shoulder_dist = np.linalg.norm(left_shoulder - right_shoulder)
                scale_factor = shoulder_dist if shoulder_dist > 1e-6 else 1.0
                pose = (pose - center_anchor) / scale_factor

            if has_hand:
                hand_cnt += 1
                for idx, hand_info in enumerate(hand_result.handedness):
                    label = hand_info[0].category_name
                    handedness_counts[label] = handedness_counts.get(label, 0) + 1
                    raw_hand = np.array([[lm.x, lm.y, lm.z] for lm in hand_result.hand_landmarks[idx]])

                    if has_pose:
                        norm_hand = (raw_hand - center_anchor) / scale_factor
                    else:
                        norm_hand = raw_hand

                    # Raw mapping
                    if label == "Left":
                        lh_raw = norm_hand
                    elif label == "Right":
                        rh_raw = norm_hand

                    # Front selfie camera inverted mapping (Left -> Right, Right -> Left)
                    effective_label = "Right" if label == "Left" else "Left"
                    if effective_label == "Left":
                        lh_fixed = norm_hand
                    elif effective_label == "Right":
                        rh_fixed = norm_hand

            kp_raw = np.concatenate([pose.flatten(), lh_raw.flatten(), rh_raw.flatten()])
            kp_fixed = np.concatenate([pose.flatten(), lh_fixed.flatten(), rh_fixed.flatten()])

            frames_keypoints_raw.append(kp_raw)
            frames_keypoints_front_cam_fixed.append(kp_fixed)

        # Evaluate model on 30-frame window
        tflite_path = "motion_speak_model.tflite"
        output_raw, output_fixed = None, None

        if len(frames_keypoints_raw) > 0 and os.path.exists(tflite_path):
            interpreter = tf.lite.Interpreter(model_path=tflite_path)
            interpreter.allocate_tensors()
            input_details = interpreter.get_input_details()
            output_details = interpreter.get_output_details()

            indices = np.linspace(0, len(frames_keypoints_raw) - 1, 30, dtype=int)
            sampled_raw = np.array([frames_keypoints_raw[i] for i in indices])
            sampled_fixed = np.array([frames_keypoints_front_cam_fixed[i] for i in indices])

            inp_raw = np.expand_dims(sampled_raw, axis=0).astype(np.float32)
            inp_fixed = np.expand_dims(sampled_fixed, axis=0).astype(np.float32)

            interpreter.set_tensor(input_details[0]['index'], inp_raw)
            interpreter.invoke()
            output_raw = interpreter.get_tensor(output_details[0]['index'])[0]

            interpreter.set_tensor(input_details[0]['index'], inp_fixed)
            interpreter.invoke()
            output_fixed = interpreter.get_tensor(output_details[0]['index'])[0]

        results_by_angle[angle] = {
            "pose_count": pose_cnt,
            "hand_count": hand_cnt,
            "handedness": handedness_counts,
            "total": total_frames,
            "output_raw": output_raw,
            "output_fixed": output_fixed,
        }

    cap.release()

    print(f"\n[Multi-Angle Landmark & Model Performance Summary]")
    for angle, data in results_by_angle.items():
        print(f"\n--- Angle {angle:3d}° ---")
        print(f"  Pose Detections: {data['pose_count']}/{data['total']} frames ({data['pose_count']/max(1, data['total'])*100:.1f}%)")
        print(f"  Hand Detections: {data['hand_count']}/{data['total']} frames ({data['hand_count']/max(1, data['total'])*100:.1f}%)")
        print(f"  Handedness Breakdown: {data['handedness']}")

        if data['output_raw'] is not None:
            raw_top = sorted(enumerate(data['output_raw']), key=lambda x: x[1], reverse=True)[:3]
            print(f"  Model Prediction (Raw Handedness):")
            for rank, (c, p) in enumerate(raw_top, 1):
                print(f"    {rank}. {TARGET_GLOSSES[c]:12s} : {p*100:6.2f}%")

        if data['output_fixed'] is not None:
            fix_top = sorted(enumerate(data['output_fixed']), key=lambda x: x[1], reverse=True)[:3]
            print(f"  Model Prediction (Selfie Mirror Fixed):")
            for rank, (c, p) in enumerate(fix_top, 1):
                print(f"    {rank}. {TARGET_GLOSSES[c]:12s} : {p*100:6.2f}%")

    return results_by_angle

def main():
    print("Beginning Deep Investigation of sample_3.mp4 and Training Dataset...")

    # 1. Investigate sample_3.mp4
    analyze_video_full("../sample_3.mp4", "sample_3.mp4 (Root Directory Test Video)")

    # 2. Investigate sample.mp4 and sample_2.mp4
    analyze_video_full("../sample.mp4", "sample.mp4 (Root Directory Test Video 1)")
    analyze_video_full("../sample_2.mp4", "sample_2.mp4 (Root Directory Test Video 2)")

    # 3. Investigate dataset sample videos
    sorry_vids = glob.glob("dataset/new_videos/Sorry/*.mp4")[:2]
    for vid in sorry_vids:
        analyze_video_full(vid, f"Training Dataset: {os.path.basename(vid)}")

if __name__ == "__main__":
    main()
