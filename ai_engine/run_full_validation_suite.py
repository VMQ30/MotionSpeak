import os
import glob
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

def run_case(video_path, angle, invert_handedness):
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
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frames_keypoints = []

    pose_count = 0
    hand_count = 0

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
            pose = np.array([[lm.x, lm.y, lm.z] for lm in pose_result.pose_landmarks[0]])
            left_shoulder, right_shoulder = pose[11], pose[12]
            center_anchor = (left_shoulder + right_shoulder) / 2.0
            shoulder_dist = np.linalg.norm(left_shoulder - right_shoulder)
            scale_factor = shoulder_dist if shoulder_dist > 1e-6 else 1.0
            pose = (pose - center_anchor) / scale_factor

        if has_hand:
            hand_count += 1
            for idx, hand_info in enumerate(hand_result.handedness):
                raw_label = hand_info[0].category_name
                raw_hand = np.array([[lm.x, lm.y, lm.z] for lm in hand_result.hand_landmarks[idx]])

                if has_pose:
                    norm_hand = (raw_hand - center_anchor) / scale_factor
                else:
                    norm_hand = raw_hand

                effective_label = ("Right" if raw_label == "Left" else "Left") if invert_handedness else raw_label

                if effective_label == "Left":
                    lh = norm_hand
                elif effective_label == "Right":
                    rh = norm_hand

        kp = np.concatenate([pose.flatten(), lh.flatten(), rh.flatten()])
        frames_keypoints.append(kp)

    cap.release()

    if len(frames_keypoints) == 0:
        return None

    indices = np.linspace(0, len(frames_keypoints) - 1, 30, dtype=int)
    sampled_kp = np.array([frames_keypoints[i] for i in indices])
    input_tensor = np.expand_dims(sampled_kp, axis=0).astype(np.float32)

    # Tensor Statistics
    lh_slot = input_tensor[0, :, 99:162]
    rh_slot = input_tensor[0, :, 162:225]

    lh_nonzero = np.sum(np.abs(lh_slot) > 1e-5)
    rh_nonzero = np.sum(np.abs(rh_slot) > 1e-5)

    interpreter = tf.lite.Interpreter(model_path="motion_speak_model.tflite")
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    interpreter.set_tensor(input_details[0]['index'], input_tensor)
    interpreter.invoke()
    output = interpreter.get_tensor(output_details[0]['index'])[0]

    indexed_probs = sorted(enumerate(output), key=lambda x: x[1], reverse=True)
    top1_gloss = TARGET_GLOSSES[indexed_probs[0][0]]
    top1_prob = indexed_probs[0][1]

    top2_gloss = TARGET_GLOSSES[indexed_probs[1][0]]
    top2_prob = indexed_probs[1][1]

    top3_gloss = TARGET_GLOSSES[indexed_probs[2][0]]
    top3_prob = indexed_probs[2][1]

    return {
        "pose_pct": (pose_count / total_frames) * 100,
        "hand_pct": (hand_count / total_frames) * 100,
        "lh_nonzero": lh_nonzero,
        "rh_nonzero": rh_nonzero,
        "tensor_min": float(np.min(input_tensor)),
        "tensor_max": float(np.max(input_tensor)),
        "tensor_mean": float(np.mean(input_tensor)),
        "tensor_std": float(np.std(input_tensor)),
        "top1": f"{top1_gloss} ({top1_prob*100:.2f}%)",
        "top2": f"{top2_gloss} ({top2_prob*100:.2f}%)",
        "top3": f"{top3_gloss} ({top3_prob*100:.2f}%)",
    }

def main():
    print("==========================================================================================")
    print("RUNNING FULL AUTOMATED EXPERIMENTAL VALIDATION SUITE")
    print("==========================================================================================")

    vid_path = "../sample_3.mp4"
    if not os.path.exists(vid_path):
        print(f"Error: {vid_path} not found!")
        return

    # Case A: Incorrect Orientation (0° Unrotated)
    case_a = run_case(vid_path, angle=0, invert_handedness=False)

    # Case B: Correct Orientation (90°) + Raw MediaPipe Handedness (Uninverted)
    case_b = run_case(vid_path, angle=90, invert_handedness=False)

    # Case C: Correct Orientation (90°) + Corrected Selfie Handedness (Inverted)
    case_c = run_case(vid_path, angle=90, invert_handedness=True)

    print("\n--- EXPERIMENT RESULTS ON sample_3.mp4 ---")
    print(f"{'Metric / Parameter':<32} | {'Case A (Unrotated 0°)':<24} | {'Case B (90° Raw Handed)':<24} | {'Case C (90° Selfie Fixed)':<24}")
    print("-" * 110)
    print(f"{'Pose Detection %':<32} | {case_a['pose_pct']:<23.1f}% | {case_b['pose_pct']:<23.1f}% | {case_c['pose_pct']:<23.1f}%")
    print(f"{'Hand Detection %':<32} | {case_a['hand_pct']:<23.1f}% | {case_b['hand_pct']:<23.1f}% | {case_c['hand_pct']:<23.1f}%")
    print(f"{'Left Slot (99..161) Nonzero':<32} | {case_a['lh_nonzero']:<24} | {case_b['lh_nonzero']:<24} | {case_c['lh_nonzero']:<24}")
    print(f"{'Right Slot (162..224) Nonzero':<32} | {case_a['rh_nonzero']:<24} | {case_b['rh_nonzero']:<24} | {case_c['rh_nonzero']:<24}")
    print(f"{'Input Min / Max':<32} | {case_a['tensor_min']:.2f} / {case_a['tensor_max']:.2f:<13} | {case_b['tensor_min']:.2f} / {case_b['tensor_max']:.2f:<13} | {case_c['tensor_min']:.2f} / {case_c['tensor_max']:.2f:<13}")
    print(f"{'Input Mean / Std':<32} | {case_a['tensor_mean']:.3f} / {case_a['tensor_std']:.3f:<11} | {case_b['tensor_mean']:.3f} / {case_b['tensor_std']:.3f:<11} | {case_c['tensor_mean']:.3f} / {case_c['tensor_std']:.3f:<11}")
    print(f"{'Top-1 Prediction':<32} | {case_a['top1']:<24} | {case_b['top1']:<24} | {case_c['top1']:<24}")
    print(f"{'Top-2 Prediction':<32} | {case_a['top2']:<24} | {case_b['top2']:<24} | {case_c['top2']:<24}")
    print(f"{'Top-3 Prediction':<32} | {case_a['top3']:<24} | {case_b['top3']:<24} | {case_c['top3']:<24}")

    print("\n--- REGRESSION TESTING ACROSS MULTIPLE DATASET SIGNS ---")
    glosses_to_test = ["Sorry", "Good", "Bad", "Hello", "Morning", "Goodbye", "Excuse"]
    for gloss in glosses_to_test:
        vids = glob.glob(f"dataset/new_videos/{gloss}/*.mp4")
        if vids:
            res = run_case(vids[0], angle=0, invert_handedness=False)
            print(f"Gloss: {gloss:12s} ({os.path.basename(vids[0]):12s}) -> Pose={res['pose_pct']:5.1f}%, Hand={res['hand_pct']:5.1f}% -> Top1: {res['top1']}")

if __name__ == "__main__":
    main()
