import os
import glob
import numpy as np

TARGET_GLOSSES = [
    "hello", "yes", "no", "good", "bad", "what", "thank you", "welcome",
    "please", "sorry", "goodbye", "morning", "afternoon", "evening", "excuse"
]

def main():
    print("--- Dataset File Inventory in processed_data ---")
    npy_files = glob.glob("processed_data/*.npy")
    print(f"Total .npy files in processed_data: {len(npy_files)}")

    sorry_files = [f for f in npy_files if "sorry" in f]
    what_files = [f for f in npy_files if "what" in f]

    print(f"Sorry files count: {len(sorry_files)}")
    print(f"What files count:  {len(what_files)}")

    if sorry_files:
        sample_sorry = np.load(sorry_files[0])
        print(f"\nSample sorry file '{sorry_files[0]}' shape: {sample_sorry.shape}")
        # Check hand non-zero stats
        rh_sorry = sample_sorry[:, 162:225]
        lh_sorry = sample_sorry[:, 99:162]
        print(f"  Sorry RH non-zero sum per frame avg: {np.mean(np.abs(rh_sorry)) * 225:.4f}")
        print(f"  Sorry LH non-zero sum per frame avg: {np.mean(np.abs(lh_sorry)) * 225:.4f}")

    if what_files:
        sample_what = np.load(what_files[0])
        print(f"\nSample what file '{what_files[0]}' shape: {sample_what.shape}")
        rh_what = sample_what[:, 162:225]
        lh_what = sample_what[:, 99:162]
        print(f"  What RH non-zero sum per frame avg: {np.mean(np.abs(rh_what)) * 225:.4f}")
        print(f"  What LH non-zero sum per frame avg: {np.mean(np.abs(lh_what)) * 225:.4f}")

if __name__ == "__main__":
    main()
