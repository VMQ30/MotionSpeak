import os
import json
import cv2
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse"
]

def normalize_gloss_name(name):
    return name.lower().replace(" ", "").replace("_", "")

GLOSS_MAP = {normalize_gloss_name(g): (idx, g) for idx, g in enumerate(TARGET_GLOSSES)}

def main():
    print("=" * 80)
    print("DEEP DATASET & PREPROCESSING RE-AUDIT WITH CANONICAL HAND MAPPING")
    print("=" * 80)

    # 1. Inspect raw dataset directories
    new_vids_dir = "dataset/new_videos"
    wlasl_dir = "dataset/videos"
    wlasl_json = "dataset/WLASL_v0.3.json"

    video_files = []

    if os.path.exists(new_vids_dir):
        for folder in os.listdir(new_vids_dir):
            fpath = os.path.join(new_vids_dir, folder)
            if not os.path.isdir(fpath): continue
            norm = normalize_gloss_name(folder)
            if norm in GLOSS_MAP:
                cls_idx, cls_name = GLOSS_MAP[norm]
                for f in os.listdir(fpath):
                    if f.lower().endswith((".mp4", ".avi", ".mov", ".mkv", ".webm")):
                        video_files.append((os.path.join(fpath, f), cls_idx, cls_name, "custom"))

    if os.path.exists(wlasl_json) and os.path.exists(wlasl_dir):
        with open(wlasl_json, "r") as f:
            wdata = json.load(f)
        for entry in wdata:
            gloss = entry["gloss"]
            norm = normalize_gloss_name(gloss)
            if norm in GLOSS_MAP:
                cls_idx, cls_name = GLOSS_MAP[norm]
                for inst in entry["instances"]:
                    vpath = os.path.join(wlasl_dir, f"{inst['video_id']}.mp4")
                    if os.path.exists(vpath):
                        video_files.append((vpath, cls_idx, cls_name, "wlasl"))

    print(f"Total dataset video files found: {len(video_files)}")
    counts_by_class = {i: 0 for i in range(len(TARGET_GLOSSES))}
    counts_by_source = {"custom": 0, "wlasl": 0}

    for _, c_idx, _, src in video_files:
        counts_by_class[c_idx] += 1
        counts_by_source[src] += 1

    print("\nDataset Video Breakdown by Class:")
    for idx in range(len(TARGET_GLOSSES)):
        print(f"  Class {idx:2d} ({TARGET_GLOSSES[idx]:14s}): {counts_by_class[idx]:4d} videos")

    print(f"\nDataset Breakdown by Source: Custom={counts_by_source['custom']}, WLASL={counts_by_source['wlasl']}")

    # 2. Check existing preprocessed files in keypoint_dataset.json
    with open("keypoint_dataset.json", "r") as f:
        kp_samples = json.load(f)

    print(f"\nIndexed preprocessed samples in keypoint_dataset.json: {len(kp_samples)}")

    # 3. Test canonical preprocessing vs current preprocessing on a sample subset
    print("\n" + "=" * 80)
    print("CANONICAL HAND MAPPING VS CURRENT MAPPING COMPARISON")
    print("=" * 80)
    print("Canonical Hand Mapping Rule:")
    print("  Offline Video MediaPipe 'Left'  -> Physical Left Hand  -> lh slot (99..161)")
    print("  Offline Video MediaPipe 'Right' -> Physical Right Hand -> rh slot (162..224)")
    print("\nAndroid Selfie Camera Rule:")
    print("  Selfie Camera MediaPipe 'Left' (mirrored R) -> Physical Right Hand -> rh slot (162..224)")
    print("  Selfie Camera MediaPipe 'Right' (mirrored L) -> Physical Left Hand -> lh slot (99..161)")

if __name__ == "__main__":
    main()
