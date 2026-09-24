import os
import json
import numpy as np
import tensorflow as tf
from sklearn.metrics import confusion_matrix, classification_report

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse"
]

def audit_class_mappings():
    print("=" * 80)
    print("1. AUDIT CLASS MAPPINGS")
    print("=" * 80)

    python_glosses = TARGET_GLOSSES

    # Check MotionSpeakAIModule.kt
    kt_path = "../android/app/src/main/java/com/motionspeakapp/MotionSpeakAIModule.kt"
    kt_glosses = []
    if os.path.exists(kt_path):
        with open(kt_path, "r", encoding="utf-8") as f:
            content = f.read()
            # extract glosses list from kt
            if "private val glosses = listOf(" in content:
                sub = content.split("private val glosses = listOf(")[1].split(")")[0]
                kt_glosses = [line.strip().strip('"').strip(',') for line in sub.split("\n") if line.strip().startswith('"')]

    print(f"{'Index':<6} | {'Python prep_data/train_data':<28} | {'Android MotionSpeakAIModule':<28} | Match?")
    print("-" * 75)
    all_match = True
    for idx in range(max(len(python_glosses), len(kt_glosses))):
        py_g = python_glosses[idx] if idx < len(python_glosses) else "N/A"
        kt_g = kt_glosses[idx] if idx < len(kt_glosses) else "N/A"
        match = (py_g == kt_g)
        if not match: all_match = False
        print(f"{idx:<6d} | {py_g:<28s} | {kt_g:<28s} | {str(match)}")

    print(f"\nClass Mapping Agreement: {'PERFECT MATCH' if all_match else 'MISMATCH DETECTED!'}")
    return all_match

def audit_dataset():
    print("\n" + "=" * 80)
    print("2. AUDIT DATASET & PREPROCESSED SAMPLES")
    print("=" * 80)

    dataset_json = "keypoint_dataset.json"
    if not os.path.exists(dataset_json):
        print("keypoint_dataset.json not found!")
        return None, None

    with open(dataset_json, "r") as f:
        samples = json.load(f)

    print(f"Total samples indexed in keypoint_dataset.json: {len(samples)}")

    class_counts = {i: 0 for i in range(len(TARGET_GLOSSES))}
    lh_slot_active_count = 0
    rh_slot_active_count = 0
    both_active_count = 0

    X_list = []
    y_list = []

    for path, label in samples:
        class_counts[label] += 1
        if os.path.exists(path):
            arr = np.load(path) # (30, 225)
            X_list.append(arr)
            y_list.append(label)

            # Check non-zero feature activity in LH slot (99..161) vs RH slot (162..224)
            lh_act = np.sum(np.abs(arr[:, 99:162])) > 1e-4
            rh_act = np.sum(np.abs(arr[:, 162:225])) > 1e-4

            if lh_act and not rh_act:
                lh_slot_active_count += 1
            elif rh_act and not lh_act:
                rh_slot_active_count += 1
            elif lh_act and rh_act:
                both_active_count += 1

    print("\nClass Distribution:")
    for idx, count in class_counts.items():
        print(f"  Class {idx:2d} ({TARGET_GLOSSES[idx]:14s}): {count:4d} samples")

    print(f"\nPreprocessed Hand Slot Distribution in dataset:")
    print(f"  Only LH slot (99..161) active : {lh_slot_active_count} samples ({lh_slot_active_count/len(samples)*100:.1f}%)")
    print(f"  Only RH slot (162..224) active: {rh_slot_active_count} samples ({rh_slot_active_count/len(samples)*100:.1f}%)")
    print(f"  Both hand slots active       : {both_active_count} samples ({both_active_count/len(samples)*100:.1f}%)")

    return np.array(X_list, dtype=np.float32), np.array(y_list, dtype=np.int32)

def audit_model_performance(X, y):
    print("\n" + "=" * 80)
    print("3. MODEL CONFUSION MATRIX & EVALUATION ON PREPROCESSED DATASET")
    print("=" * 80)

    tflite_path = "motion_speak_model.tflite"
    if not os.path.exists(tflite_path):
        print("TFLite model not found!")
        return

    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    y_pred = []
    y_probs = []

    for i in range(len(X)):
        inp = np.expand_dims(X[i], axis=0) # (1, 30, 225)
        interpreter.set_tensor(input_details[0]['index'], inp)
        interpreter.invoke()
        out = interpreter.get_tensor(output_details[0]['index'])[0]
        pred_cls = np.argmax(out)
        y_pred.append(pred_cls)
        y_probs.append(out)

    y_pred = np.array(y_pred)
    acc = np.mean(y_pred == y)
    print(f"Overall Accuracy on Preprocessed Dataset (Original prep_data layout): {acc * 100:.2f}%")

    # Confusion matrix
    cm = confusion_matrix(y, y_pred, labels=list(range(len(TARGET_GLOSSES))))
    print("\nConfusion Matrix (Rows: True, Cols: Predicted):")
    header = f"{'True \\ Pred':12s} | " + " ".join([f"{g[:3]:>4s}" for g in TARGET_GLOSSES])
    print(header)
    print("-" * len(header))
    for i, row in enumerate(cm):
        print(f"{TARGET_GLOSSES[i]:12s} | " + " ".join([f"{val:4d}" for val in row]))

    # Test what happens if hand slots (lh vs rh) are SWAPPED!
    print("\n" + "=" * 80)
    print("4. EXPERIMENTAL HAND-SLOT SWAP TEST (SIMULATING ANDROID RUNTIME LAYOUT)")
    print("=" * 80)

    X_swapped = X.copy()
    # Swap LH slot (99..161) with RH slot (162..224)
    lh_temp = X_swapped[:, :, 99:162].copy()
    X_swapped[:, :, 99:162] = X_swapped[:, :, 162:225]
    X_swapped[:, :, 162:225] = lh_temp

    y_pred_swapped = []
    for i in range(len(X_swapped)):
        inp = np.expand_dims(X_swapped[i], axis=0)
        interpreter.set_tensor(input_details[0]['index'], inp)
        interpreter.invoke()
        out = interpreter.get_tensor(output_details[0]['index'])[0]
        pred_cls = np.argmax(out)
        y_pred_swapped.append(pred_cls)

    y_pred_swapped = np.array(y_pred_swapped)
    acc_swapped = np.mean(y_pred_swapped == y)
    print(f"Accuracy when Hand Slots are Swapped (Simulating Android Runtime Inversion): {acc_swapped * 100:.2f}%")

def main():
    audit_class_mappings()
    X, y = audit_dataset()
    if X is not None and len(X) > 0:
        audit_model_performance(X, y)

if __name__ == "__main__":
    main()
