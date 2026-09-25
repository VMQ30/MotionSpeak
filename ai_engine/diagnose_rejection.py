import os, sys, json, time, cv2
import numpy as np
import tensorflow as tf

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse"
]

def generate_nonsense_movements(num_samples=50):
    """Generate synthetic nonsensical hand movements (arbitrary wavelike, random finger movements, transition movements)."""
    nonsense_samples = []
    for _ in range(num_samples):
        sample = np.zeros((30, 225), dtype=np.float32)
        
        # Random pose shoulders
        cx, cy = np.random.uniform(0.4, 0.6), np.random.uniform(0.5, 0.7)
        s_dist = np.random.uniform(0.2, 0.4)
        
        # Populate pose (indices 0..98) with basic body stance
        for p in range(33):
            sample[:, p*3] = np.random.uniform(-0.5, 0.5)
            sample[:, p*3+1] = np.random.uniform(-0.5, 0.5)
            sample[:, p*3+2] = np.random.uniform(-0.1, 0.1)

        # Arbitrary single hand movement (indices 162..224) - random waving/twitching
        freq = np.random.uniform(0.5, 3.0)
        phase = np.random.uniform(0, 2 * np.pi)
        amp = np.random.uniform(0.1, 0.5)
        
        for t in range(30):
            wave = np.sin((t / 30.0) * np.pi * 2 * freq + phase) * amp
            for h in range(21):
                offset = 162 + h * 3
                sample[t, offset] = wave + np.random.uniform(-0.05, 0.05)
                sample[t, offset+1] = wave*0.5 + np.random.uniform(-0.05, 0.05)
                sample[t, offset+2] = np.random.uniform(-0.02, 0.02)
                
        nonsense_samples.append(sample)
    return np.array(nonsense_samples, dtype=np.float32)

def calculate_entropy(probs):
    """Calculate Shannon Entropy of probabilities: H(p) = -sum(p * log(p))."""
    probs = np.clip(probs, 1e-9, 1.0)
    return -np.sum(probs * np.log(probs), axis=-1)

def main():
    print("=" * 80)
    print("DIAGNOSIS OF FORCED 15-CLASS CLASSIFICATION & REJECTION MECHANISMS")
    print("=" * 80)

    dataset_file = "ai_engine/keypoint_dataset.json"
    if not os.path.exists(dataset_file): dataset_file = "keypoint_dataset.json"
    with open(dataset_file, "r") as f: samples = json.load(f)

    X_genuine, y_genuine = [], []
    for path, label in samples:
        full_p = os.path.join("ai_engine", path) if not os.path.exists(path) else path
        if os.path.exists(full_p):
            X_genuine.append(np.load(full_p))
            y_genuine.append(label)

    X_genuine = np.array(X_genuine)
    y_genuine = np.array(y_genuine)

    tflite_path = "ai_engine/motion_speak_model.tflite"
    if not os.path.exists(tflite_path): tflite_path = "motion_speak_model.tflite"
    
    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    def run_tflite_batch(samples_batch):
        outputs = []
        for sample in samples_batch:
            inp = np.expand_dims(sample, 0).astype(np.float32)
            interpreter.set_tensor(input_details[0]['index'], inp)
            interpreter.invoke()
            out = interpreter.get_tensor(output_details[0]['index'])[0]
            outputs.append(out)
        return np.array(outputs)

    # 1. Genuine Signs Evaluation
    probs_genuine = run_tflite_batch(X_genuine)
    top1_g = np.max(probs_genuine, axis=1)
    
    # Top 2 probs & margin
    sorted_g = np.sort(probs_genuine, axis=1)[:, ::-1]
    top2_g = sorted_g[:, 1]
    margin_g = sorted_g[:, 0] - sorted_g[:, 1] # p_top1 - p_top2
    entropy_g = calculate_entropy(probs_genuine)

    # 2. Nonsensical / Arbitrary Movement Evaluation
    X_nonsense = generate_nonsense_movements(100)
    probs_nonsense = run_tflite_batch(X_nonsense)
    
    sorted_n = np.sort(probs_nonsense, axis=1)[:, ::-1]
    top1_n = sorted_n[:, 0]
    top2_n = sorted_n[:, 1]
    margin_n = sorted_n[:, 0] - sorted_n[:, 1]
    entropy_n = calculate_entropy(probs_nonsense)

    print("\n--- CONFIDENCE & MARGIN METRICS COMPARISON ---")
    print(f"{'Metric':35s} | {'Genuine FSL Signs':22s} | {'Nonsense/Arbitrary Movements':25s}")
    print("-" * 88)
    print(f"{'Mean Top-1 Confidence':35s} | {np.mean(top1_g)*100:6.2f}%                 | {np.mean(top1_n)*100:6.2f}%")
    print(f"{'Min Top-1 Confidence':35s} | {np.min(top1_g)*100:6.2f}%                 | {np.min(top1_n)*100:6.2f}%")
    print(f"{'Max Top-1 Confidence':35s} | {np.max(top1_g)*100:6.2f}%                 | {np.max(top1_n)*100:6.2f}%")
    print("-" * 88)
    print(f"{'Mean Top-2 Confidence':35s} | {np.mean(top2_g)*100:6.2f}%                 | {np.mean(top2_n)*100:6.2f}%")
    print(f"{'Mean Probability Margin (Top1-Top2)':35s} | {np.mean(margin_g)*100:6.2f}%                 | {np.mean(margin_n)*100:6.2f}%")
    print(f"{'Mean Softmax Entropy H(p)':35s} | {np.mean(entropy_g):6.4f}                   | {np.mean(entropy_n):6.4f}")

    print("\n--- FORCED CLASSIFICATION ON NONSENSE MOVEMENTS ---")
    preds_n = np.argmax(probs_nonsense, axis=1)
    counts_n = np.bincount(preds_n, minlength=15)
    for i, g in enumerate(TARGET_GLOSSES):
        print(f"  Class {i:2d} ({g:12s}): predicted {counts_n[i]:3d} times on nonsense inputs (Avg Conf: {np.mean(top1_n[preds_n==i])*100:.1f}%)" if counts_n[i]>0 else f"  Class {i:2d} ({g:12s}): predicted   0 times")

    # 3. Evaluate Rejection Criteria
    print("\n" + "=" * 80)
    print("EVALUATING REJECTION RULES (GENUINE SIGN ACCEPTANCE vs NONSENSE REJECTION)")
    print("=" * 80)

    for min_top1 in [0.50, 0.60, 0.70, 0.75, 0.80]:
        for min_margin in [0.20, 0.35, 0.50, 0.60]:
            # Rule: Accept ONLY IF top1 >= min_top1 AND (top1 - top2) >= min_margin
            accept_g = (top1_g >= min_top1) & (margin_g >= min_margin)
            reject_n = ~((top1_n >= min_top1) & (margin_n >= min_margin))

            g_acc_rate = accept_g.mean() * 100 # want ~90-95%
            n_rej_rate = reject_n.mean() * 100 # want ~80-95%

            if g_acc_rate > 85.0 and n_rej_rate > 70.0:
                print(f"Rule [Top1 >= {min_top1*100:.0f}%, Margin >= {min_margin*100:.0f}%] -> Genuine Acceptance: {g_acc_rate:5.1f}% | Nonsense Rejection: {n_rej_rate:5.1f}%")

if __name__ == "__main__":
    main()
