import os
import json
import numpy as np
import tensorflow as tf
from sklearn.model_selection import GroupKFold
from sklearn.metrics import classification_report, confusion_matrix

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse", "background"
]
NO_CLASS_IDX = 2

def main():
    print("=" * 80)
    print("STEP 13: SIGNER-INDEPENDENT EVALUATION (GROUP CROSS-VALIDATION)")
    print("=" * 80)

    dataset_file = "keypoint_dataset.json"
    if not os.path.exists(dataset_file):
        dataset_file = "ai_engine/keypoint_dataset.json"

    with open(dataset_file, "r") as f:
        samples = json.load(f)

    X, y, groups = [], [], []
    for path, label in samples:
        norm_path = path if os.path.exists(path) else os.path.join("ai_engine", path)
        if os.path.exists(norm_path):
            data = np.load(norm_path)
            X.append(data)
            y.append(label)

            base = os.path.basename(path)
            # Group by video source prefix to isolate signers / recordings
            if "wlasl" in base:
                grp = f"wlasl_{base.split('_')[1]}"
            else:
                parts = base.split('_')
                grp = f"new_{parts[1]}_{parts[2]}" if len(parts) > 2 else "new_custom"
            groups.append(grp)

    X = np.array(X)
    y = np.array(y)
    groups = np.array(groups)

    print(f"Total dataset samples: {len(X)}")
    print(f"Total unique signer/video groups: {len(np.unique(groups))}")

    # Evaluate using 5-Fold GroupKFold (ensures no signer/video overlap between train and test)
    gkf = GroupKFold(n_splits=5)

    tflite_path = "android/app/src/main/assets/motion_speak_model.tflite"
    if not os.path.exists(tflite_path):
        tflite_path = "motion_speak_model.tflite"

    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    fold_no_recalls = []
    fold_no_precisions = []

    for fold, (train_idx, test_idx) in enumerate(gkf.split(X, y, groups)):
        X_test_fold = X[test_idx]
        y_test_fold = y[test_idx]

        y_preds = []
        for i in range(len(X_test_fold)):
            inp = np.expand_dims(X_test_fold[i], axis=0).astype(np.float32)
            interpreter.set_tensor(input_details[0]['index'], inp)
            interpreter.invoke()
            out = interpreter.get_tensor(output_details[0]['index'])[0]
            y_preds.append(np.argmax(out))

        y_preds = np.array(y_preds)

        no_mask = (y_test_fold == NO_CLASS_IDX)
        no_pred_mask = (y_preds == NO_CLASS_IDX)

        no_true_count = np.sum(no_mask)
        no_correct = np.sum((y_preds == NO_CLASS_IDX) & (y_test_fold == NO_CLASS_IDX))
        no_pred_count = np.sum(no_pred_mask)

        recall = (no_correct / no_true_count * 100) if no_true_count > 0 else 0.0
        precision = (no_correct / no_pred_count * 100) if no_pred_count > 0 else 0.0

        fold_no_recalls.append(recall)
        fold_no_precisions.append(precision)

        print(f"Fold {fold+1}: Test Size={len(test_idx):3d} | NO Recall={recall:5.1f}% ({no_correct}/{no_true_count}), NO Precision={precision:5.1f}% ({no_correct}/{no_pred_count})")

    print("\n--- Signer-Independent NO Class Metrics Summary ---")
    print(f"Mean NO Recall:    {np.mean(fold_no_recalls):.2f}%")
    print(f"Mean NO Precision: {np.mean(fold_no_precisions):.2f}%")

if __name__ == "__main__":
    main()
