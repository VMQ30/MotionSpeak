import os
import json
import glob
import cv2
import numpy as np
import tensorflow as tf
from sklearn.metrics import confusion_matrix

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse", "background"
]
NO_CLASS_IDX = 2

def main():
    print("=" * 80)
    print("STEP 1 & 3: PER-GESTURE DIAGNOSTIC INVESTIGATION FOR CLASS 'NO'")
    print("=" * 80)

    dataset_file = "keypoint_dataset.json"
    if not os.path.exists(dataset_file):
        dataset_file = "ai_engine/keypoint_dataset.json"

    with open(dataset_file, "r") as f:
        samples = json.load(f)

    # 1. Dataset sample audit for NO
    no_samples = []
    all_X = []
    all_y = []
    all_paths = []

    for path, label in samples:
        norm_path = path if os.path.exists(path) else os.path.join("ai_engine", path)
        if os.path.exists(norm_path):
            data = np.load(norm_path)
            all_X.append(data)
            all_y.append(label)
            all_paths.append(norm_path)
            if label == NO_CLASS_IDX:
                no_samples.append((norm_path, data))

    all_X = np.array(all_X)
    all_y = np.array(all_y)

    print(f"\n--- 1. NO Class Dataset Sample Statistics ---")
    print(f"Total NO keypoint samples: {len(no_samples)}")

    # Extract source video filenames
    no_source_files = set()
    no_signers = set()
    seq_lengths = []

    for path, data in no_samples:
        base = os.path.basename(path)
        no_source_files.add(base)
        seq_lengths.append(len(data))
        # Check signer/source prefix
        if "wlasl" in base:
            no_signers.add(f"WLASL_{base.split('_')[2]}")
        else:
            parts = base.split('_')
            signer_id = parts[2] if len(parts) > 2 else "CustomSigner"
            no_signers.add(f"NewVideos_{signer_id}")

    print(f"Number of unique keypoint files: {len(no_source_files)}")
    print(f"Number of unique video/signer sources: {len(no_signers)} ({list(no_signers)[:5]})")
    print(f"Sequence length per sample: Min={min(seq_lengths)}, Max={max(seq_lengths)}, Avg={np.mean(seq_lengths):.1f}")

    # Inspect original video directory for NO
    no_video_dir = "dataset/new_videos/No"
    if not os.path.exists(no_video_dir):
        no_video_dir = "dataset/new_videos/no"
    
    no_vids = []
    if os.path.exists(no_video_dir):
        no_vids = [os.path.join(no_video_dir, f) for f in os.listdir(no_video_dir) if f.endswith((".mp4", ".mov", ".avi"))]
    print(f"Source video files in dataset/new_videos/No: {len(no_vids)}")

    # 2. Hand Detection & Landmark Integrity for NO
    lh_detected_count = 0
    rh_detected_count = 0
    both_detected_count = 0
    no_hand_count = 0
    total_no_frames = len(no_samples) * 30

    for path, data in no_samples:
        # data shape: (30, 225)
        # LH: 99..162, RH: 162..225
        lh_nonzero = np.sum(np.abs(data[:, 99:162]) > 1e-5, axis=1) > 0
        rh_nonzero = np.sum(np.abs(data[:, 162:225]) > 1e-5, axis=1) > 0

        lh_detected_count += np.sum(lh_nonzero)
        rh_detected_count += np.sum(rh_nonzero)
        both_detected_count += np.sum(lh_nonzero & rh_nonzero)
        no_hand_count += np.sum(~lh_nonzero & ~rh_nonzero)

    print(f"\n--- 2. Landmark & Hand Detection Statistics for NO ---")
    print(f"Total evaluated frames for NO: {total_no_frames}")
    print(f"Left Hand detection rate:  {lh_detected_count}/{total_no_frames} ({lh_detected_count/total_no_frames*100:.1f}%)")
    print(f"Right Hand detection rate: {rh_detected_count}/{total_no_frames} ({rh_detected_count/total_no_frames*100:.1f}%)")
    print(f"Both Hands detection rate: {both_detected_count}/{total_no_frames} ({both_detected_count/total_no_frames*100:.1f}%)")
    print(f"Missing Hand frames:       {no_hand_count}/{total_no_frames} ({no_hand_count/total_no_frames*100:.1f}%)")

    # 3. Model Predictions & Confusion Matrix for NO
    tflite_path = "android/app/src/main/assets/motion_speak_model.tflite"
    if not os.path.exists(tflite_path):
        tflite_path = "motion_speak_model.tflite"

    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    all_preds = []
    all_top_probs = []

    for i in range(len(all_X)):
        inp = np.expand_dims(all_X[i], axis=0).astype(np.float32)
        interpreter.set_tensor(input_details[0]['index'], inp)
        interpreter.invoke()
        out = interpreter.get_tensor(output_details[0]['index'])[0]
        all_preds.append(out)
        all_top_probs.append(out)

    all_preds = np.array(all_preds)
    pred_indices = np.argmax(all_preds, axis=1)

    print(f"\n--- 3. Confusion Matrix Analysis specifically for True Class = NO ---")
    no_mask = (all_y == NO_CLASS_IDX)
    no_true_preds = pred_indices[no_mask]
    no_true_probs = all_preds[no_mask]

    print(f"Total True NO samples evaluated: {len(no_true_preds)}")
    unique_preds, pred_counts = np.unique(no_true_preds, return_counts=True)
    
    print("\nWhen True Class = NO:")
    print(f"{'Predicted Class':<18} | {'Count':<8} | {'Percentage':<10}")
    print("-" * 42)
    for p_idx, c in sorted(zip(unique_preds, pred_counts), key=lambda x: x[1], reverse=True):
        p_gloss = TARGET_GLOSSES[p_idx]
        pct = (c / len(no_true_preds)) * 100
        print(f"{p_gloss:<18} | {c:<8} | {pct:6.2f}%")

    print(f"\nReverse Analysis: When Predicted Class = NO:")
    no_pred_mask = (pred_indices == NO_CLASS_IDX)
    no_pred_actuals = all_y[no_pred_mask]
    print(f"Total samples predicted as NO: {len(no_pred_actuals)}")
    unique_acts, act_counts = np.unique(no_pred_actuals, return_counts=True)

    print(f"{'Actual Class':<18} | {'Count':<8} | {'Percentage':<10}")
    print("-" * 42)
    for a_idx, c in sorted(zip(unique_acts, act_counts), key=lambda x: x[1], reverse=True):
        a_gloss = TARGET_GLOSSES[a_idx]
        pct = (c / len(no_pred_actuals)) * 100
        print(f"{a_gloss:<18} | {c:<8} | {pct:6.2f}%")

    # 4. Detailed Confidence Distribution for True NO Samples
    print("\n--- 4. Confidence Analysis on True NO Samples ---")
    top1_correct = 0
    for idx, (path, data) in enumerate(no_samples):
        probs = no_true_probs[idx]
        top3_indices = np.argsort(probs)[::-1][:3]
        top1_idx = top3_indices[0]
        top1_gloss = TARGET_GLOSSES[top1_idx]
        top1_conf = probs[top1_idx]
        no_conf = probs[NO_CLASS_IDX]

        if top1_idx == NO_CLASS_IDX:
            top1_correct += 1

        if idx < 10 or top1_idx != NO_CLASS_IDX:
            print(f"Sample {idx:2d} ({os.path.basename(path):20s}): Top1={top1_gloss:12s} ({top1_conf*100:5.1f}%) | NO Prob={no_conf*100:5.1f}% | Top2={TARGET_GLOSSES[top3_indices[1]]} ({probs[top3_indices[1]]*100:5.1f}%)")

if __name__ == "__main__":
    main()
