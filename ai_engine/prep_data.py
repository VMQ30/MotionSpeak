"""Prepare sign-language keypoint data from video files for model training.

This script processes videos from both the WLASL dataset (dataset/videos)
and custom added datasets (dataset/new_videos). It extracts normalized keypoint
features using MediaPipe pose and hand landmarkers in parallel, resamples frame sequences
to a fixed length (30 frames), and indexes all processed samples in keypoint_dataset.json.
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
    pose = np.zeros((33, 3))
    lh = np.zeros((21, 3))
    rh = np.zeros((21, 3))

    if not pose_result.pose_landmarks or len(pose_result.pose_landmarks) == 0:
        return np.concatenate([pose.flatten(), lh.flatten(), rh.flatten()])

    pose = np.array([[lm.x, lm.y, lm.z] for lm in pose_result.pose_landmarks[0]])

    left_shoulder, right_shoulder = pose[11], pose[12]
    center_anchor = (left_shoulder + right_shoulder) / 2.0
    shoulder_dist = np.linalg.norm(left_shoulder - right_shoulder)
    scale_factor = shoulder_dist if shoulder_dist > 1e-6 else 1.0

    pose = (pose - center_anchor) / scale_factor

    if hand_result.hand_landmarks and hand_result.handedness:
        for idx, hand_info in enumerate(hand_result.handedness):
            label = hand_info[0].category_name
            raw_hand = np.array(
                [[lm.x, lm.y, lm.z] for lm in hand_result.hand_landmarks[idx]]
            )
            norm_hand = (raw_hand - center_anchor) / scale_factor

            if label == "Left":
                lh = norm_hand
            elif label == "Right":
                rh = norm_hand

    return np.concatenate([pose.flatten(), lh.flatten(), rh.flatten()])


TARGET_GLOSSES = [
    "hello",
    "yes",
    "no",
    "good",
    "bad",
    "what",
    "thank you",
    "welcome",
    "please",
    "sorry",
    "goodbye",
    "morning",
    "afternoon",
    "evening",
    "excuse",
]
SEQUENCE_LENGTH = 30  # Fixed 30 frames per sign


def normalize_gloss_name(name):
    """Normalize gloss/directory names for fuzzy matching."""
    return name.lower().replace(" ", "").replace("_", "")


GLOSS_MAP = {normalize_gloss_name(g): (idx, g) for idx, g in enumerate(TARGET_GLOSSES)}


def process_single_video(args):
    """Worker function to process one video file."""
    video_path, save_path, label_idx = args
    if os.path.exists(save_path):
        return save_path, label_idx, "cached"

    pose_landmarker, hand_landmarker = get_landmarkers()
    cap = cv2.VideoCapture(video_path)
    frames_keypoints = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        pose_result = pose_landmarker.detect(mp_image)
        hand_result = hand_landmarker.detect(mp_image)

        keypoints = normalize_and_extract(pose_result, hand_result)
        frames_keypoints.append(keypoints)

    cap.release()

    if len(frames_keypoints) == 0:
        return None, label_idx, "error"

    indices = np.linspace(
        0, len(frames_keypoints) - 1, SEQUENCE_LENGTH, dtype=int
    )
    sampled = [frames_keypoints[i] for i in indices]
    np.save(save_path, np.array(sampled))
    return save_path, label_idx, "processed"


def main():
    os.makedirs("processed_data", exist_ok=True)
    tasks = []

    # 1. Collect new video dataset in dataset/new_videos
    new_videos_dir = "dataset/new_videos"
    if os.path.exists(new_videos_dir):
        print(f"Scanning custom video dataset directory: {new_videos_dir}", flush=True)
        for folder_name in os.listdir(new_videos_dir):
            folder_path = os.path.join(new_videos_dir, folder_name)
            if not os.path.isdir(folder_path):
                continue

            norm_name = normalize_gloss_name(folder_name)
            if norm_name not in GLOSS_MAP:
                print(f"  [Skipped] Folder '{folder_name}' does not match any target gloss.", flush=True)
                continue

            label_idx, canonical_gloss = GLOSS_MAP[norm_name]
            valid_exts = (".mp4", ".avi", ".mov", ".mkv", ".webm")
            video_files = [f for f in os.listdir(folder_path) if f.lower().endswith(valid_exts)]

            for v_idx, v_file in enumerate(video_files):
                v_path = os.path.join(folder_path, v_file)
                clean_stem = os.path.splitext(v_file)[0].replace(" ", "_")
                save_path = f"processed_data/new_{canonical_gloss.replace(' ', '_')}_{v_idx}_{clean_stem}.npy"
                tasks.append((v_path, save_path, label_idx))

    # 2. Collect WLASL dataset in dataset/WLASL_v0.3.json & dataset/videos
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
                    if not os.path.exists(video_path):
                        continue

                    save_path = f"processed_data/wlasl_{gloss.replace(' ', '_')}_{idx}.npy"
                    tasks.append((video_path, save_path, label_idx))

    print(f"Total video tasks queued: {len(tasks)}. Processing using parallel worker pool...", flush=True)

    processed_samples = []
    processed_count = 0
    cached_count = 0
    error_count = 0

    max_workers = min(6, os.cpu_count() or 4)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_single_video, task): task for task in tasks}
        for future in as_completed(futures):
            save_path, label_idx, status = future.result()
            if status == "error" or save_path is None:
                error_count += 1
            else:
                processed_samples.append((save_path, label_idx))
                if status == "cached":
                    cached_count += 1
                else:
                    processed_count += 1

            total_done = len(processed_samples) + error_count
            if total_done % 20 == 0 or total_done == len(tasks):
                print(f"  Progress: {total_done}/{len(tasks)} videos complete ({processed_count} new, {cached_count} cached)...", flush=True)

    with open("keypoint_dataset.json", "w") as f:
        json.dump(processed_samples, f)

    print("\n--- Preprocessing Summary ---", flush=True)
    print(f"New samples extracted: {processed_count}", flush=True)
    print(f"Cached samples reused: {cached_count}", flush=True)
    print(f"Failed/Empty videos:   {error_count}", flush=True)
    print(f"Total samples indexed: {len(processed_samples)}", flush=True)
    print("Preprocessed dataset index saved to 'keypoint_dataset.json'.", flush=True)


if __name__ == "__main__":
    main()
