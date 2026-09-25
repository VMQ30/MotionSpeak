import os
import json
import numpy as np

def generate_diverse_background_samples():
    processed_dir = "processed_data"
    os.makedirs(processed_dir, exist_ok=True)

    dataset_json_path = "ai_engine/keypoint_dataset.json"
    if not os.path.exists(dataset_json_path):
        print(f"Error: {dataset_json_path} not found.")
        return

    with open(dataset_json_path, "r") as f:
        dataset = json.load(f)

    # Filter out any existing old background entries from JSON
    filtered_dataset = [item for item in dataset if item[1] != 15]

    bg_samples = []

    # 1. Static Hand Rest Sequences (50 samples)
    # Hand stationary at various locations relative to center anchor
    np.random.seed(42)
    for i in range(50):
        seq = np.zeros((30, 225), dtype=np.float32)
        wrist_offset_x = np.random.uniform(-0.4, 0.4)
        wrist_offset_y = np.random.uniform(0.1, 0.6)
        wrist_offset_z = np.random.uniform(-0.1, 0.2)

        for t in range(30):
            # Pose landmarks (basic shoulders/hips)
            seq[t, 11*3:11*3+3] = [-0.2, 0.0, 0.0]  # Left shoulder
            seq[t, 12*3:12*3+3] = [0.2, 0.0, 0.0]   # Right shoulder

            # Right hand (indices 162..224)
            # Add small static tremble
            tremble = np.random.normal(0, 0.005, 63)
            hand_base = np.zeros(63)
            # Wrist
            hand_base[0:3] = [wrist_offset_x, wrist_offset_y, wrist_offset_z]
            # Finger tips extended slightly
            for f_idx in range(5):
                hand_base[(f_idx+1)*12 : (f_idx+1)*12+3] = [
                    wrist_offset_x + (f_idx - 2)*0.03,
                    wrist_offset_y - 0.1,
                    wrist_offset_z
                ]
            seq[t, 162:225] = hand_base + tremble

        save_path = os.path.abspath(f"{processed_dir}/bg_static_{i}.npy")
        np.save(save_path, seq)
        bg_samples.append([save_path, 15])

    # 2. Smooth Random Trajectory Sequences (50 samples)
    # Natural hand movement across screen (drawing arcs/lines/waving)
    for i in range(50):
        seq = np.zeros((30, 225), dtype=np.float32)
        freq_x = np.random.uniform(0.5, 2.0)
        freq_y = np.random.uniform(0.5, 2.0)
        phase = np.random.uniform(0, 2*np.pi)
        amp_x = np.random.uniform(0.2, 0.5)
        amp_y = np.random.uniform(0.2, 0.5)

        for t in range(30):
            progress = t / 30.0
            seq[t, 11*3:11*3+3] = [-0.2, 0.0, 0.0]
            seq[t, 12*3:12*3+3] = [0.2, 0.0, 0.0]

            pos_x = amp_x * np.sin(2 * np.pi * freq_x * progress + phase)
            pos_y = amp_y * np.cos(2 * np.pi * freq_y * progress + phase) + 0.3

            hand_base = np.zeros(63)
            hand_base[0:3] = [pos_x, pos_y, 0.0]
            for f_idx in range(5):
                hand_base[(f_idx+1)*12 : (f_idx+1)*12+3] = [
                    pos_x + (f_idx - 2)*0.04,
                    pos_y - 0.12,
                    0.0
                ]
            tremble = np.random.normal(0, 0.008, 63)
            seq[t, 162:225] = hand_base + tremble

        save_path = os.path.abspath(f"{processed_dir}/bg_trajectory_{i}.npy")
        np.save(save_path, seq)
        bg_samples.append([save_path, 15])

    # 3. Random Finger Flutter / Transition Sequences (50 samples)
    for i in range(50):
        seq = np.zeros((30, 225), dtype=np.float32)
        for t in range(30):
            seq[t, 11*3:11*3+3] = [-0.2, 0.0, 0.0]
            seq[t, 12*3:12*3+3] = [0.2, 0.0, 0.0]

            # Randomly active hand keypoints
            hand_rnd = np.random.uniform(-0.5, 0.5, 63)
            seq[t, 162:225] = hand_rnd

        save_path = os.path.abspath(f"{processed_dir}/bg_flutter_{i}.npy")
        np.save(save_path, seq)
        bg_samples.append([save_path, 15])

    # Combine positive samples and new background samples
    final_dataset = filtered_dataset + bg_samples
    print(f"Original FSL samples: {len(filtered_dataset)}")
    print(f"Added background samples: {len(bg_samples)}")
    print(f"Total samples in updated dataset: {len(final_dataset)}")

    with open(dataset_json_path, "w") as f:
        json.dump(final_dataset, f, indent=2)

    print(f"Successfully updated {dataset_json_path}!")

if __name__ == "__main__":
    generate_diverse_background_samples()
