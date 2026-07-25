import json
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from tensorflow.keras.layers import LSTM, Conv1D, Dense, Dropout, MaxPooling1D
from tensorflow.keras.models import Sequential
from tensorflow.keras.utils import to_categorical

# 1. Load Preprocessed Keypoints Dataset
with open("keypoint_dataset.json", "r") as f:
    samples = json.load(f)

X, y = [], []
for path, label in samples:
    X.append(np.load(path))
    y.append(label)

X = np.array(X)  # Shape: (Num_Samples, 30, 225)

# Dynamically set number of classes based on unique labels present
num_classes = len(np.unique(y))
y = to_categorical(y, num_classes=num_classes)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.15, random_state=42
)

# 2. Hybrid Architecture with Padding Fix
model = Sequential(
    [
        Conv1D(
            filters=64,
            kernel_size=3,
            padding="same",
            activation="relu",
            input_shape=(X.shape[1], X.shape[2]),
        ),
        MaxPooling1D(pool_size=2),
        Dropout(0.2),
        Conv1D(filters=128, kernel_size=3, padding="same", activation="relu"),
        Dropout(0.2),
        LSTM(64, return_sequences=False, activation="tanh"),
        Dropout(0.3),
        Dense(64, activation="relu"),
        Dense(num_classes, activation="softmax"),
    ]
)

model.compile(
    optimizer="adam",
    loss="categorical_crossentropy",
    metrics=["categorical_accuracy"],
)
model.summary()

# 3. Training
early_stop = tf.keras.callbacks.EarlyStopping(
    monitor="val_loss", patience=10, restore_best_weights=True
)

model.fit(
    X_train,
    y_train,
    validation_data=(X_test, y_test),
    epochs=80,
    batch_size=16,
    callbacks=[early_stop],
)

model.save("fsl_cnn_lstm.h5")
print("Model trained and saved successfully!")
