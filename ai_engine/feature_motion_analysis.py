import os
import json
import numpy as np

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse", "background"
]

def analyze_motion_trajectory(samples, gloss_name):
    gloss_idx = TARGET_GLOSSES.index(gloss_name)
    gloss_samples = [s for s in samples if s[1] == gloss_idx]

    wrist_trajectories = []
    hand_velocities = []

    for path, _ in gloss_samples:
        norm_path = path if os.path.exists(path) else os.path.join("ai_engine", path)
        if not os.path.exists(norm_path):
            continue
        data = np.load(norm_path) # (30, 225)
        # Check right hand wrist (index 162, 163, 164)
        rh_wrist = data[:, 162:165]
        wrist_trajectories.append(rh_wrist)

        # Calculate velocity frame-to-frame
        diffs = np.diff(rh_wrist, axis=0)
        vel = np.sqrt(np.sum(diffs**2, axis=1))
        hand_velocities.append(vel)

    wrist_trajectories = np.array(wrist_trajectories)
    hand_velocities = np.array(hand_velocities)

    return wrist_trajectories, hand_velocities

def main():
    print("=" * 80)
    print("STEP 4, 5 & 8: FEATURE & TEMPORAL MOTION ANALYSIS FOR NO VS CONFUSED CLASSES")
    print("=" * 80)

    dataset_file = "keypoint_dataset.json"
    if not os.path.exists(dataset_file):
        dataset_file = "ai_engine/keypoint_dataset.json"

    with open(dataset_file, "r") as f:
        samples = json.load(f)

    no_traj, no_vel = analyze_motion_trajectory(samples, "no")
    aft_traj, aft_vel = analyze_motion_trajectory(samples, "afternoon")
    good_traj, good_vel = analyze_motion_trajectory(samples, "good")

    print(f"\n--- Motion Trajectory & Velocity Comparison ---")
    print(f"NO Samples:        Count={len(no_traj)}, Mean RH Wrist Displacement={np.mean(np.std(no_traj, axis=1)):.4f}, Mean Velocity={np.mean(no_vel):.4f}")
    print(f"AFTERNOON Samples: Count={len(aft_traj)}, Mean RH Wrist Displacement={np.mean(np.std(aft_traj, axis=1)):.4f}, Mean Velocity={np.mean(aft_vel):.4f}")
    print(f"GOOD Samples:      Count={len(good_traj)}, Mean RH Wrist Displacement={np.mean(np.std(good_traj, axis=1)):.4f}, Mean Velocity={np.mean(good_vel):.4f}")

    print("\n--- Temporal Trajectory Frame Breakdown (Right Hand Wrist Y-coordinate: 0=chest, positive=lower) ---")
    print(f"{'Frame':<8} | {'NO Wrist Y (Mean)':<20} | {'AFTERNOON Wrist Y (Mean)':<24} | {'GOOD Wrist Y (Mean)':<20}")
    print("-" * 76)

    no_mean_y = np.mean(no_traj[:, :, 1], axis=0)
    aft_mean_y = np.mean(aft_traj[:, :, 1], axis=0)
    good_mean_y = np.mean(good_traj[:, :, 1], axis=0)

    for f_idx in [0, 5, 10, 15, 20, 25, 29]:
        print(f"Frame {f_idx:2d} | {no_mean_y[f_idx]:<20.4f} | {aft_mean_y[f_idx]:<24.4f} | {good_mean_y[f_idx]:<20.4f}")

    # Feature Contribution Analysis across 225 features
    no_samples_data = np.array([np.load(s[0] if os.path.exists(s[0]) else os.path.join("ai_engine", s[0])) for s in samples if s[1] == TARGET_GLOSSES.index("no")])
    aft_samples_data = np.array([np.load(s[0] if os.path.exists(s[0]) else os.path.join("ai_engine", s[0])) for s in samples if s[1] == TARGET_GLOSSES.index("afternoon")])

    pose_diff = np.mean(np.abs(np.mean(no_samples_data[:, :, :99], axis=0) - np.mean(aft_samples_data[:, :, :99], axis=0)))
    lh_diff = np.mean(np.abs(np.mean(no_samples_data[:, :, 99:162], axis=0) - np.mean(aft_samples_data[:, :, 99:162], axis=0)))
    rh_diff = np.mean(np.abs(np.mean(no_samples_data[:, :, 162:225], axis=0) - np.mean(aft_samples_data[:, :, 162:225], axis=0)))

    print("\n--- Feature Component Difference (NO vs AFTERNOON) ---")
    print(f"Pose Landmarks (0..98) Mean Absolute Difference:       {pose_diff:.4f}")
    print(f"Left Hand Landmarks (99..161) Mean Absolute Difference:  {lh_diff:.4f}")
    print(f"Right Hand Landmarks (162..224) Mean Absolute Difference: {rh_diff:.4f}")

if __name__ == "__main__":
    main()
