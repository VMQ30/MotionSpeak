"""Train a robust sign language recognition model using preprocessed keypoint sequences.

This script loads square-letterboxed keypoint sequences from keypoint_dataset.json,
computes balanced class weights to eliminate majority class bias, applies rich spatial/temporal
data augmentation, trains an improved 1D Convolutional Neural Network, and saves the trained
model in native Keras format (fsl_keypoint_model.keras).
"""

import json
import os
import shutil
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.layers import (
    Add,
    BatchNormalization,
    Conv1D,
    Dense,
    Dropout,
    Flatten,
    Input,
    GlobalAveragePooling1D,
)
from tensorflow.keras.models import Model, Sequential
from tensorflow.keras.regularizers import l2
from tensorflow.keras.utils import to_categorical

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse"
]
NUM_CLASSES = len(TARGET_GLOSSES)

def augment_samples(X_data, y_data):
    """Apply rich spatial and temporal augmentation to training keypoint samples."""
    augmented_X = []
    augmented_y = []

    for sample, label in zip(X_data, y_data):
        # 1. Original Sample
        augmented_X.append(sample)
        augmented_y.append(label)

        # 2. Gaussian Noise Jitter
        noise = np.random.normal(0, 0.012, sample.shape).astype(np.float32)
        augmented_X.append(sample + noise)
        augmented_y.append(label)

        # 3. Spatial Scale Variation (90% to 110%)
        scale = np.random.uniform(0.90, 1.10)
        augmented_X.append(sample * scale)
        augmented_y.append(label)

        # 4. Temporal Roll/Shift (+- 2 frames)
        shift = np.random.randint(-2, 3)
        shifted_sample = np.roll(sample, shift=shift, axis=0)
        augmented_X.append(shifted_sample)
        augmented_y.append(label)

    return np.array(augmented_X, dtype=np.float32), np.array(augmented_y, dtype=np.float32)


def build_model(input_shape, num_classes):
    """Build a robust 1D Convolutional Neural Network with Residual connections."""
    inputs = Input(shape=input_shape)

    # Block 1
    x = Conv1D(64, kernel_size=3, padding="same", activation="relu", kernel_regularizer=l2(0.005))(inputs)
    x = BatchNormalization()(x)
    x = Dropout(0.3)(x)

    # Block 2 with Residual Connection
    res = Conv1D(128, kernel_size=1, padding="same")(x)
    x = Conv1D(128, kernel_size=3, padding="same", activation="relu", kernel_regularizer=l2(0.005))(x)
    x = BatchNormalization()(x)
    x = Dropout(0.3)(x)
    x = Conv1D(128, kernel_size=3, padding="same", activation="relu", kernel_regularizer=l2(0.005))(x)
    x = BatchNormalization()(x)
    x = Add()([x, res])
    x = Dropout(0.3)(x)

    # Dense Classification Head
    x = Flatten()(x)
    x = Dense(128, activation="relu", kernel_regularizer=l2(0.005))(x)
    x = BatchNormalization()(x)
    x = Dropout(0.4)(x)
    outputs = Dense(num_classes, activation="softmax")(x)

    model = Model(inputs=inputs, outputs=outputs)
    return model


def main():
    dataset_file = "keypoint_dataset.json"
    if not os.path.exists(dataset_file):
        raise FileNotFoundError(f"'{dataset_file}' not found! Run prep_data.py first.")

    # Preserve old model for comparison
    if os.path.exists("fsl_keypoint_model.keras"):
        shutil.copy("fsl_keypoint_model.keras", "fsl_keypoint_model_old.keras")
        print("Backed up existing model to 'fsl_keypoint_model_old.keras'.")

    with open(dataset_file, "r") as f:
        samples = json.load(f)

    X, y_labels = [], []
    for path, label in samples:
        if os.path.exists(path):
            X.append(np.load(path))
            y_labels.append(label)

    X = np.array(X, dtype=np.float32)
    y_labels = np.array(y_labels, dtype=np.int32)
    print(f"Loaded {len(X)} samples. Shape: {X.shape}")

    # Compute Balanced Class Weights to eliminate class bias
    unique_classes = np.unique(y_labels)
    class_weights_arr = compute_class_weight(class_weight="balanced", classes=unique_classes, y=y_labels)
    class_weight_dict = {cls_idx: weight for cls_idx, weight in zip(unique_classes, class_weights_arr)}
    
    print("\n--- Balanced Class Weights ---")
    for cls_idx, w in class_weight_dict.items():
        print(f"  Class {cls_idx:2d} ({TARGET_GLOSSES[cls_idx]:12s}): weight = {w:.3f}")

    y_cat = to_categorical(y_labels, num_classes=NUM_CLASSES)

    # Stratified Train / Test Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_cat, test_size=0.15, random_state=42, stratify=y_labels
    )

    print(f"\nTrain set: {X_train.shape}, Test set: {X_test.shape}")

    # Augment Training Set
    X_train_aug, y_train_aug = augment_samples(X_train, y_train)
    print(f"Augmented Training Set: {X_train_aug.shape}")

    # Build Model
    model = build_model(input_shape=(X.shape[1], X.shape[2]), num_classes=NUM_CLASSES)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss="categorical_crossentropy",
        metrics=["categorical_accuracy"],
    )
    model.summary()

    callbacks = [
        EarlyStopping(monitor="val_loss", patience=20, restore_best_weights=True),
        ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=6, min_lr=0.00001)
    ]

    print("\nTraining Model with Balanced Class Weights...")
    history = model.fit(
        X_train_aug,
        y_train_aug,
        validation_data=(X_test, y_test),
        epochs=120,
        batch_size=32,
        class_weight=class_weight_dict,
        callbacks=callbacks,
    )

    eval_loss, eval_acc = model.evaluate(X_test, y_test, verbose=0)
    print(f"\nHeld-out Test Evaluation - Loss: {eval_loss:.4f}, Accuracy: {eval_acc * 100:.2f}%")

    output_model = "fsl_keypoint_model.keras"
    model.save(output_model)
    print(f"Saved improved model to '{output_model}'!")

if __name__ == "__main__":
    main()
