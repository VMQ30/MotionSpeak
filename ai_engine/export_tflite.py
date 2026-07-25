"""Export the trained sign-language model to TensorFlow Lite format."""

import tensorflow as tf
import os

# 1. Load your trained Keras model
model_path = "fsl_keypoint_model.keras"
print(f"Loading model from {model_path}...")
model = tf.keras.models.load_model(model_path)

# 2. Initialize the TFLite Converter
converter = tf.lite.TFLiteConverter.from_keras_model(model)

# 3. Apply post-training optimization (quantization for mobile performance)
converter.optimizations = [tf.lite.Optimize.DEFAULT]

# 4. Convert model
print("Converting model to TFLite format...")
tflite_model = converter.convert()

# 5. Define output destination (Android assets folder if it exists, otherwise local)
android_assets_dir = os.path.join("..", "android", "app", "src", "main", "assets")
os.makedirs(android_assets_dir, exist_ok=True)

output_path = os.path.join(android_assets_dir, "motion_speak_model.tflite")

# 6. Save the file
with open(output_path, "wb") as f:
    f.write(tflite_model)

print(f"Success! TFLite model saved directly to: {output_path}")
