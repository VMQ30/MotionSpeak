import os
import time
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

    video_path = "../sample.mp4"
    if not os.path.exists(video_path): video_path = "sample.mp4"

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps

    print(f"=== RUNTIME DATA-FLOW TEST ON sample.mp4 ===")
    print(f"File: {os.path.abspath(video_path)}")
    print(f"Resolution: {int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}")
    print(f"FPS: {fps:.2f} | Total Frames: {total_frames} | Duration: {duration:.2f}s")

    # Trace full video extraction
    history_all = []
    frame_times = []
    processing_times = []

    frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        t_start = time.time()

        fh, fw = frame.shape[:2]
        max_dim = max(fh, fw)
        pad_w = (max_dim - fw) // 2
        pad_h = (max_dim - fh) // 2
        sq = cv2.copyMakeBorder(frame, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])

        rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        p_res = pose_landmarker.detect(mp_img)
        h_res = hand_landmarker.detect(mp_img)

        feat = np.zeros(225, dtype=np.float32)
        has_p = bool(p_res.pose_landmarks and len(p_res.pose_landmarks) > 0)
        has_h = bool(h_res.hand_landmarks and len(h_res.hand_landmarks) > 0)

        anchor = [0.5, 0.5, 0.0]
        scale = 1.0
        p_valid = False

        if has_p and len(p_res.pose_landmarks[0]) > 12:
            p_list = p_res.pose_landmarks[0]
            l_sh, r_sh = p_list[11], p_list[12]
            cx, cy, cz = (l_sh.x + r_sh.x)/2.0, (l_sh.y + r_sh.y)/2.0, (l_sh.z + r_sh.z)/2.0
            dist = np.sqrt((l_sh.x-r_sh.x)**2 + (l_sh.y-r_sh.y)**2 + (l_sh.z-r_sh.z)**2)
            if 0.05 <= dist <= 0.70 and 0.05 <= cx <= 0.95 and 0.05 <= cy <= 0.95:
                anchor = [cx, cy, cz]
                scale = max(dist, 0.15)
                p_valid = True
                for p in range(min(33, len(p_list))):
                    lm = p_list[p]
                    feat[p*3] = (lm.x - anchor[0])/scale
                    feat[p*3+1] = (lm.y - anchor[1])/scale
                    feat[p*3+2] = (lm.z - anchor[2])/scale

        if has_h and h_res.handedness:
            for idx in range(min(len(h_res.hand_landmarks), len(h_res.handedness))):
                raw_cat = h_res.handedness[idx][0].category_name
                h_list = h_res.hand_landmarks[idx]
                if not p_valid and idx == 0:
                    w = h_list[0]
                    m = h_list[9] if len(h_list) > 9 else w
                    hd = np.sqrt((w.x-m.x)**2 + (w.y-m.y)**2 + (w.z-m.z)**2)
                    anchor = [w.x, w.y + 0.15, w.z]
                    scale = max(hd * 2.2, 0.25)

                eff_cat = "Right" if raw_cat.lower() == "left" else "Left" # Front camera selfie swap
                off = 99 if eff_cat.lower() == "left" else 162
                for h in range(min(21, len(h_list))):
                    lm = h_list[h]
                    feat[off + h*3] = (lm.x - anchor[0])/scale
                    feat[off + h*3+1] = (lm.y - anchor[1])/scale
                    feat[off + h*3+2] = (lm.z - anchor[2])/scale

        t_end = time.time()
        processing_times.append((t_end - t_start) * 1000.0)

        if has_h:
            history_all.append(feat)
            frame_times.append(frame_idx / fps)

        frame_idx += 1

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

    print(f"\nExtracted {len(history_all)} valid hand frames out of {total_frames} total frames.")
    print(f"Average Native Processing Time per Frame: {np.mean(processing_times):.2f} ms")

    # Evaluate 1: Full Video Linspace Resampling (30 frames) - Training Method
    indices_full = np.linspace(0, len(history_all) - 1, 30, dtype=int)
    tensor_full = np.zeros((1, 30, 225), dtype=np.float32)
    for i in range(30):
        tensor_full[0, i] = history_all[indices_full[i]]

    interpreter.set_tensor(input_details[0]['index'], tensor_full)
    interpreter.invoke()
    probs_full = interpreter.get_tensor(output_details[0]['index'])[0]

    # Evaluate 2: Android App Sliding Window (30 recent frames) - App Method
    tensor_app = np.zeros((1, 30, 225), dtype=np.float32)
    recent_30 = history_all[-30:]
    for i in range(30):
        tensor_app[0, i] = recent_30[i]

    interpreter.set_tensor(input_details[0]['index'], tensor_app)
    interpreter.invoke()
    probs_app = interpreter.get_tensor(output_details[0]['index'])[0]

    # Evaluate 3: Early App Window (First 6 frames interpolated to 30) - Partial App Window
    first_6 = history_all[:6]
    tensor_6 = np.zeros((1, 30, 225), dtype=np.float32)
    for i in range(30):
        s_idx = (i * 6) // 30
        tensor_6[0, i] = first_6[min(s_idx, 5)]

    interpreter.set_tensor(input_details[0]['index'], tensor_6)
    interpreter.invoke()
    probs_6 = interpreter.get_tensor(output_details[0]['index'])[0]

    print("\n" + "=" * 80)
    print("NUMERICAL COMPARISON OF TFLITE SOFTMAX PROBABILITIES ACROSS ALL 15 CLASSES")
    print("=" * 80)
    print(f"{'Idx':3s} | {'Class Gloss':12s} | {'Training (30 Resampled)':25s} | {'App (30 Sliding)':22s} | {'App Early (6 Frames)':22s}")
    print("-" * 80)

    for idx in range(15):
        gloss = TARGET_GLOSSES[idx]
        p1 = probs_full[idx] * 100.0
        p2 = probs_app[idx] * 100.0
        p3 = probs_6[idx] * 100.0
        print(f"{idx:3d} | {gloss:12s} | {p1:6.2f}%                    | {p2:6.2f}%                 | {p3:6.2f}%")

    top_full = TARGET_GLOSSES[np.argmax(probs_full)]
    top_app = TARGET_GLOSSES[np.argmax(probs_app)]
    top_6 = TARGET_GLOSSES[np.argmax(probs_6)]

    print("=" * 80)
    print(f"Top-1 Prediction (Full Linspace 30) : {top_full.upper():10s} ({np.max(probs_full)*100:.2f}%)")
    print(f"Top-1 Prediction (App Sliding 30)   : {top_app.upper():10s} ({np.max(probs_app)*100:.2f}%)")
    print(f"Top-1 Prediction (App Early 6)      : {top_6.upper():10s} ({np.max(probs_6)*100:.2f}%)")
    print("=" * 80)

if __name__ == "__main__":
    main()
