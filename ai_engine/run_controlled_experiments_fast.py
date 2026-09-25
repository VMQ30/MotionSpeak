import os
import json
import numpy as np
import tensorflow as tf
from sklearn.model_selection import GroupKFold
from sklearn.metrics import classification_report, confusion_matrix
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import (
    Input, Conv1D, BatchNormalization, Dropout, Flatten, Dense,
    GlobalAveragePooling1D, GRU, Bidirectional
)
from tensorflow.keras.regularizers import l2
from tensorflow.keras.utils import to_categorical

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse", "background"
]
NUM_CLASSES = len(TARGET_GLOSSES)
NO_IDX = TARGET_GLOSSES.index("no")
AFTERNOON_IDX = TARGET_GLOSSES.index("afternoon")
GOODBYE_IDX = TARGET_GLOSSES.index("goodbye")
GOOD_IDX = TARGET_GLOSSES.index("good")
WHAT_IDX = TARGET_GLOSSES.index("what")
BG_IDX = TARGET_GLOSSES.index("background")

def build_model_a(input_shape):
    """Model A: Current Conv1D -> Flatten -> Dense"""
    return Sequential([
        Input(shape=input_shape),
        Conv1D(32, kernel_size=3, padding="same", activation="relu", kernel_regularizer=l2(0.01)),
        BatchNormalization(),
        Dropout(0.4),
        Conv1D(64, kernel_size=3, padding="same", activation="relu", kernel_regularizer=l2(0.01)),
        BatchNormalization(),
        Dropout(0.4),
        Flatten(),
        Dense(64, activation="relu", kernel_regularizer=l2(0.01)),
        Dropout(0.5),
        Dense(NUM_CLASSES, activation="softmax")
    ])

def build_model_b(input_shape):
    """Model B: Temporal Conv1D + GlobalAveragePooling1D"""
    return Sequential([
        Input(shape=input_shape),
        Conv1D(64, kernel_size=5, padding="same", activation="relu", kernel_regularizer=l2(0.005)),
        BatchNormalization(),
        Dropout(0.3),
        Conv1D(128, kernel_size=5, padding="same", activation="relu", kernel_regularizer=l2(0.005)),
        BatchNormalization(),
        Dropout(0.3),
        GlobalAveragePooling1D(),
        Dense(128, activation="relu", kernel_regularizer=l2(0.005)),
        Dropout(0.4),
        Dense(NUM_CLASSES, activation="softmax")
    ])

def build_model_c(input_shape):
    """Model C: Conv1D + Bi-GRU + GlobalAveragePooling1D"""
    return Sequential([
        Input(shape=input_shape),
        Conv1D(64, kernel_size=3, padding="same", activation="relu", kernel_regularizer=l2(0.005)),
        BatchNormalization(),
        Dropout(0.3),
        Bidirectional(GRU(64, return_sequences=True)),
        BatchNormalization(),
        Dropout(0.3),
        GlobalAveragePooling1D(),
        Dense(64, activation="relu", kernel_regularizer=l2(0.005)),
        Dropout(0.4),
        Dense(NUM_CLASSES, activation="softmax")
    ])

def augment_handedness(X_data, y_data):
    X_mirrored = X_data.copy()
    for i in range(len(X_data)):
        lh = X_data[i, :, 99:162].copy()
        rh = X_data[i, :, 162:225].copy()
        X_mirrored[i, :, 99:162] = rh
        X_mirrored[i, :, 162:225] = lh
    return np.concatenate([X_data, X_mirrored]), np.concatenate([y_data, y_data])

def evaluate_fast(X, y, groups, model_builder, use_handedness_aug=False, ablation_mode="full"):
    gkf = GroupKFold(n_splits=3)

    y_true_all = []
    y_pred_all = []

    for fold, (train_idx, test_idx) in enumerate(gkf.split(X, y, groups)):
        X_train_f, y_train_f = X[train_idx], y[train_idx]
        X_test_f, y_test_f = X[test_idx], y[test_idx]

        if use_handedness_aug:
            X_train_f, y_train_f = augment_handedness(X_train_f, y_train_f)

        X_eval = X_test_f.copy()
        if ablation_mode == "first_frame":
            X_eval = np.repeat(X_eval[:, :1, :], 30, axis=1)
        elif ablation_mode == "mid_frame":
            X_eval = np.repeat(X_eval[:, 15:16, :], 30, axis=1)
        elif ablation_mode == "last_frame":
            X_eval = np.repeat(X_eval[:, -1:, :], 30, axis=1)
        elif ablation_mode == "shuffled":
            for i in range(len(X_eval)):
                np.random.shuffle(X_eval[i])

        y_train_cat = to_categorical(y_train_f, num_classes=NUM_CLASSES)
        y_test_cat = to_categorical(y_test_f, num_classes=NUM_CLASSES)

        model = model_builder((30, 225))
        model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.002),
                      loss="categorical_crossentropy",
                      metrics=["categorical_accuracy"])

        model.fit(X_train_f, y_train_cat, validation_data=(X_test_f, y_test_cat),
                  epochs=30, batch_size=32, verbose=0)

        preds = np.argmax(model.predict(X_eval, verbose=0), axis=1)
        y_true_all.extend(y_test_f)
        y_pred_all.extend(preds)

    y_true_all = np.array(y_true_all)
    y_pred_all = np.array(y_pred_all)

    cm = confusion_matrix(y_true_all, y_pred_all, labels=range(NUM_CLASSES))
    report = classification_report(y_true_all, y_pred_all, target_names=TARGET_GLOSSES, output_dict=True, zero_division=0)

    active_f1s = [report[TARGET_GLOSSES[i]]["f1-score"] for i in range(15)]
    macro_active_f1 = float(np.mean(active_f1s))

    return {
        "report": report,
        "cm": cm,
        "macro_active_f1": macro_active_f1,
        "no_rec": report["no"]["recall"],
        "no_prec": report["no"]["precision"],
        "no_f1": report["no"]["f1-score"],
        "aft_rec": report["afternoon"]["recall"],
        "aft_prec": report["afternoon"]["precision"],
        "aft_f1": report["afternoon"]["f1-score"],
        "goodbye_rec": report["goodbye"]["recall"],
        "goodbye_prec": report["goodbye"]["precision"],
        "goodbye_f1": report["goodbye"]["f1-score"],
        "no_to_aft": int(cm[NO_IDX, AFTERNOON_IDX]),
        "aft_to_no": int(cm[AFTERNOON_IDX, NO_IDX]),
        "goodbye_to_good": int(cm[GOODBYE_IDX, GOOD_IDX]),
        "bg_to_what": int(cm[BG_IDX, WHAT_IDX]),
    }

