import os
import tensorflow as tf

def inspect_model_metadata():
    model_path = "motion_speak_model.tflite"
    if not os.path.exists(model_path):
        model_path = "android/app/src/main/assets/motion_speak_model.tflite"

    print("=" * 70)
    print(f"INSPECTING TFLITE MODEL METADATA: {os.path.abspath(model_path)}")
    print("=" * 70)

    interpreter = tf.lite.Interpreter(model_path=model_path)
    interpreter.allocate_tensors()

    in_details = interpreter.get_input_details()
    out_details = interpreter.get_output_details()

    print("\n--- INPUT TENSORS ---")
    for idx, inp in enumerate(in_details):
        print(f"Input {idx}: Name='{inp['name']}', Shape={inp['shape']}, Type={inp['dtype']}, Index={inp['index']}")

    print("\n--- OUTPUT TENSORS ---")
    for idx, out in enumerate(out_details):
        print(f"Output {idx}: Name='{out['name']}', Shape={out['shape']}, Type={out['dtype']}, Index={out['index']}")

    print("=" * 70)

if __name__ == "__main__":
    inspect_model_metadata()
