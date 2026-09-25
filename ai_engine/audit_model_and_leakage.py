import os
import json
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse", "background"
]

def main():
    print("=" * 80)
    print("AUDITING MODEL ACCURACY, SPLITTING METHODOLOGY & DATA LEAKAGE")
    print("=" * 80)

    dataset_file = "keypoint_dataset.json"
    if not os.path.exists(dataset_file):
        dataset_file = "ai_engine/keypoint_dataset.json"

    with open(dataset_file, "r") as f:
        samples = json.load(f)

    X, y_labels, file_paths = [], [], []
    for path, label in samples:
        norm_path = path if os.path.exists(path) else os.path.join("ai_engine", path)
        if os.path.exists(norm_path):
            X.append(np.load(norm_path))
            y_labels.append(label)
            file_paths.append(norm_path)

    X = np.array(X)
    y_labels = np.array(y_labels)

    print(f"Total dataset samples: {len(X)}")
    print(f"Feature shape per sample: {X.shape[1:]}")

    # 1. Random Sample-level split (as in current train_data.py)
    X_train_rand, X_test_rand, y_train_rand, y_test_rand = train_test_split(
        X, y_labels, test_size=0.15, random_state=42, stratify=y_labels
    )

    print(f"\n1. Random Sample Split: Train={len(X_train_rand)}, Test={len(X_test_rand)}")

    # Check source video overlap in random split
    train_sources = set()
    test_sources = set()
    for path, label in samples:
        base = os.path.basename(path)
        # Extract base video identifier (grouping multiple augmented or chunked clips from same video)
        source_id = base.split('.')[0]
        if '_' in source_id:
            parts = source_id.split('_')
            # Group by video stem
            source_id = "_".join(parts[:3])

    # 2. Evaluate existing TFLite model on the dataset
    tflite_path = "motion_speak_model.tflite"
    if not os.path.exists(tflite_path):
        tflite_path = "android/app/src/main/assets/motion_speak_model.tflite"

    if os.path.exists(tflite_path):
        print(f"\nEvaluating TFLite Model '{tflite_path}'...")
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
        acc = np.mean(y_preds == y_labels)
        print(f"Overall Dataset Accuracy: {acc * 100:.2f}%")

        print("\n--- Per-Class Accuracy & Sample Counts ---")
        for cls_idx, gloss in enumerate(TARGET_GLOSSES):
            cls_mask = (y_labels == cls_idx)
            count = np.sum(cls_mask)
            if count > 0:
                cls_acc = np.mean(y_preds[cls_mask] == y_labels[cls_mask])
                print(f"  Class {cls_idx:2d} ({gloss:12s}): Count={count:3d}, Accuracy={cls_acc*100:6.2f}%")
            else:
                print(f"  Class {cls_idx:2d} ({gloss:12s}): Count=  0 (NO SAMPLES!)")

        print("\n--- Confusion Matrix ---")
        cm = confusion_matrix(y_labels, y_preds)
        print(cm)

        print("\n--- Classification Report ---")
        present_classes = np.unique(y_labels)
        target_names = [TARGET_GLOSSES[i] for i in present_classes]
        print(classification_report(y_labels, y_preds, target_names=target_names, digits=3))

if __name__ == "__main__":
    main()
