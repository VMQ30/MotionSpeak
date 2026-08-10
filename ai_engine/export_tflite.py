"""Convert a trained Keras sign-language model into TensorFlow Lite format.

This script loads the saved Keras model (fsl_keypoint_model.keras), applies default TFLite
optimizations (quantization), exports the resulting .tflite model into the Android app
assets directory and local directory, and verifies tensor input/output signatures.
"""

import os
import tensorflow as tf

MODEL_PATH = "fsl_keypoint_model.keras"
OUTPUT_FILENAME = "motion_speak_model.tflite"

def main():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model file '{MODEL_PATH}' not found. Train the model first using train_data.py.")

    print(f"Loading Keras model from {MODEL_PATH}...")
    model = tf.keras.models.load_model(MODEL_PATH)
    model.summary()

    # 1. Initialize the TFLite Converter
    converter = tf.lite.TFLiteConverter.from_keras_model(model)

    # 2. Apply post-training optimization (quantization for mobile performance)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]

    # 3. Convert model
    print("Converting model to TFLite format...")
    tflite_model = converter.convert()

    # 4. Save to Android assets folder if directory exists
    android_assets_dir = os.path.join("..", "android", "app", "src", "main", "assets")
    os.makedirs(android_assets_dir, exist_ok=True)
    android_output_path = os.path.join(android_assets_dir, OUTPUT_FILENAME)

    with open(android_output_path, "wb") as f:
        f.write(tflite_model)
    print(f"TFLite model saved to Android assets: {android_output_path}")

    # Also save a local copy in ai_engine directory
    local_output_path = OUTPUT_FILENAME
    with open(local_output_path, "wb") as f:
        f.write(tflite_model)
    print(f"Local copy saved to: {local_output_path}")

    # 5. Verify TFLite model by initializing interpreter
    try:
        interpreter = tf.lite.Interpreter(model_content=tflite_model)
        interpreter.allocate_tensors()
        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()

        print("\n--- TFLite Verification ---")
        print(f"Input tensor shape:  {input_details[0]['shape']} (dtype: {input_details[0]['dtype']})")
        print(f"Output tensor shape: {output_details[0]['shape']} (dtype: {output_details[0]['dtype']})")
        print("TFLite model export verified successfully!")
    except Exception as e:
        print(f"Warning: Failed to verify TFLite interpreter: {e}")

if __name__ == "__main__":
    main()
