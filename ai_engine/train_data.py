"""Train a sign language recognition model using preprocessed keypoint sequences.

This script loads keypoint sequences from keypoint_dataset.json (including WLASL
and custom new_videos datasets), applies data augmentation, trains a 1D Convolutional
neural network, and saves the trained model in native Keras format (fsl_keypoint_model.keras).
"""

import json
import os
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.layers import (
    BatchNormalization,
    Conv1D,
    Dense,
    Dropout,
    Flatten,
    Input,
)
from tensorflow.keras.models import Sequential
from tensorflow.keras.regularizers import l2
from tensorflow.keras.utils import to_categorical

TARGET_GLOSSES = [
    "hello",
    "yes",
    "no",
    "good",
    "bad",
    "what",
    "thank you",
    "welcome",
    "please",
    "sorry",
    "goodbye",
    "morning",
    "afternoon",
    "evening",
    "excuse",
]
NUM_CLASSES = len(TARGET_GLOSSES)


def augment_data(X_data, y_data):
    """Augment feature arrays by adding Gaussian noise to each sample.

    Args:
        X_data: A 3D array of shape (samples, timesteps, features).
        y_data: A categorical label array aligned with the samples.

    Returns:
        A tuple containing the original + augmented features and repeated labels.
    """
    noise = np.random.normal(0, 0.015, X_data.shape)
    X_augmented = X_data + noise
    return np.concatenate([X_data, X_augmented]), np.concatenate([y_data, y_data])


def main():
    # 1. Load Preprocessed Dataset
    dataset_file = "keypoint_dataset.json"
    if not os.path.exists(dataset_file):
        raise FileNotFoundError(
            f"'{dataset_file}' not found! Run prep_data.py first."
        )

    with open(dataset_file, "r") as f:
        samples = json.load(f)

    if len(samples) == 0:
        raise ValueError("No samples found in keypoint_dataset.json.")

    print(f"Loading {len(samples)} keypoint samples from {dataset_file}...")
    X, y_labels = [], []
    missing_count = 0
    for path, label in samples:
        if os.path.exists(path):
            X.append(np.load(path))
            y_labels.append(label)
        else:
            missing_count += 1

    if missing_count > 0:
        print(f"Warning: {missing_count} sample files referenced in JSON were missing.")

    X = np.array(X)  # Shape: (Num_Samples, 30, 225)
    y_labels = np.array(y_labels)

    print(f"Dataset feature shape: {X.shape}")

    # Display Class Distribution Breakdown
    unique_classes, counts = np.unique(y_labels, return_counts=True)
    print("\n--- Class Distribution ---")
    for cls_idx, count in zip(unique_classes, counts):
        gloss_name = TARGET_GLOSSES[cls_idx] if cls_idx < len(TARGET_GLOSSES) else f"Class_{cls_idx}"
        print(f"  Class {cls_idx:2d} ({gloss_name:12s}): {count} samples")

    y = to_categorical(y_labels, num_classes=NUM_CLASSES)

    # Stratified Train/Test Split
    can_stratify = len(unique_classes) == NUM_CLASSES and min(counts) >= 2
    stratify_param = y_labels if can_stratify else None

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.15, random_state=42, stratify=stratify_param
    )

    print(f"\nTrain set shape: {X_train.shape}, Test set shape: {X_test.shape}")

    # 2. Apply Augmentation to Training Split
    X_train_aug, y_train_aug = augment_data(X_train, y_train)
    print(f"Augmented training set shape: {X_train_aug.shape}")

    # 3. Build Model Architecture
    model = Sequential(
        [
            Input(shape=(X.shape[1], X.shape[2])),
            Conv1D(
                filters=32,
                kernel_size=3,
                padding="same",
                activation="relu",
                kernel_regularizer=l2(0.01),
            ),
            BatchNormalization(),
            Dropout(0.4),
            Conv1D(
                filters=64,
                kernel_size=3,
                padding="same",
                activation="relu",
                kernel_regularizer=l2(0.01),
            ),
            BatchNormalization(),
            Dropout(0.4),
            Flatten(),
            Dense(64, activation="relu", kernel_regularizer=l2(0.01)),
            Dropout(0.5),
            Dense(NUM_CLASSES, activation="softmax"),
        ]
    )

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss="categorical_crossentropy",
        metrics=["categorical_accuracy"],
    )

    model.summary()

    # 4. Training Callbacks
    early_stop = EarlyStopping(
        monitor="val_loss", patience=15, restore_best_weights=True
    )
    reduce_lr = ReduceLROnPlateau(
        monitor="val_loss", factor=0.5, patience=5, min_lr=0.00001
    )

    # 5. Train Model
    history = model.fit(
        X_train_aug,
        y_train_aug,
        validation_data=(X_test, y_test),
        epochs=100,
        batch_size=16,
        callbacks=[early_stop, reduce_lr],
    )

    # Evaluate on Test Set
    eval_loss, eval_acc = model.evaluate(X_test, y_test, verbose=0)
    print(f"\nEvaluation on Test Set - Loss: {eval_loss:.4f}, Accuracy: {eval_acc * 100:.2f}%")

    # 6. Save Model
    output_model = "fsl_keypoint_model.keras"
    model.save(output_model)
    print(f"Model successfully saved to '{output_model}'!")


if __name__ == "__main__":
    main()
