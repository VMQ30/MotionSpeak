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

def main():
    tflite_path = "motion_speak_model.tflite"
    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

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

    def test_video(video_path, expected_gloss, is_front=True):
        if not os.path.exists(video_path): return None
        cap = cv2.VideoCapture(video_path)
        history = []
        tot = 0
        h_cnt = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break
            tot += 1

            fh, fw = frame.shape[:2]
            max_dim = max(fh, fw)
            pad_w = (max_dim - fw) // 2
            pad_h = (max_dim - fh) // 2
            sq = cv2.copyMakeBorder(frame, pad_h, pad_h, pad_w, pad_w, cv2.BORDER_CONSTANT, value=[0, 0, 0])

            rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            p_res = pose_landmarker.detect(mp_img)
            h_res = hand_landmarker.detect(mp_img)

            feat = np.zeros(225, dtype=np.float32)
            has_p = bool(p_res.pose_landmarks and len(p_res.pose_landmarks) > 0)
            has_h = bool(h_res.hand_landmarks and len(h_res.hand_landmarks) > 0)

            if has_h: h_cnt += 1

            anchor = [0.5, 0.5, 0.0]
            scale = 1.0
            p_valid = False

            if has_p and len(p_res.pose_landmarks[0]) > 12:
                p_list = p_res.pose_landmarks[0]
                l_sh, r_sh = p_list[11], p_list[12]
                cx, cy, cz = (l_sh.x + r_sh.x)/2.0, (l_sh.y + r_sh.y)/2.0, (l_sh.z + r_sh.z)/2.0
                dist = np.sqrt((l_sh.x-r_sh.x)**2 + (l_sh.y-r_sh.y)**2 + (l_sh.z-r_sh.z)**2)
                if 0.05 <= dist <= 0.70 and 0.05 <= cx <= 0.95 and 0.05 <= cy <= 0.95:
                    anchor = [cx, cy, cz]
                    scale = max(dist, 0.15)
                    p_valid = True
                    for p in range(min(33, len(p_list))):
                        lm = p_list[p]
                        feat[p*3] = (lm.x - anchor[0])/scale
                        feat[p*3+1] = (lm.y - anchor[1])/scale
                        feat[p*3+2] = (lm.z - anchor[2])/scale

            if has_h and h_res.handedness:
                for idx in range(min(len(h_res.hand_landmarks), len(h_res.handedness))):
                    raw_cat = h_res.handedness[idx][0].category_name
                    h_list = h_res.hand_landmarks[idx]
                    if not p_valid and idx == 0:
                        w = h_list[0]
                        m = h_list[9] if len(h_list) > 9 else w
                        hd = np.sqrt((w.x-m.x)**2 + (w.y-m.y)**2 + (w.z-m.z)**2)
                        anchor = [w.x, w.y + 0.15, w.z]
                        scale = max(hd * 2.2, 0.25)

                    eff_cat = ("Right" if raw_cat.lower() == "left" else "Left") if is_front else raw_cat
                    off = 99 if eff_cat.lower() == "left" else 162
                    for h in range(min(21, len(h_list))):
                        lm = h_list[h]
                        feat[off + h*3] = (lm.x - anchor[0])/scale
                        feat[off + h*3+1] = (lm.y - anchor[1])/scale
                        feat[off + h*3+2] = (lm.z - anchor[2])/scale

            if has_h:
                history.append(feat)
                if len(history) > 30: history.pop(0)

        cap.release()

        if len(history) < 6:
            return {"expected": expected_gloss, "pred": "No Hand", "conf": 0.0, "match": False, "index": -1, "top3": []}

        input_tensor = np.zeros((1, 30, 225), dtype=np.float32)
        cnt = len(history)
        for i in range(30):
            s_idx = (i * cnt) // 30
            input_tensor[0, i] = history[min(s_idx, cnt - 1)]

        interpreter.set_tensor(input_details[0]['index'], input_tensor)
        interpreter.invoke()
        out = interpreter.get_tensor(output_details[0]['index'])[0]

        top_idx = np.argmax(out)
        top_prob = float(out[top_idx] * 100)
        pred_gloss = TARGET_GLOSSES[top_idx]
        is_match = (pred_gloss.lower() == expected_gloss.lower())

        return {
            "expected": expected_gloss,
            "pred": pred_gloss,
            "conf": top_prob,
            "match": is_match,
            "index": int(top_idx),
            "top3": [(TARGET_GLOSSES[i], float(out[i]*100)) for i in np.argsort(out)[::-1][:3]]
        }

    print("=" * 80)
    print("END-TO-END KNOWN-LABEL VERIFICATION TEST ACROSS ALL DATASET CLASSES")
    print("=" * 80)

    # Test root sample.mp4
    r_sample = test_video("../sample.mp4", "sorry", is_front=True)
    print(f"\nROOT TEST CASE (sample.mp4):")
    print(f"  Expected Ground Truth : 'sorry'")
    print(f"  TFLite Model Output   : Index {r_sample['index']} -> '{r_sample['pred']}' ({r_sample['conf']:.2f}%)")
    print(f"  Match Ground Truth    : {r_sample['match']}")
    print(f"  Top 3 Predictions     : {r_sample['top3']}")

    print("\nDATASET TEST CASES:")
    test_folders = ["Hello", "Yes", "No", "Sorry", "please", "thankyou", "Good"]
    for folder in test_folders:
        fpath = f"dataset/new_videos/{folder}"
        if os.path.exists(fpath):
            files = [f for f in os.listdir(fpath) if f.endswith(".mp4")][:1]
            for fname in files:
                r = test_video(os.path.join(fpath, fname), folder, is_front=False)
                if r:
                    status_str = "MATCH" if r['match'] else "MISMATCH"
                    print(f"  [{status_str:8s}] Expected='{folder:10s}', Model='{r['pred']:10s}' (Idx {r['index']:2d}, {r['conf']:5.1f}%) | Top3={r['top3']}")

    pose_landmarker.close()
    hand_landmarker.close()

if __name__ == "__main__":
    main()
