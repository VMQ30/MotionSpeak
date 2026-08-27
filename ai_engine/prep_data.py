"""Prepare sign-language keypoint data from video files for model training.

This script processes videos from both dataset/videos and dataset/new_videos.
It applies 1:1 square letterbox padding to match Android native runtime preprocessing exactly,
extracts normalized keypoint features using MediaPipe pose and hand landmarkers,
trims to active hand gesture frames, resamples sequences to 30 timesteps,
and indexes all samples into keypoint_dataset.json.
"""

import json
import os
import sys
import threading
import cv2
import mediapipe as mp
import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

thread_local = threading.local()

def get_landmarkers():
    """Retrieve or initialize thread-local pose and hand landmarkers."""
    if not hasattr(thread_local, "pose_landmarker"):
        pose_options = vision.PoseLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path="pose_landmarker.task"),
            running_mode=vision.RunningMode.IMAGE,
        )
        thread_local.pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

        hand_options = vision.HandLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path="hand_landmarker.task"),
            running_mode=vision.RunningMode.IMAGE,
            num_hands=2,
        )
        thread_local.hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)

    return thread_local.pose_landmarker, thread_local.hand_landmarker


def normalize_and_extract(pose_result, hand_result):
    """Normalize pose and hand landmarks into a fixed keypoint feature vector."""
    pose = np.zeros((33, 3), dtype=np.float32)
    lh = np.zeros((21, 3), dtype=np.float32)
    rh = np.zeros((21, 3), dtype=np.float32)

    has_pose = bool(pose_result.pose_landmarks and len(pose_result.pose_landmarks) > 0 and len(pose_result.pose_landmarks[0]) > 12)
    has_hand = bool(hand_result.hand_landmarks and len(hand_result.hand_landmarks) > 0)

    anchor = np.array([0.5, 0.5, 0.0], dtype=np.float32)
    scale = 1.0

    if has_pose:
        p_list = np.array([[lm.x, lm.y, lm.z] for lm in pose_result.pose_landmarks[0]], dtype=np.float32)
        l_sh, r_sh = p_list[11], p_list[12]
        cand_anchor = (l_sh + r_sh) / 2.0
        dist = np.linalg.norm(l_sh - r_sh)

        if 0.05 <= dist <= 0.70 and 0.05 <= cand_anchor[0] <= 0.95 and 0.05 <= cand_anchor[1] <= 0.95:
            anchor = cand_anchor
            scale = max(dist, 0.15)
            pose = (p_list - anchor) / scale

    if has_hand and hand_result.handedness:
        for idx, hand_info in enumerate(hand_result.handedness):
            label = hand_info[0].category_name
            raw_hand = np.array([[lm.x, lm.y, lm.z] for lm in hand_result.hand_landmarks[idx]], dtype=np.float32)
            norm_hand = (raw_hand - anchor) / scale

            # Match front camera handedness flip (Left raw category -> Right hand offset)
            eff_label = "Right" if label.lower() == "left" else "Left"

            if eff_label == "Left":
                lh = norm_hand
            elif eff_label == "Right":
                rh = norm_hand

    return np.concatenate([pose.flatten(), lh.flatten(), rh.flatten()]), has_hand


TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse"
]
SEQUENCE_LENGTH = 30


def normalize_gloss_name(name):
    return name.lower().replace(" ", "").replace("_", "")


GLOSS_MAP = {normalize_gloss_name(g): (idx, g) for idx, g in enumerate(TARGET_GLOSSES)}


