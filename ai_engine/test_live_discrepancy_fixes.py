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
    tflite_path = "motion_speak_model.tflite"
    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    pose_options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=os.path.abspath("pose_landmarker.task")),
        running_mode=vision.RunningMode.IMAGE,
    )
    pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=os.path.abspath("hand_landmarker.task")),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)

    sample_p = "../sample.mp4"
    if not os.path.exists(sample_p): sample_p = "sample.mp4"

    cap = cv2.VideoCapture(sample_p)
    fps = cap.get(cv2.CAP_PROP_FPS)

    print("=" * 80)
    print("EMPIRICAL TEST OF LIVE DISCREPANCY FIXES ON sample.mp4")
    print("=" * 80)

    # 1. Test Pose Validation vs Wrist Fallback
    valid_pose_frames = []
    invalid_pose_frames = []
    wrist_fallback_frames = []

    frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        fh, fw = frame.shape[:2]
        max_dim = max(fh, fw)
        pad_w = (max_dim - fw) // 2
        pad_h = (max_dim - fh) // 2
        sq = cv2.copyMakeBorder(frame, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])

        rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        p_res = pose_landmarker.detect(mp_img)
        h_res = hand_landmarker.detect(mp_img)

        has_p = bool(p_res.pose_landmarks and len(p_res.pose_landmarks) > 0)
        has_h = bool(h_res.hand_landmarks and len(h_res.hand_landmarks) > 0)

        if has_p and len(p_res.pose_landmarks[0]) > 12:
            p_list = p_res.pose_landmarks[0]
            l_sh, r_sh = p_list[11], p_list[12]
            cx, cy = (l_sh.x + r_sh.x)/2.0, (l_sh.y + r_sh.y)/2.0
            dist = np.sqrt((l_sh.x-r_sh.x)**2 + (l_sh.y-r_sh.y)**2 + (l_sh.z-r_sh.z)**2)
            if 0.05 <= dist <= 0.70 and 0.05 <= cx <= 0.95 and 0.05 <= cy <= 0.95:
                valid_pose_frames.append(frame_idx)
            else:
                invalid_pose_frames.append(frame_idx)

        frame_idx += 1

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    print(f"Total Frames: {frame_idx}")
    print(f"Valid Pose Frames: {len(valid_pose_frames)} / {frame_idx} ({len(valid_pose_frames)/frame_idx*100:.1f}%)")
    print(f"Invalid Pose Frames: {len(invalid_pose_frames)} / {frame_idx}")

if __name__ == "__main__":
    main()
