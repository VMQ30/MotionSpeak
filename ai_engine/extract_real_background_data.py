import os
import json
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

def extract_real_background_samples():
    processed_dir = "processed_data"
    os.makedirs(processed_dir, exist_ok=True)

    pose_options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="ai_engine/pose_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
    )
    pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="ai_engine/hand_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)

    new_videos_dir = "dataset/new_videos" if os.path.exists("dataset/new_videos") else "ai_engine/dataset/new_videos"
    if not os.path.exists(new_videos_dir):
        print(f"Error: {new_videos_dir} not found.")
        return

    bg_samples = []

    print(f"Extracting real background keypoint sequences from {new_videos_dir}...")

    video_count = 0
    for folder_name in os.listdir(new_videos_dir):
        folder_path = os.path.join(new_videos_dir, folder_name)
        if not os.path.isdir(folder_path):
            continue

        valid_exts = (".mp4", ".avi", ".mov", ".mkv", ".webm")
        video_files = [f for f in os.listdir(folder_path) if f.lower().endswith(valid_exts)]

        for v_file in video_files:
            v_path = os.path.join(folder_path, v_file)
            cap = cv2.VideoCapture(v_path)
            frames_keypoints = []

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret: break

                img = frame.copy()
                fh, fw = img.shape[:2]
                max_dim = max(fh, fw)
                pad_w = (max_dim - fw) // 2
                pad_h = (max_dim - fh) // 2
                square_frame = cv2.copyMakeBorder(img, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])

                rgb = cv2.cvtColor(square_frame, cv2.COLOR_BGR2RGB)
                mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

                pose_res = pose_landmarker.detect(mp_img)
                hand_res = hand_landmarker.detect(mp_img)

                features = np.zeros(225, dtype=np.float32)
                has_pose = bool(pose_res.pose_landmarks and len(pose_res.pose_landmarks) > 0)
                has_hand = bool(hand_res.hand_landmarks and len(hand_res.hand_landmarks) > 0)

                center_anchor = [0.5, 0.5, 0.0]
                scale_factor = 1.0
                is_pose_valid = False

                if has_pose and len(pose_res.pose_landmarks[0]) > 12:
                    p_list = pose_res.pose_landmarks[0]
                    l_sh = p_list[11]
                    r_sh = p_list[12]
                    cx = (l_sh.x + r_sh.x) / 2.0
                    cy = (l_sh.y + r_sh.y) / 2.0
                    cz = (l_sh.z + r_sh.z) / 2.0
                    dist = np.sqrt((l_sh.x - r_sh.x)**2 + (l_sh.y - r_sh.y)**2 + (l_sh.z - r_sh.z)**2)

                    if 0.05 <= dist <= 0.70 and 0.05 <= cx <= 0.95 and 0.05 <= cy <= 0.95:
                        center_anchor = [cx, cy, cz]
                        scale_factor = max(dist, 0.15)
                        is_pose_valid = True

                        for p in range(min(33, len(p_list))):
                            lm = p_list[p]
                            features[p*3] = (lm.x - center_anchor[0]) / scale_factor
                            features[p*3+1] = (lm.y - center_anchor[1]) / scale_factor
                            features[p*3+2] = (lm.z - center_anchor[2]) / scale_factor

                if has_hand and hand_res.handedness:
                    for idx in range(min(len(hand_res.hand_landmarks), len(hand_res.handedness))):
                        raw_cat = hand_res.handedness[idx][0].category_name
                        h_list = hand_res.hand_landmarks[idx]

                        if not is_pose_valid and idx == 0:
                            wrist = h_list[0]
                            mid = h_list[9] if len(h_list) > 9 else wrist
                            hdist = np.sqrt((wrist.x-mid.x)**2 + (wrist.y-mid.y)**2 + (wrist.z-mid.z)**2)
                            center_anchor = [wrist.x, wrist.y + 0.15, wrist.z]
                            scale_factor = max(hdist * 2.2, 0.25)

                        offset = 99 if raw_cat.lower() == 'left' else 162

                        for h in range(min(21, len(h_list))):
                            lm = h_list[h]
                            features[offset + h*3] = (lm.x - center_anchor[0]) / scale_factor
                            features[offset + h*3+1] = (lm.y - center_anchor[1]) / scale_factor
                            features[offset + h*3+2] = (lm.z - center_anchor[2]) / scale_factor

                frames_keypoints.append(features)

            cap.release()

            total_f = len(frames_keypoints)
            if total_f >= 15:
                # Extract PRE sequence (first 30% of video - hand raising/rest)
                pre_end = max(5, int(total_f * 0.35))
                pre_indices = np.linspace(0, pre_end - 1, 30, dtype=int)
                pre_seq = np.array([frames_keypoints[i] for i in pre_indices], dtype=np.float32)
                
                save_pre = os.path.abspath(f"{processed_dir}/bg_real_pre_{video_count}.npy")
                np.save(save_pre, pre_seq)
                bg_samples.append([save_pre, 15])

                # Extract POST sequence (last 35% of video - hand lowering/rest)
                post_start = min(total_f - 5, int(total_f * 0.65))
                post_indices = np.linspace(post_start, total_f - 1, 30, dtype=int)
                post_seq = np.array([frames_keypoints[i] for i in post_indices], dtype=np.float32)

                save_post = os.path.abspath(f"{processed_dir}/bg_real_post_{video_count}.npy")
                np.save(save_post, post_seq)
                bg_samples.append([save_post, 15])

                video_count += 1

    pose_landmarker.close()
    hand_landmarker.close()

    dataset_json_path = "ai_engine/keypoint_dataset.json"
    with open(dataset_json_path, "r") as f:
        dataset = json.load(f)

    # Filter out synthetic background samples
    filtered_dataset = [item for item in dataset if item[1] != 15]
    final_dataset = filtered_dataset + bg_samples

    print(f"Extracted real background samples from {video_count} videos: {len(bg_samples)} total background sequences")
    print(f"Total samples in updated dataset: {len(final_dataset)}")

    with open(dataset_json_path, "w") as f:
        json.dump(final_dataset, f, indent=2)

    print(f"Updated {dataset_json_path} successfully!")

if __name__ == "__main__":
    extract_real_background_samples()