def process_single_video(args):
    """Worker function to process one video file into normalized 30-timestep array."""
    video_path, save_path, label_idx = args

    pose_landmarker, hand_landmarker = get_landmarkers()
    cap = cv2.VideoCapture(video_path)
    frames_keypoints = []
    active_keypoints = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        # Apply 1:1 square letterbox padding to match Android runtime exactly
        fh, fw = frame.shape[:2]
        max_dim = max(fh, fw)
        pad_w = (max_dim - fw) // 2
        pad_h = (max_dim - fh) // 2
        sq = cv2.copyMakeBorder(frame, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])

        rgb_frame = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        pose_result = pose_landmarker.detect(mp_image)
        hand_result = hand_landmarker.detect(mp_image)

        keypoints, has_hand = normalize_and_extract(pose_result, hand_result)
        frames_keypoints.append(keypoints)
        if has_hand:
            active_keypoints.append(keypoints)

    cap.release()

    target_seq = active_keypoints if len(active_keypoints) >= 6 else frames_keypoints

    if len(target_seq) == 0:
        return None, label_idx, "error"

    indices = np.linspace(0, len(target_seq) - 1, SEQUENCE_LENGTH, dtype=int)
    sampled = [target_seq[i] for i in indices]
    np.save(save_path, np.array(sampled, dtype=np.float32))
    return save_path, label_idx, "processed"


def main():
    os.makedirs("processed_data", exist_ok=True)
    tasks = []

    new_videos_dir = "dataset/new_videos"
    if os.path.exists(new_videos_dir):
        print(f"Scanning custom video dataset directory: {new_videos_dir}", flush=True)
        for folder_name in os.listdir(new_videos_dir):
            folder_path = os.path.join(new_videos_dir, folder_name)
            if not os.path.isdir(folder_path): continue

            norm_name = normalize_gloss_name(folder_name)
            if norm_name not in GLOSS_MAP: continue

            label_idx, canonical_gloss = GLOSS_MAP[norm_name]
            valid_exts = (".mp4", ".avi", ".mov", ".mkv", ".webm")
            video_files = [f for f in os.listdir(folder_path) if f.lower().endswith(valid_exts)]

            for v_idx, v_file in enumerate(video_files):
                v_path = os.path.join(folder_path, v_file)
                clean_stem = os.path.splitext(v_file)[0].replace(" ", "_")
                save_path = f"processed_data/new_{canonical_gloss.replace(' ', '_')}_{v_idx}_{clean_stem}.npy"
                tasks.append((v_path, save_path, label_idx))

    wlasl_json = "dataset/WLASL_v0.3.json"
    if os.path.exists(wlasl_json):
        print(f"Scanning WLASL dataset metadata: {wlasl_json}", flush=True)
        with open(wlasl_json, "r") as f:
            wlasl_data = json.load(f)

        for entry in wlasl_data:
            gloss = entry["gloss"]
            if gloss in TARGET_GLOSSES:
                label_idx = TARGET_GLOSSES.index(gloss)
                for idx, instance in enumerate(entry["instances"]):
                    video_path = f"dataset/videos/{instance['video_id']}.mp4"
                    if not os.path.exists(video_path): continue
                    save_path = f"processed_data/wlasl_{gloss.replace(' ', '_')}_{idx}.npy"
                    tasks.append((video_path, save_path, label_idx))

    print(f"Total video tasks queued: {len(tasks)}. Processing with square letterboxing...", flush=True)

    processed_samples = []
    processed_count = 0
    error_count = 0

    max_workers = 2
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_single_video, task): task for task in tasks}
        for future in as_completed(futures):
            save_path, label_idx, status = future.result()
            if status == "error" or save_path is None:
                error_count += 1
            else:
                processed_samples.append((save_path, label_idx))
                processed_count += 1

            total_done = len(processed_samples) + error_count
            if total_done % 20 == 0 or total_done == len(tasks):
                print(f"  Progress: {total_done}/{len(tasks)} videos complete...", flush=True)

    with open("keypoint_dataset.json", "w") as f:
        json.dump(processed_samples, f)

    print("\n--- Preprocessing Summary ---", flush=True)
    print(f"Total samples processed & indexed: {len(processed_samples)}", flush=True)
    print("Preprocessed dataset index saved to 'keypoint_dataset.json'.", flush=True)

if __name__ == "__main__":
    main()
