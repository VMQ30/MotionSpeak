import os
import json
import numpy as np
import tensorflow as tf

TARGET_GLOSSES_16 = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse",
    "background"
]

def verify_genuine_fsl():
    tflite_path = "android/app/src/main/assets/motion_speak_model.tflite"
    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    with open("ai_engine/keypoint_dataset.json", "r") as f:
        dataset = json.load(f)

    # Evaluate only on genuine FSL samples (classes 0..14)
    fsl_samples = [item for item in dataset if item[1] < 15]

    print(f"Evaluating TFLite model on {len(fsl_samples)} genuine FSL dataset samples...")

    correct = 0
    total = 0
    rejected = 0
    bg_misclassified = 0

    class_correct = {i: 0 for i in range(15)}
    class_total = {i: 0 for i in range(15)}

    for path, label in fsl_samples:
        if not os.path.exists(path):
            continue
        feat = np.load(path) # (30, 225)
        input_tensor = np.expand_dims(feat, axis=0).astype(np.float32)

        interpreter.set_tensor(input_details[0]['index'], input_tensor)
        interpreter.invoke()
        out = interpreter.get_tensor(output_details[0]['index'])[0]

        indexed = sorted(enumerate(out), key=lambda x: x[1], reverse=True)
        top1_idx, top1_prob = indexed[0]
        top2_idx, top2_prob = indexed[1]
        margin = top1_prob - top2_prob

        top1_gloss = TARGET_GLOSSES_16[top1_idx]
        is_recognized = (top1_prob >= 0.60) and (margin >= 0.25) and (top1_gloss != "background")

        total += 1
        class_total[label] += 1

        if top1_gloss == "background":
            bg_misclassified += 1
        elif top1_idx == label and is_recognized:
            correct += 1
            class_correct[label] += 1
        else:
            rejected += 1

    print("\n==================================================")
    print("GENUINE FSL TEST RESULTS (16-Class TFLite Model)")
    print("==================================================")
    print(f"Total Genuine FSL Samples: {total}")
    print(f"Correctly Recognized: {correct} ({correct/total*100:.2f}%)")
    print(f"Misclassified as Background: {bg_misclassified} ({bg_misclassified/total*100:.2f}%)")
    print(f"Rejected by Threshold/Margin: {rejected} ({rejected/total*100:.2f}%)")
    print("\nPer-Class Recognition Accuracy:")
    for idx in range(15):
        c_acc = (class_correct[idx] / class_total[idx] * 100) if class_total[idx] > 0 else 0
        print(f"  Class {idx:2d} ({TARGET_GLOSSES_16[idx]:12s}): {class_correct[idx]}/{class_total[idx]} ({c_acc:.1f}%)")

if __name__ == "__main__":
    verify_genuine_fsl()
