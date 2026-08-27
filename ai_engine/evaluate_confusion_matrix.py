import os
import json
import cv2
import numpy as np
import tensorflow as tf
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from sklearn.metrics import confusion_matrix, classification_report

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse"
]

DATASET_DIRS = [
    os.path.abspath("dataset/new_videos"),
    os.path.abspath("dataset/videos")
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

    print("=" * 90)
    print("EVALUATING MODEL CONFUSION MATRIX & PREDICTION DISTRIBUTION ON FULL DATASET")
    print("=" * 90)

    y_true = []
    y_pred = []
    pred_counts = {gloss: 0 for gloss in TARGET_GLOSSES}
    per_file_results = []

    for d_dir in DATASET_DIRS:
        if not os.path.exists(d_dir): continue
        for root, dirs, files in os.walk(d_dir):
            for file in files:
                if not file.lower().endswith((".mp4", ".avi", ".mov", ".m4v")): continue
                rel_path = os.path.relpath(os.path.join(root, file), d_dir)
                folder_name = rel_path.split(os.sep)[0].lower().replace(" ", "").replace("_", "")

                matched_idx = None
                for idx, gloss in enumerate(TARGET_GLOSSES):
                    norm_gloss = gloss.lower().replace(" ", "").replace("_", "")
                    if norm_gloss == folder_name or folder_name.startswith(norm_gloss):
                        matched_idx = idx
                        break

                if matched_idx is None: continue

                full_path = os.path.join(root, file)
                cap = cv2.VideoCapture(full_path)
                
                history = []
                while cap.isOpened():
                    ret, frame = cap.read()
                    if not ret: break
                    fh, fw = frame.shape[:2]
                    max_dim = max(fh, fw)
                    sq = cv2.copyMakeBorder(frame, (max_dim-fh)//2, (max_dim-fh)//2, (max_dim-fw)//2, (max_dim-fw)//2, cv2.BORDER_CONSTANT, value=[0,0,0])
                    rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
                    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

                    p_res = pose_landmarker.detect(mp_img)
                    h_res = hand_landmarker.detect(mp_img)

                    feat = np.zeros(225, dtype=np.float32)
                    has_p = bool(p_res.pose_landmarks and len(p_res.pose_landmarks[0]) > 12)
                    has_h = bool(h_res.hand_landmarks and len(h_res.hand_landmarks) > 0)

                    anchor = [0.5, 0.5, 0.0]
                    scale = 1.0
                    p_valid = False

                    if has_p:
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
                            eff_cat = "Right" if raw_cat.lower() == "left" else "Left"
                            off = 99 if eff_cat.lower() == "left" else 162
                            for h in range(min(21, len(h_list))):
                                lm = h_list[h]
                                feat[off + h*3] = (lm.x - anchor[0])/scale
                                feat[off + h*3+1] = (lm.y - anchor[1])/scale
                                feat[off + h*3+2] = (lm.z - anchor[2])/scale

                    if has_h:
                        history.append(feat)

                cap.release()

                if len(history) >= 1:
                    cnt = len(history)
                    input_tensor = np.zeros((1, 30, 225), dtype=np.float32)
                    for i in range(30):
                        s_idx = (i * cnt) // 30
                        input_tensor[0, i] = history[min(s_idx, cnt - 1)]

                    interpreter.set_tensor(input_details[0]['index'], input_tensor)
                    interpreter.invoke()
                    out = interpreter.get_tensor(output_details[0]['index'])[0]

                    p_idx = int(np.argmax(out))
                    p_conf = float(out[p_idx] * 100)

                    y_true.append(matched_idx)
                    y_pred.append(p_idx)
                    pred_counts[TARGET_GLOSSES[p_idx]] += 1
                    per_file_results.append({
                        "file": file,
                        "true": TARGET_GLOSSES[matched_idx],
                        "pred": TARGET_GLOSSES[p_idx],
                        "conf": p_conf,
                        "correct": matched_idx == p_idx
                    })

    pose_landmarker.close()
    hand_landmarker.close()

    print("\n--- PREDICTION FREQUENCY DISTRIBUTION ACROSS FULL DATASET ---")
    total_preds = len(y_pred)
    for gloss, cnt in sorted(pred_counts.items(), key=lambda x: x[1], reverse=True):
        pct = (cnt / total_preds * 100.0) if total_preds > 0 else 0.0
        print(f"  {gloss:14s} : Predicted {cnt:4d} times ({pct:5.1f}%)")

    cm = confusion_matrix(y_true, y_pred, labels=list(range(15)))
    print("\n--- 15x15 CONFUSION MATRIX ---")
    print(f"{'True \\ Pred':12s} | " + " ".join([f"{g[:3]:>4s}" for g in TARGET_GLOSSES]))
    print("-" * 90)
    for i, row in enumerate(cm):
        print(f"{TARGET_GLOSSES[i]:12s} | " + " ".join([f"{val:4d}" for val in row]))

    report = classification_report(y_true, y_pred, target_names=TARGET_GLOSSES, digits=3)
    print("\n--- DETAILED CLASSIFICATION REPORT ---")
    print(report)

    with open("confusion_matrix_results.json", "w") as f:
        json.dump({"cm": cm.tolist(), "counts": pred_counts, "results": per_file_results}, f, indent=2)

if __name__ == "__main__":
    main()
