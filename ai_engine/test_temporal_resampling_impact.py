import os
import cv2
import numpy as np
import tensorflow as tf
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse"
]

def lerp_resample(sequence, target_length=30):
    if len(sequence) == target_length:
        return np.array(sequence, dtype=np.float32)
    indices = np.linspace(0, len(sequence) - 1, target_length)
    resampled = []
    for idx in indices:
        low = int(np.floor(idx))
        high = int(np.ceil(idx))
        weight = idx - low
        if low == high or high >= len(sequence):
            resampled.append(sequence[low])
        else:
            interp = (1.0 - weight) * sequence[low] + weight * sequence[high]
            resampled.append(interp)
    return np.array(resampled, dtype=np.float32)

def nn_resample(sequence, target_length=30):
    count = len(sequence)
    resampled = np.zeros((target_length, 225), dtype=np.float32)
    for i in range(target_length):
        src_idx = (i * count) // target_length
        resampled[i] = sequence[min(src_idx, count - 1)]
    return resampled

def test_temporal_impact():
    video_path = "../user_exp2.mp4"
    if not os.path.exists(video_path):
        video_path = "user_exp2.mp4"

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

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

    interpreter = tf.lite.Interpreter(model_path="motion_speak_model.tflite")
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    frame_history = []
    frame_idx = 0
    step_frames = max(1, int(round(fps * 0.075)))

    print("=" * 90)
    print("COMPARING TEMPORAL RESAMPLING & MINIMUM HISTORY THRESHOLDS ON user_exp2.mp4")
    print("=" * 90)

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        if frame_idx % step_frames == 0:
            t_sec = frame_idx / fps
            fh, fw = frame.shape[:2]
            max_dim = max(fh, fw)
            pad_w = (max_dim - fw) // 2
            pad_h = (max_dim - fh) // 2
            sq = cv2.copyMakeBorder(frame, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])
            rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            pose_res = pose_landmarker.detect(mp_image)
            hand_res = hand_landmarker.detect(mp_image)

            has_pose = bool(pose_res.pose_landmarks and len(pose_res.pose_landmarks) > 0 and len(pose_res.pose_landmarks[0]) > 12)
            has_hand = bool(hand_res.hand_landmarks and len(hand_res.hand_landmarks) > 0)

            feat = np.zeros(225, dtype=np.float32)
            center_anchor = [0.5, 0.5, 0.0]
            scale_factor = 1.0

            if has_pose:
                p_list = pose_res.pose_landmarks[0]
                l_sh, r_sh = p_list[11], p_list[12]
                cx = (l_sh.x + r_sh.x) / 2.0
                cy = (l_sh.y + r_sh.y) / 2.0
                cz = (l_sh.z + r_sh.z) / 2.0
                shoulder_dist = np.sqrt((l_sh.x - r_sh.x)**2 + (l_sh.y - r_sh.y)**2 + (l_sh.z - r_sh.z)**2)
                if 0.05 <= shoulder_dist <= 0.70 and 0.05 <= cx <= 0.95 and 0.05 <= cy <= 0.95:
                    center_anchor = [cx, cy, cz]
                    scale_factor = max(shoulder_dist, 0.15)
                    for p in range(min(33, len(p_list))):
                        lm = p_list[p]
                        feat[p*3] = (lm.x - center_anchor[0]) / scale_factor
                        feat[p*3+1] = (lm.y - center_anchor[1]) / scale_factor
                        feat[p*3+2] = (lm.z - center_anchor[2]) / scale_factor

            if has_hand and hand_res.handedness:
                for idx in range(min(len(hand_res.hand_landmarks), len(hand_res.handedness))):
                    raw_cat = hand_res.handedness[idx][0].category_name
                    h_list = hand_res.hand_landmarks[idx]
                    off = 99 if raw_cat.lower() == "left" else 162
                    for h in range(min(21, len(h_list))):
                        lm = h_list[h]
                        feat[off + h*3] = (lm.x - center_anchor[0]) / scale_factor
                        feat[off + h*3+1] = (lm.y - center_anchor[1]) / scale_factor
                        feat[off + h*3+2] = (lm.z - center_anchor[2]) / scale_factor

            if has_hand:
                frame_history.append(feat)
                if len(frame_history) > 30:
                    frame_history.pop(0)
            else:
                # Clear history when no hand
                frame_history.clear()

            if len(frame_history) >= 3:
                # NN Resample
                inp_nn = np.expand_dims(nn_resample(frame_history, 30), axis=0)
                interpreter.set_tensor(input_details[0]['index'], inp_nn)
                interpreter.invoke()
                out_nn = interpreter.get_tensor(output_details[0]['index'])[0]
                top_nn = sorted(enumerate(out_nn), key=lambda x: x[1], reverse=True)

                # Linear Interpolation Resample
                inp_lerp = np.expand_dims(lerp_resample(frame_history, 30), axis=0)
                interpreter.set_tensor(input_details[0]['index'], inp_lerp)
                interpreter.invoke()
                out_lerp = interpreter.get_tensor(output_details[0]['index'])[0]
                top_lerp = sorted(enumerate(out_lerp), key=lambda x: x[1], reverse=True)

                nn_gloss = TARGET_GLOSSES[top_nn[0][0]]
                nn_prob = top_nn[0][1] * 100
                lerp_gloss = TARGET_GLOSSES[top_lerp[0][0]]
                lerp_prob = top_lerp[0][1] * 100

                if has_hand:
                    print(f"[{t_sec:5.2f}s | Frame {frame_idx:4d} | Hist={len(frame_history):2d}] NN: {nn_gloss:<12s} ({nn_prob:4.1f}%) | Lerp: {lerp_gloss:<12s} ({lerp_prob:4.1f}%)")

        frame_idx += 1

    cap.release()
    pose_landmarker.close()
    hand_landmarker.close()

if __name__ == "__main__":
    test_temporal_impact()
