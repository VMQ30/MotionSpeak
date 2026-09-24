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

def format_gloss_text(g):
    return " ".join([w.capitalize() for w in g.split(" ")])

def run_gesture_test(video_path, expected_gloss, is_front_camera=True):
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
    frame_history = []
    hand_detected_count = 0
    total_frames = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        total_frames += 1

        fh, fw = frame.shape[:2]
        max_dim = max(fh, fw)
        pad_w = (max_dim - fw) // 2
        pad_h = (max_dim - fh) // 2
        sq = cv2.copyMakeBorder(frame, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])

        rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        pose_result = pose_landmarker.detect(mp_image)
        hand_result = hand_landmarker.detect(mp_image)

        feat = np.zeros(225, dtype=np.float32)
        has_pose = bool(pose_result.pose_landmarks and len(pose_result.pose_landmarks) > 0 and len(pose_result.pose_landmarks[0]) > 12)
        has_hand = bool(hand_result.hand_landmarks and len(hand_result.hand_landmarks) > 0)

        anchor = [0.5, 0.5, 0.0]
        scale = 1.0

        if has_pose:
            p_list = pose_result.pose_landmarks[0]
            l_sh, r_sh = p_list[11], p_list[12]
            cx = (l_sh.x + r_sh.x) / 2.0
            cy = (l_sh.y + r_sh.y) / 2.0
            cz = (l_sh.z + r_sh.z) / 2.0
            dist = np.sqrt((l_sh.x - r_sh.x)**2 + (l_sh.y - r_sh.y)**2 + (l_sh.z - r_sh.z)**2)

            if 0.05 <= dist <= 0.70 and 0.05 <= cx <= 0.95 and 0.05 <= cy <= 0.95:
                anchor = [cx, cy, cz]
                scale = max(dist, 0.15)
                for p in range(min(33, len(p_list))):
                    lm = p_list[p]
                    feat[p*3] = (lm.x - anchor[0]) / scale
                    feat[p*3+1] = (lm.y - anchor[1]) / scale
                    feat[p*3+2] = (lm.z - anchor[2]) / scale

        if has_hand and hand_result.handedness:
            hand_detected_count += 1
            for idx in range(min(len(hand_result.hand_landmarks), len(hand_result.handedness))):
                raw_cat = hand_result.handedness[idx][0].category_name
                h_list = hand_result.hand_landmarks[idx]

                # Android Canonical Logic:
                # If video was recorded from selfie front camera, MediaPipe returns mirrored "Left" for physical right hand
                # If non-mirrored video (dataset), MediaPipe returns "Right" for physical right hand
                eff_cat = ("Right" if raw_cat.lower() == "left" else "Left") if is_front_camera else raw_cat
                off = 99 if eff_cat.lower() == "left" else 162

                for h in range(min(21, len(h_list))):
                    lm = h_list[h]
                    feat[off + h*3] = (lm.x - anchor[0]) / scale
                    feat[off + h*3+1] = (lm.y - anchor[1]) / scale
                    feat[off + h*3+2] = (lm.z - anchor[2]) / scale

            frame_history.append(feat)

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    if len(frame_history) < 6:
        return {
            "expected": expected_gloss,
            "predicted": "Unknown",
            "confidence": 0,
            "top3": "N/A",
            "hand_detection": f"Insufficient frames ({hand_detected_count}/{total_frames})",
            "sequence": f"Frames={len(frame_history)}/30",
            "ui_translation": "Scanning..."
        }

    # Resample frame history to 30 timesteps (matching Android buildHistoryInputTensor)
    input_tensor = np.zeros((1, 30, 225), dtype=np.float32)
    cnt = len(frame_history)
    for i in range(30):
        src_idx = (i * cnt) // 30
        input_tensor[0, i] = frame_history[min(src_idx, cnt - 1)]

    interpreter = tf.lite.Interpreter(model_path="motion_speak_model.tflite")
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    interpreter.set_tensor(input_details[0]['index'], input_tensor)
    interpreter.invoke()
    out = interpreter.get_tensor(output_details[0]['index'])[0]

    indexed = sorted(enumerate(out), key=lambda x: x[1], reverse=True)
    top1 = indexed[0]
    top2 = indexed[1]
    top3 = indexed[2]

    predicted_gloss = TARGET_GLOSSES[top1[0]]
    conf_pct = int(top1[1] * 100)

    top3_str = f"1.{TARGET_GLOSSES[top1[0]]} ({int(top1[1]*100)}%), 2.{TARGET_GLOSSES[top2[0]]} ({int(top2[1]*100)}%), 3.{TARGET_GLOSSES[top3[0]]} ({int(top3[1]*100)}%)"
    ui_translation = format_gloss_text(predicted_gloss) if conf_pct >= 10 else "Unknown"

    return {
        "expected": expected_gloss,
        "predicted": predicted_gloss,
        "confidence": f"{conf_pct}%",
        "top3": top3_str,
        "hand_detection": f"DETECTED ({hand_detected_count}/{total_frames} frames)",
        "sequence": f"{cnt} active frames -> Resampled to 30",
        "ui_translation": ui_translation
    }

def main():
    print("=" * 90)
    print("REPRESENTATIVE FSL GESTURE PIPELINE VERIFICATION TEST")
    print("=" * 90)

    test_gestures = [
        ("Hello", "dataset/new_videos/Hello"),
        ("Yes", "dataset/new_videos/Yes"),
        ("No", "dataset/new_videos/No"),
        ("Good", "dataset/new_videos/Good"),
        ("Bad", "dataset/new_videos/Bad"),
        ("What", "dataset/new_videos/what"),
        ("Thank You", "dataset/new_videos/thankyou"),
        ("Sorry", "dataset/new_videos/Sorry"),
        ("Excuse", "dataset/new_videos/excuse"),
        ("Goodbye", "dataset/new_videos/goodbye"),
    ]

    results = []
    for gloss_label, folder_path in test_gestures:
        if os.path.exists(folder_path):
            files = [f for f in os.listdir(folder_path) if f.endswith(".mp4")]
            if files:
                v_path = os.path.join(folder_path, files[0])
                res = run_gesture_test(v_path, gloss_label.lower(), is_front_camera=False)
                results.append((gloss_label, os.path.basename(v_path), res))

    print(f"\n{'Expected':12s} | {'Predicted':12s} | {'Conf':6s} | {'Hand Detection':24s} | {'Final UI Translation':20s}")
    print("-" * 80)
    for expected, fname, res in results:
        match_symbol = "[OK]" if res['expected'].lower() == res['predicted'].lower() else "[MISMATCH]"
        print(f"{res['expected']:12s} | {res['predicted']:12s} | {res['confidence']:6s} | {res['hand_detection']:24s} | {match_symbol:10s} {res['ui_translation']:18s}")

    print("\n--- Detailed Gesture Verification Log ---")
    for expected, fname, res in results:
        print(f"\nExpected: {res['expected']}")
        print(f"Predicted: {res['predicted']}")
        print(f"Confidence: {res['confidence']}")
        print(f"Top 3: {res['top3']}")
        print(f"Hand detection: {res['hand_detection']}")
        print(f"Sequence: {res['sequence']}")
        print(f"Final UI translation: {res['ui_translation']}")

if __name__ == "__main__":
    main()
