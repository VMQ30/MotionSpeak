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
        video_path = "sample.mp4"

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

    tflite_path = "motion_speak_model.tflite"
    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    def run_pipeline(flip_bitmap, swap_handedness, rotate_angle=0):
        cap = cv2.VideoCapture(video_path)
        frame_history = []

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            img = frame.copy()
            if rotate_angle == 90:
                img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
            elif rotate_angle == 180:
                img = cv2.rotate(img, cv2.ROTATE_180)
            elif rotate_angle == 270:
                img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

            if flip_bitmap:
                img = cv2.flip(img, 1)

            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            pose_res = pose_landmarker.detect(mp_img)
            hand_res = hand_landmarker.detect(mp_img)

            features = np.zeros(225, dtype=np.float32)
            has_pose = bool(pose_res.pose_landmarks and len(pose_res.pose_landmarks) > 0)
            has_hand = bool(hand_res.hand_landmarks and len(hand_res.hand_landmarks) > 0)

            center_anchor = [0.5, 0.5, 0.0]
            scale_factor = 1.0
            is_pose_valid = False

            if has_pose and len(pose_res.pose_landmarks[0]) > 12:
                p_list = pose_res.pose_landmarks[0]
                l_sh = p_list[11]
                r_sh = p_list[12]
                cx = (l_sh.x + r_sh.x) / 2.0
                cy = (l_sh.y + r_sh.y) / 2.0
                cz = (l_sh.z + r_sh.z) / 2.0
                dist = np.sqrt((l_sh.x - r_sh.x)**2 + (l_sh.y - r_sh.y)**2 + (l_sh.z - r_sh.z)**2)

                if 0.10 <= dist <= 0.70 and 0.15 <= cx <= 0.85 and 0.15 <= cy <= 0.85:
                    center_anchor = [cx, cy, cz]
                    scale_factor = max(dist, 0.18)
                    is_pose_valid = True

                    for p in range(min(33, len(p_list))):
                        lm = p_list[p]
                        features[p*3] = (lm.x - center_anchor[0]) / scale_factor
                        features[p*3+1] = (lm.y - center_anchor[1]) / scale_factor
                        features[p*3+2] = (lm.z - center_anchor[2]) / scale_factor

            if has_hand and hand_res.handedness:
                for idx in range(min(len(hand_res.hand_landmarks), len(hand_res.handedness))):
                    raw_cat = hand_res.handedness[idx][0].category_name
                    h_list = hand_res.hand_landmarks[idx]

                    if not is_pose_valid and idx == 0:
                        wrist = h_list[0]
                        mid = h_list[9] if len(h_list) > 9 else wrist
                        hdist = np.sqrt((wrist.x-mid.x)**2 + (wrist.y-mid.y)**2 + (wrist.z-mid.z)**2)
                        center_anchor = [wrist.x, wrist.y + 0.15, wrist.z]
                        scale_factor = max(hdist * 2.2, 0.25)

                    effective_cat = ("Right" if raw_cat.lower() == "left" else "Left") if swap_handedness else raw_cat
                    offset = 99 if effective_cat.lower() == "left" else 162

                    for h in range(min(21, len(h_list))):
                        lm = h_list[h]
                        features[offset + h*3] = (lm.x - center_anchor[0]) / scale_factor
                        features[offset + h*3+1] = (lm.y - center_anchor[1]) / scale_factor
                        features[offset + h*3+2] = (lm.z - center_anchor[2]) / scale_factor

            if has_hand:
                frame_history.append(features)
                if len(frame_history) > 30:
                    frame_history.pop(0)

        cap.release()

        if len(frame_history) < 6:
            return 0.0, "No Hand / Too few frames", 0

        input_tensor = np.zeros((1, 30, 225), dtype=np.float32)
        count = len(frame_history)
        for i in range(30):
            src_idx = (i * count) // 30
            input_tensor[0, i] = frame_history[min(src_idx, count - 1)]

        interpreter.set_tensor(input_details[0]['index'], input_tensor)
        interpreter.invoke()
        out = interpreter.get_tensor(output_details[0]['index'])[0]

        top_cls = np.argmax(out)
        top_prob = out[top_cls]
        return top_prob, TARGET_GLOSSES[top_cls], len(frame_history)

    print("=" * 70)
    print("TESTING DOUBLE FLIP & FLIP/SWAP COMBINATIONS ON sample.mp4 (Rotate 0°)")
    print("=" * 70)

    cases = [
        ("Case 1: No Bitmap Flip, Swap Handedness (Correct Single Swap)", False, True, 0),
        ("Case 2: Bitmap Flip + Swap Handedness (CURRENT APP: DOUBLE FLIP!)", True, True, 0),
        ("Case 3: Bitmap Flip, No Swap Handedness (Single Flip)", True, False, 0),
        ("Case 4: No Bitmap Flip, No Swap Handedness (Raw Unswapped)", False, False, 0),
        ("Case 5: Rotate 90° CW, Bitmap Flip, Swap Handedness (CURRENT APP CAMERA CODE)", True, True, 90),
    ]

    for name, flip_bm, swap_hd, rot in cases:
        prob, gloss, frames = run_pipeline(flip_bm, swap_hd, rot)
        print(f"\n{name}:")
        print(f"  Result: Gloss='{gloss}' (Confidence: {prob*100:.2f}%) | Frames evaluated: {frames}")

if __name__ == "__main__":
    main()
