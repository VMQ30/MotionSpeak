import tensorflow as tf

def main():
    with open("motion_speak_model.tflite", "rb") as f:
        content = f.read()

    interpreter = tf.lite.Interpreter(model_content=content)
    interpreter.allocate_tensors()
    print("Local Python TF Interpreter successfully loaded model!")
    print(f"Model size: {len(content)} bytes")

if __name__ == "__main__":
    main()
