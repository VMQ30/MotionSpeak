import os
import cv2
import json
import numpy as np
import tensorflow as tf
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse"
]

def analyze_video(video_path):
    cap = cv2.VideoCapture(video_path)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    cap.release()
    return {"width": w, "height": h, "fps": fps, "total_frames": total_frames, "duration": duration, "aspect_ratio": w/h if h>0 else 0}

def main():
    print("=" * 80)
    print("STEP 1: INSPECT sample.mp4 METADATA & COMPARISON WITH DATASET")
    print("=" * 80)

    sample_path = "../sample.mp4"
    if not os.path.exists(sample_path):
        sample_path = "sample.mp4"
    
    sample_meta = analyze_video(sample_path)
    print(f"sample.mp4: {sample_meta['width']}x{sample_meta['height']}, FPS={sample_meta['fps']:.2f}, Frames={sample_meta['total_frames']}, Duration={sample_meta['duration']:.2f}s, AspectRatio={sample_meta['aspect_ratio']:.3f}")

    # Inspect dataset videos in new_videos/Sorry
    dataset_dir = "dataset/new_videos/Sorry"
    if os.path.exists(dataset_dir):
        sample_ds_files = os.listdir(dataset_dir)[:5]
        print("\nDataset Examples (new_videos/Sorry):")
        for f in sample_ds_files:
            if f.endswith(".mp4"):
                m = analyze_video(os.path.join(dataset_dir, f))
                print(f"  {f}: {m['width']}x{m['height']}, FPS={m['fps']:.2f}, Frames={m['total_frames']}, Duration={m['duration']:.2f}s, AspectRatio={m['aspect_ratio']:.3f}")

    # MediaPipe setup
    pose_options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="pose_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
    )
    pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path="hand_landmarker.task"),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)

    # Detailed Frame-by-Frame MediaPipe & Preprocessing Trace on sample.mp4
    cap = cv2.VideoCapture(sample_path)
    frames_info = []
    
    frame_idx = 0
    raw_keypoints_list = []
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        # Test 0 degree (raw frame as stored in sample.mp4)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        pose_res = pose_landmarker.detect(mp_image)
        hand_res = hand_landmarker.detect(mp_image)

        has_pose = bool(pose_res.pose_landmarks and len(pose_res.pose_landmarks) > 0)
        has_hand = bool(hand_res.hand_landmarks and len(hand_res.hand_landmarks) > 0)
        
        raw_handedness = []
        if has_hand and hand_res.handedness:
            for h in hand_res.handedness:
                raw_handedness.append(f"{h[0].category_name}:{h[0].score:.2f}")

        # Compute feature vector exactly as in MotionSpeakAIModule.kt
        features = np.zeros(225, dtype=np.float32)
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

            if 0.10 <= dist <= 0.70 and 0.15 <= cx <= 0.85 and 0.15 <= cy <= 0.85:
                center_anchor = [cx, cy, cz]
                scale_factor = max(dist, 0.18)
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

                # Front camera effective handedness (swap Left/Right) vs Rear camera (keep)
                # Let's test BOTH raw_cat and swapped_cat
                # MotionSpeakAIModule.kt line 367:
                # val effectiveCategory = if (isFrontCamera) (if (rawCategory=="Left") "Right" else "Left") else rawCategory
                # val offset = if (effectiveCategory=="Left") 99 else 162
                effective_cat = "Right" if raw_cat.lower() == "left" else "Left"
                offset = 99 if effective_cat.lower() == "left" else 162

                for h in range(min(21, len(h_list))):
                    lm = h_list[h]
                    features[offset + h*3] = (lm.x - center_anchor[0]) / scale_factor
                    features[offset + h*3+1] = (lm.y - center_anchor[1]) / scale_factor
                    features[offset + h*3+2] = (lm.z - center_anchor[2]) / scale_factor

        raw_keypoints_list.append(features)
        frames_info.append({
            "frame": frame_idx,
            "has_pose": has_pose,
            "has_hand": has_hand,
            "handedness": raw_handedness,
            "is_pose_valid": is_pose_valid,
            "scale_factor": scale_factor,
            "anchor": center_anchor
        })
        frame_idx += 1

    cap.release()

    total_f = len(frames_info)
    pose_f = sum(1 for f in frames_info if f['has_pose'])
    hand_f = sum(1 for f in frames_info if f['has_hand'])

    print(f"\nMediaPipe Detection Summary on sample.mp4 (Raw orientation 0°):")
    print(f"  Total frames: {total_f}")
    print(f"  Pose detected: {pose_f} / {total_f} ({pose_f/total_f*100:.1f}%)")
    print(f"  Hand detected: {hand_f} / {total_f} ({hand_f/total_f*100:.1f}%)")
    print(f"  First 5 frame handedness: {[f['handedness'] for f in frames_info[:5]]}")

    # Model Inference
    interpreter = tf.lite.Interpreter(model_path="motion_speak_model.tflite")
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    print("\nModel Input Tensor Schema:")
    print("  Shape:", input_details[0]['shape'])
    print("  Type:", input_details[0]['dtype'])

    # Test full 30-frame sequence uniform sampling (how training script sampled)
    indices = np.linspace(0, total_f - 1, 30, dtype=int)
    seq_uniform = np.array([raw_keypoints_list[i] for i in indices])
    input_uniform = np.expand_dims(seq_uniform, axis=0).astype(np.float32)

    interpreter.set_tensor(input_details[0]['index'], input_uniform)
    interpreter.invoke()
    output_uniform = interpreter.get_tensor(output_details[0]['index'])[0]

    print("\n--- Model Output (Uniform 30-frame sampling over full video) ---")
    indexed = sorted(enumerate(output_uniform), key=lambda x: x[1], reverse=True)
    for rank, (cls_idx, prob) in enumerate(indexed[:5], 1):
        print(f"  Rank {rank}: {TARGET_GLOSSES[cls_idx]:12s} (Class {cls_idx:2d}) -> {prob*100:6.2f}%")

    # Test Android Continuous Rolling History Buffer (30 frames max, resampled)
    print("\n--- Model Output (Android Rolling History Buffer frame-by-frame) ---")
    history = []
    predictions = []
    for idx, f_vec in enumerate(raw_keypoints_list):
        history.append(f_vec)
        if len(history) > 30:
            history.pop(0)
        
        if len(history) >= 6:
            input_tensor = np.zeros((1, 30, 225), dtype=np.float32)
            count = len(history)
            for i in range(30):
                src_idx = (i * count) // 30
                input_tensor[0, i] = history[min(src_idx, count - 1)]

            interpreter.set_tensor(input_details[0]['index'], input_tensor)
            interpreter.invoke()
            out = interpreter.get_tensor(output_details[0]['index'])[0]
            top_cls = np.argmax(out)
            top_prob = out[top_cls]
            predictions.append((idx, len(history), TARGET_GLOSSES[top_cls], top_prob, out))

    print(f"Total rolling inference steps: {len(predictions)}")
    if predictions:
        print("First 5 predictions (as buffer fills from 6 to 30 frames):")
        for p in predictions[:5]:
            print(f"  Frame {p[0]:3d} (Buffer size {p[1]:2d}): Top1='{p[2]}' ({p[3]*100:.2f}%)")
        print("Last 5 predictions (full buffer):")
        for p in predictions[-5:]:
            print(f"  Frame {p[0]:3d} (Buffer size {p[1]:2d}): Top1='{p[2]}' ({p[3]*100:.2f}%)")

    # Check TFLite Tensor stats for min/max/mean/std on pose, left hand, right hand
    last_tensor = predictions[-1][4]
    sample_input = input_uniform[0] # (30, 225)
    pose_part = sample_input[:, 0:99]
    lh_part = sample_input[:, 99:162]
    rh_part = sample_input[:, 162:225]

    print("\n--- Input Feature Statistics (sample.mp4) ---")
    print(f"Overall Tensor: min={sample_input.min():.4f}, max={sample_input.max():.4f}, mean={sample_input.mean():.4f}, std={sample_input.std():.4f}")
    print(f"Pose Part (0..98): min={pose_part.min():.4f}, max={pose_part.max():.4f}, non-zero count={np.count_nonzero(pose_part)}")
    print(f"Left Hand (99..161): min={lh_part.min():.4f}, max={lh_part.max():.4f}, non-zero count={np.count_nonzero(lh_part)}")
    print(f"Right Hand (162..224): min={rh_part.min():.4f}, max={rh_part.max():.4f}, non-zero count={np.count_nonzero(rh_part)}")

if __name__ == "__main__":
    main()
