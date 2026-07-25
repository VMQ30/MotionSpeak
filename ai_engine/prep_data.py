import json
import os

with open("dataset//WLASL_v0.3.json", "r") as f:
    wlasl_data = json.load(f)

TARGET = [
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

filtered_data = []

for entry in wlasl_data:
    gloss = entry["gloss"]
    if gloss in TARGET:
        for instance in entry["instances"]:
            video_id = instance["video_id"]
            video_path = f"dataset/videos/{video_id}.mp4"
            if os.path.exists(video_path):
                filtered_data.append((video_path, TARGET.index(gloss)))

with open("filtered_dataset.json", "w") as f:
    json.dump(filtered_data, f)

print(f"Extracted {len(filtered_data)} valid video clips across {len(TARGET)} classes.")
