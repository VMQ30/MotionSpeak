import json
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
from tensorflow.keras.regularizers import l2
from tensorflow.keras.models import Sequential
from tensorflow.keras.utils import to_categorical

# 1. Load Preprocessed Dataset
with open("keypoint_dataset.json", "r") as f:
    samples = json.load(f)

X, y = [], []
for path, label in samples:
    X.append(np.load(path))
    y.append(label)

X = np.array(X)  # Expected shape: (Num_Samples, 30, 225)
num_classes = len(np.unique(y)) if len(y) > 0 else 15
y = to_categorical(y, num_classes=num_classes)

# Split dataset (stratified split helps balance small classes)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.15, random_state=42
)


# 2. Keypoint Data Augmentation Function (Gaussian Noise Jitter)
def augment_data(X_data, y_data):
    noise = np.random.normal(0, 0.015, X_data.shape)
    X_augmented = X_data + noise
    return np.concatenate([X_data, X_augmented]), np.concatenate([y_data, y_data])


# Apply augmentation to training set only
X_train_aug, y_train_aug = augment_data(X_train, y_train)

# 3. Model Architecture
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
        Dropout(0.4),  # Increased from 0.3
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
        Dropout(0.5),  # Increased from 0.4
        Dense(num_classes, activation="softmax"),
    ]
)

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
    loss="categorical_crossentropy",
    metrics=["categorical_accuracy"],
)

model.summary()

# 4. Training Callbacks
early_stop = EarlyStopping(monitor="val_loss", patience=15, restore_best_weights=True)

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

# 6. Save Model in Native Keras Format
model.save("fsl_keypoint_model.keras")
print("Model trained and saved as 'fsl_keypoint_model.keras'!")
