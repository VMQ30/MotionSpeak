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

    print("=" * 80)
    print("CONTROLLED TEST VS REAL-TIME STREAMING SIMULATION INVESTIGATION")
    print("=" * 80)

    # 1. Test sample.mp4 under 75ms Polling Simulation (~13.3 FPS sampling)
    video_path = "../sample.mp4"
    if not os.path.exists(video_path): video_path = "sample.mp4"

    cap = cv2.VideoCapture(video_path)
    video_fps = cap.get(cv2.CAP_PROP_FPS)
    step_frames = max(1, int(round(video_fps * 0.075))) # 75ms step in frames (approx 2.5 frames at 34fps)

    print(f"\nSimulating React Native 75ms Polling on {video_path}:")
    print(f"  Video FPS: {video_fps:.2f} | Polling Step: Every {step_frames} frames ({step_frames / video_fps * 1000:.1f}ms)")

    polled_history = []
    polled_predictions = []

    frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        if frame_idx % step_frames == 0:
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

                    eff_cat = "Right" if raw_cat.lower() == "left" else "Left" # Selfie camera swap
                    off = 99 if eff_cat.lower() == "left" else 162
                    for h in range(min(21, len(h_list))):
                        lm = h_list[h]
                        feat[off + h*3] = (lm.x - anchor[0])/scale
                        feat[off + h*3+1] = (lm.y - anchor[1])/scale
                        feat[off + h*3+2] = (lm.z - anchor[2])/scale

            if has_h:
                polled_history.append(feat)
                if len(polled_history) > 30: polled_history.pop(0)

                # If history has >= 6 frames, run model (App method)
                if len(polled_history) >= 6:
                    cnt = len(polled_history)
                    input_tensor = np.zeros((1, 30, 225), dtype=np.float32)
                    for i in range(30):
                        s_idx = (i * cnt) // 30
                        input_tensor[0, i] = polled_history[min(s_idx, cnt - 1)]

                    interpreter.set_tensor(input_details[0]['index'], input_tensor)
                    interpreter.invoke()
                    out = interpreter.get_tensor(output_details[0]['index'])[0]

                    top_idx = np.argmax(out)
                    top_prob = float(out[top_idx] * 100)
                    polled_predictions.append((frame_idx, cnt, TARGET_GLOSSES[top_idx], top_prob))

        frame_idx += 1

    cap.release()

    print(f"Total Polled Inferences Executed: {len(polled_predictions)}")
    if polled_predictions:
        print(f"Sample Inferences over Time (Frame Index | Buffer Count | Top Gloss | Confidence):")
        for f_i, count, gloss, conf in polled_predictions[::max(1, len(polled_predictions)//6)]:
            print(f"  Frame {f_i:4d} | Buffer {count:2d}/30 | Predicted: '{gloss:10s}' | Confidence: {conf:6.2f}%")

    # 2. Test Window Length Sensitivity (N = 6, 10, 15, 20, 25, 30)
    print("\nWINDOW LENGTH SENSITIVITY TEST (N real frames resampled to 30):")
    if len(polled_history) >= 30:
        for N in [6, 10, 15, 20, 25, 30]:
            sub_hist = polled_history[-N:]
            input_tensor = np.zeros((1, 30, 225), dtype=np.float32)
            for i in range(30):
                s_idx = (i * N) // 30
                input_tensor[0, i] = sub_hist[min(s_idx, N - 1)]

            interpreter.set_tensor(input_details[0]['index'], input_tensor)
            interpreter.invoke()
            out = interpreter.get_tensor(output_details[0]['index'])[0]

            top_idx = np.argmax(out)
            top_prob = float(out[top_idx] * 100)
            print(f"  Real Frames N={N:2d} -> Resampled to 30: Top1='{TARGET_GLOSSES[top_idx]:10s}' ({top_prob:6.2f}%)")

    # 3. Test All 15 Dataset Classes Under Simulated Live Camera Stream
    print("\n" + "=" * 80)
    print("15-CLASS SIMULATED LIVE STREAMING TEST MATRIX")
    print("=" * 80)
    print(f"{'Class Gloss':12s} | {'Test File':22s} | {'Batch Video':18s} | {'Live 75ms Stream':18s} | {'Status':8s}")
    print("-" * 80)

    test_folders = ["Hello", "Yes", "No", "Good", "bad", "what", "thankyou", "welcome", "please", "Sorry", "goodbye", "morning", "afternoon", "evening", "excuse"]
    
    for folder in test_folders:
        fpath = f"dataset/new_videos/{folder}"
        if not os.path.exists(fpath):
            norm = folder.lower().replace(" ", "").replace("_", "")
            for candidate in os.listdir("dataset/new_videos"):
                if candidate.lower().replace(" ", "").replace("_", "") == norm:
                    fpath = f"dataset/new_videos/{candidate}"
                    break

        if os.path.exists(fpath):
            files = [f for f in os.listdir(fpath) if f.endswith(".mp4")]
            if files:
                v_name = files[0]
                full_v = os.path.join(fpath, v_name)

                # Batch Test
                cap_b = cv2.VideoCapture(full_v)
                b_hist = []
                while cap_b.isOpened():
                    ret, frame = cap_b.read()
                    if not ret: break
                    fh, fw = frame.shape[:2]
                    max_dim = max(fh, fw)
                    sq = cv2.copyMakeBorder(frame, (max_dim-fh)//2, (max_dim-fh)//2, (max_dim-fw)//2, (max_dim-fw)//2, cv2.BORDER_CONSTANT, value=[0,0,0])
                    rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
                    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                    p_res = pose_landmarker.detect(mp_img)
                    h_res = hand_landmarker.detect(mp_img)
                    feat = np.zeros(225, dtype=np.float32)
                    if h_res.hand_landmarks and len(h_res.hand_landmarks) > 0:
                        b_hist.append(feat)
                cap_b.release()

                b_pred = "N/A"
                if len(b_hist) >= 6:
                    inp = np.zeros((1, 30, 225), dtype=np.float32)
                    cnt = len(b_hist)
                    for i in range(30): inp[0, i] = b_hist[min((i*cnt)//30, cnt-1)]
                    interpreter.set_tensor(input_details[0]['index'], inp)
                    interpreter.invoke()
                    b_out = interpreter.get_tensor(output_details[0]['index'])[0]
                    b_pred = f"{TARGET_GLOSSES[np.argmax(b_out)]} ({np.max(b_out)*100:.0f}%)"

                # Live 75ms Stream Test
                cap_s = cv2.VideoCapture(full_v)
                v_fps = cap_s.get(cv2.CAP_PROP_FPS) or 30.0
                step = max(1, int(round(v_fps * 0.075)))
                s_hist = []
                s_f_idx = 0
                while cap_s.isOpened():
                    ret, frame = cap_s.read()
                    if not ret: break
                    if s_f_idx % step == 0:
                        fh, fw = frame.shape[:2]
                        max_dim = max(fh, fw)
                        sq = cv2.copyMakeBorder(frame, (max_dim-fh)//2, (max_dim-fh)//2, (max_dim-fw)//2, (max_dim-fw)//2, cv2.BORDER_CONSTANT, value=[0,0,0])
                        rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
                        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                        h_res = hand_landmarker.detect(mp_img)
                        feat = np.zeros(225, dtype=np.float32)
                        if h_res.hand_landmarks and len(h_res.hand_landmarks) > 0:
                            s_hist.append(feat)
                            if len(s_hist) > 30: s_hist.pop(0)
                    s_f_idx += 1
                cap_s.release()

                s_pred = "N/A"
                if len(s_hist) >= 6:
                    inp = np.zeros((1, 30, 225), dtype=np.float32)
                    cnt = len(s_hist)
                    for i in range(30): inp[0, i] = s_hist[min((i*cnt)//30, cnt-1)]
                    interpreter.set_tensor(input_details[0]['index'], inp)
                    interpreter.invoke()
                    s_out = interpreter.get_tensor(output_details[0]['index'])[0]
                    s_pred = f"{TARGET_GLOSSES[np.argmax(s_out)]} ({np.max(s_out)*100:.0f}%)"

                status_str = "MATCH" if b_pred.split()[0] == s_pred.split()[0] else "DIFF"
                print(f"{folder:12s} | {v_name:22s} | {b_pred:18s} | {s_pred:18s} | {status_str:8s}")

    pose_landmarker.close()
    hand_landmarker.close()

if __name__ == "__main__":
    main()