def main():
    print("=" * 80)
    print("RUNNING STREAMLINED MODEL IMPROVEMENT & ABLATION EXPERIMENTS")
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
            X.append(np.load(norm_path))
            y.append(label)
            base = os.path.basename(path)
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

    # Experiment 1: Compare Model A (Current) vs Model B (Temporal Conv) vs Model C (Bi-GRU)
    print("\n--- EXPERIMENT 1: ARCHITECTURE COMPARISON (Group Cross-Val) ---")
    res_a = evaluate_fast(X, y, groups, build_model_a, use_handedness_aug=False)
    print(f"Model A (Current Conv1D+Flatten): Active Macro F1={res_a['macro_active_f1']*100:.2f}% | NO F1={res_a['no_f1']*100:.1f}% (Rec={res_a['no_rec']*100:.1f}%), AFT F1={res_a['aft_f1']*100:.1f}% (Rec={res_a['aft_rec']*100:.1f}%), GOODBYE F1={res_a['goodbye_f1']*100:.1f}% | AFT->NO={res_a['aft_to_no']}, GOODBYE->GOOD={res_a['goodbye_to_good']}")

    res_b = evaluate_fast(X, y, groups, build_model_b, use_handedness_aug=False)
    print(f"Model B (Temporal Conv+GAP):      Active Macro F1={res_b['macro_active_f1']*100:.2f}% | NO F1={res_b['no_f1']*100:.1f}% (Rec={res_b['no_rec']*100:.1f}%), AFT F1={res_b['aft_f1']*100:.1f}% (Rec={res_b['aft_rec']*100:.1f}%), GOODBYE F1={res_b['goodbye_f1']*100:.1f}% | AFT->NO={res_b['aft_to_no']}, GOODBYE->GOOD={res_b['goodbye_to_good']}")

    res_c = evaluate_fast(X, y, groups, build_model_c, use_handedness_aug=False)
    print(f"Model C (Conv1D + Bi-GRU + GAP):  Active Macro F1={res_c['macro_active_f1']*100:.2f}% | NO F1={res_c['no_f1']*100:.1f}% (Rec={res_c['no_rec']*100:.1f}%), AFT F1={res_c['aft_f1']*100:.1f}% (Rec={res_c['aft_rec']*100:.1f}%), GOODBYE F1={res_c['goodbye_f1']*100:.1f}% | AFT->NO={res_c['aft_to_no']}, GOODBYE->GOOD={res_c['goodbye_to_good']}")

    # Experiment 2: Handedness Mirror Augmentation Impact on Model B
    print("\n--- EXPERIMENT 2: HANDEDNESS AUGMENTATION IMPACT ON MODEL B ---")
    res_b_aug = evaluate_fast(X, y, groups, build_model_b, use_handedness_aug=True)
    print(f"Model B + Handedness Aug:         Active Macro F1={res_b_aug['macro_active_f1']*100:.2f}% | NO F1={res_b_aug['no_f1']*100:.1f}% (Rec={res_b_aug['no_rec']*100:.1f}%), AFT F1={res_b_aug['aft_f1']*100:.1f}% (Rec={res_b_aug['aft_rec']*100:.1f}%), GOODBYE F1={res_b_aug['goodbye_f1']*100:.1f}% | AFT->NO={res_b_aug['aft_to_no']}, GOODBYE->GOOD={res_b_aug['goodbye_to_good']}")

    # Experiment 3: Temporal Ablation Suite on Model B
    print("\n--- EXPERIMENT 3: TEMPORAL ABLATION SUITE ON MODEL B ---")
    for mode in ["full", "first_frame", "mid_frame", "last_frame", "shuffled"]:
        res_abl = evaluate_fast(X, y, groups, build_model_b, use_handedness_aug=False, ablation_mode=mode)
        print(f"Mode: {mode:<12s} -> Active Macro F1={res_abl['macro_active_f1']*100:5.2f}% | NO F1={res_abl['no_f1']*100:5.1f}%, AFT F1={res_abl['aft_f1']*100:5.1f}% | AFT->NO={res_abl['aft_to_no']:2d}, GOODBYE->GOOD={res_abl['goodbye_to_good']:2d}")

if __name__ == "__main__":
    main()
