import os
import tensorflow as tf

def check_op_versions():
    model_path = "ai_engine/fsl_keypoint_model.keras"
    if not os.path.exists(model_path):
        print("Model file not found")
        return

    model = tf.keras.models.load_model(model_path)

    # 1. Unquantized conversion (float32)
    converter_float = tf.lite.TFLiteConverter.from_keras_model(model)
    tflite_float = converter_float.convert()

    # Save to android assets
    android_assets_path = os.path.abspath("android/app/src/main/assets/motion_speak_model.tflite")
    local_path = os.path.abspath("ai_engine/motion_speak_model.tflite")

    with open(android_assets_path, "wb") as f:
        f.write(tflite_float)
    with open(local_path, "wb") as f:
        f.write(tflite_float)

    print(f"Saved unquantized float32 TFLite model to {android_assets_path} ({len(tflite_float)} bytes)")

    # Inspect opcodes
    interp = tf.lite.Interpreter(model_content=tflite_float)
    interp.allocate_tensors()
    print("Interpreter created successfully for unquantized model!")

if __name__ == "__main__":
    check_op_versions()
