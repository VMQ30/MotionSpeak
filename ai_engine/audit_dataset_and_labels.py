import os
import hashlib
import json
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse"
]

DATASET_DIRS = [
    os.path.abspath("dataset/new_videos"),
    os.path.abspath("dataset/videos")
]

def file_hash(filepath):
    hasher = hashlib.md5()
    with open(filepath, "rb") as f:
        buf = f.read(65536)
        while len(buf) > 0:
            hasher.update(buf)
            buf = f.read(65536)
    return hasher.hexdigest()

def main():
    print("=" * 90)
    print("EXHAUSTIVE FSL DATASET & LABEL AUDIT")
    print("=" * 90)

    pose_options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=os.path.abspath("pose_landmarker.task")),
        running_mode=vision.RunningMode.IMAGE,
    )
    pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=os.path.abspath("hand_landmarker.task")),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)

    dataset_stats = {}
    for gloss in TARGET_GLOSSES:
        dataset_stats[gloss] = {
            "file_count": 0,
            "total_frames": 0,
            "total_duration": 0.0,
            "valid_hand_frames": 0,
            "valid_pose_frames": 0,
            "files": []
        }

    seen_hashes = {}
    duplicates = []
    suspicious_files = []

    for d_dir in DATASET_DIRS:
        if not os.path.exists(d_dir): continue
        for root, dirs, files in os.walk(d_dir):
            for file in files:
                if not file.lower().endswith((".mp4", ".avi", ".mov", ".m4v")): continue
                
                # Identify gloss folder name
                rel_path = os.path.relpath(os.path.join(root, file), d_dir)
                folder_name = rel_path.split(os.sep)[0].lower().replace(" ", "").replace("_", "")

                matched_gloss = None
                for gloss in TARGET_GLOSSES:
                    norm_gloss = gloss.lower().replace(" ", "").replace("_", "")
                    if norm_gloss == folder_name or folder_name.startswith(norm_gloss):
                        matched_gloss = gloss
                        break

                if not matched_gloss:
                    continue

                full_path = os.path.join(root, file)
                f_hash = file_hash(full_path)
                if f_hash in seen_hashes:
                    duplicates.append((full_path, seen_hashes[f_hash]))
                else:
                    seen_hashes[f_hash] = full_path

                cap = cv2.VideoCapture(full_path)
                v_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
                v_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                v_duration = v_frames / v_fps if v_fps > 0 else 0.0

                p_count = 0
                h_count = 0
                lh_count = 0
                rh_count = 0

                f_idx = 0
                while cap.isOpened():
                    ret, frame = cap.read()
                    if not ret: break

                    fh, fw = frame.shape[:2]
                    max_dim = max(fh, fw)
                    sq = cv2.copyMakeBorder(frame, (max_dim-fh)//2, (max_dim-fh)//2, (max_dim-fw)//2, (max_dim-fw)//2, cv2.BORDER_CONSTANT, value=[0,0,0])
                    rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
                    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

                    p_res = pose_landmarker.detect(mp_img)
                    h_res = hand_landmarker.detect(mp_img)

                    if p_res.pose_landmarks and len(p_res.pose_landmarks[0]) > 12:
                        p_count += 1

                    if h_res.hand_landmarks and len(h_res.hand_landmarks) > 0:
                        h_count += 1
                        for idx in range(min(len(h_res.hand_landmarks), len(h_res.handedness))):
                            cat = h_res.handedness[idx][0].category_name
                            if cat.lower() == "left": lh_count += 1
                            else: rh_count += 1

                    f_idx += 1
                cap.release()

                if h_count == 0 or v_frames < 6:
                    suspicious_files.append((matched_gloss, os.path.basename(full_path), f"Low/Zero Hand Detection ({h_count}/{v_frames} frames)"))

                st = dataset_stats[matched_gloss]
                st["file_count"] += 1
                st["total_frames"] += v_frames
                st["total_duration"] += v_duration
                st["valid_hand_frames"] += h_count
                st["valid_pose_frames"] += p_count
                st["files"].append({
                    "path": full_path,
                    "rel": rel_path,
                    "frames": v_frames,
                    "fps": v_fps,
                    "duration": v_duration,
                    "hand_frames": h_count,
                    "pose_frames": p_count,
                    "lh_count": lh_count,
                    "rh_count": rh_count
                })

    pose_landmarker.close()
    hand_landmarker.close()

    print(f"\n{'Class Gloss':14s} | {'Files':6s} | {'Total Frames':13s} | {'Avg Duration':13s} | {'Hand Detection Rate':20s}")
    print("-" * 75)
    total_all_files = 0
    for gloss in TARGET_GLOSSES:
        st = dataset_stats[gloss]
        total_all_files += st["file_count"]
        avg_dur = st["total_duration"] / st["file_count"] if st["file_count"] > 0 else 0.0
        h_rate = (st["valid_hand_frames"] / st["total_frames"] * 100.0) if st["total_frames"] > 0 else 0.0
        print(f"{gloss:14s} | {st['file_count']:6d} | {st['total_frames']:13d} | {avg_dur:11.2f}s | {h_rate:18.1f}%")

    print("-" * 75)
    print(f"TOTAL VIDEOS ACCUMULATED ACROSS ALL CLASSES: {total_all_files}")

    print("\n--- DUPLICATE FILES FOUND ---")
    if duplicates:
        for f1, f2 in duplicates:
            print(f"  DUPLICATE: {os.path.basename(f1)} <==> {os.path.basename(f2)}")
    else:
        print("  No duplicate binary files found.")

    print("\n--- SUSPICIOUS / LOW HAND DETECTED FILES ---")
    if suspicious_files:
        for gloss, fname, reason in suspicious_files:
            print(f"  [{gloss:10s}] {fname:30s} -> {reason}")
    else:
        print("  No suspicious files found.")

    with open("dataset_audit_results.json", "w") as f:
        json.dump(dataset_stats, f, indent=2)
    print("\nFull dataset audit output written to dataset_audit_results.json")

if __name__ == "__main__":
    main()
