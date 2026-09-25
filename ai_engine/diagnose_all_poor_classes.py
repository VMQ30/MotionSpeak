import os
import json
import numpy as np
import tensorflow as tf
from sklearn.metrics import classification_report, confusion_matrix

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse", "background"
]

def main():
    print("=" * 80)
    print("STEP 14: PER-GESTURE DIAGNOSTIC ANALYSIS FOR ALL POORLY RECOGNIZED CLASSES")
    print("=" * 80)

    dataset_file = "keypoint_dataset.json"
    if not os.path.exists(dataset_file):
        dataset_file = "ai_engine/keypoint_dataset.json"

    with open(dataset_file, "r") as f:
        samples = json.load(f)

    X, y = [], []
    for path, label in samples:
        norm_path = path if os.path.exists(path) else os.path.join("ai_engine", path)
        if os.path.exists(norm_path):
            X.append(np.load(norm_path))
            y.append(label)

    X = np.array(X)
    y = np.array(y)

    tflite_path = "android/app/src/main/assets/motion_speak_model.tflite"
    if not os.path.exists(tflite_path):
        tflite_path = "motion_speak_model.tflite"

    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    y_preds = []
    for i in range(len(X)):
        inp = np.expand_dims(X[i], axis=0).astype(np.float32)
        interpreter.set_tensor(input_details[0]['index'], inp)
        interpreter.invoke()
        out = interpreter.get_tensor(output_details[0]['index'])[0]
        y_preds.append(np.argmax(out))

    y_preds = np.array(y_preds)
    cm = confusion_matrix(y, y_preds, labels=range(len(TARGET_GLOSSES)))

    class_stats = []
    for idx, gloss in enumerate(TARGET_GLOSSES):
        total_true = np.sum(y == idx)
        total_pred = np.sum(y_preds == idx)
        correct = cm[idx, idx]

        recall = (correct / total_true * 100) if total_true > 0 else 0.0
        precision = (correct / total_pred * 100) if total_pred > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

        # Find most common incorrect prediction
        row = cm[idx].copy()
        row[idx] = 0 # exclude self
        top_confused_idx = np.argmax(row)
        top_confused_count = row[top_confused_idx]
        top_confused_gloss = TARGET_GLOSSES[top_confused_idx] if top_confused_count > 0 else "None"

        class_stats.append({
            "idx": idx,
            "gloss": gloss,
            "total_true": total_true,
            "total_pred": total_pred,
            "correct": correct,
            "recall": recall,
            "precision": precision,
            "f1": f1,
            "top_confused": top_confused_gloss,
            "top_confused_count": top_confused_count
        })

    # Sort by F1 ascending to highlight worst performing classes first
    class_stats.sort(key=lambda item: item["f1"])

    print(f"\n--- All 16 Classes Ranked by F1 Score (Worst to Best) ---")
    print(f"{'Class Name':<14} | {'Recall':<8} | {'Precision':<10} | {'F1':<8} | {'Samples':<8} | {'Most Common Misclassification'}")
    print("-" * 80)
    for stat in class_stats:
        print(f"{stat['gloss']:<14} | {stat['recall']:6.1f}% | {stat['precision']:8.1f}% | {stat['f1']:6.1f}% | {stat['total_true']:<8d} | {stat['top_confused']} ({stat['top_confused_count']} samples)")

if __name__ == "__main__":
    main()
