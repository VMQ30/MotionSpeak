# MotionSpeak

MotionSpeak is a React Native Android app that recognizes a small set of sign-language gestures and turns recognized signs into text. It uses the device camera, MediaPipe pose and hand landmarks, and a bundled TensorFlow Lite model.

## Current capabilities

- Live camera-based gesture recognition on Android.
- Recognition of 15 glosses: `hello`, `yes`, `no`, `good`, `bad`, `what`, `thank you`, `welcome`, `please`, `sorry`, `goodbye`, `morning`, `afternoon`, `evening`, and `excuse`.
- 30-frame gesture history with 225 normalized features per frame.
- Native TensorFlow Lite inference through the `MotionSpeakAI` module.
- MediaPipe pose and hand landmark extraction for up to two hands.
- Automatic addition of recognized glosses to the message board.
- Optional text-to-speech playback with English and Tagalog language settings.
- Dark mode, font-size, vibration, speech-speed, and speech-volume preferences persisted with AsyncStorage.
- Front and rear camera selection, portrait and landscape layouts, and tablet layout handling.
- First-launch tips and tutorial screens.

## App flow

The app opens on the splash screen, then navigates to the tips flow. The user can continue through the tutorial or open the home screen. From Home, the camera can be enabled after runtime camera permission is granted.

When the camera is active, the native module:

1. Captures the latest camera frame.
2. Detects pose and hand landmarks with MediaPipe.
3. Normalizes the landmarks into a 225-value feature vector.
4. Accumulates a 30-frame sequence.
5. Runs `motion_speak_model.tflite` with TensorFlow Lite.
6. Adds a recognized gloss to the message board when confidence and prediction-margin thresholds pass.

The model currently requires at least 60% confidence and a top-1/top-2 probability margin of at least 25%. Background predictions and uncertain gestures are not added to the message board.

## Requirements

- Node.js 20 or newer.
- Android Studio with an Android SDK and emulator, or a physical Android device.
- Android SDK 36 and a device/emulator meeting the app's minimum SDK of 24.
- JDK, Android SDK, and environment variables configured according to the [React Native environment setup guide](https://reactnative.dev/docs/set-up-your-environment).
- A connected Android device or running emulator for camera testing.

The native camera and AI implementation is Android-specific. The repository contains an `ios` script from the React Native template, but the native `MotionSpeakAI` module and camera view are only implemented for Android.

## Installation

Install JavaScript dependencies from the project root:

```sh
npm install
```

The Android app expects these inference assets in `android/app/src/main/assets/`:

- `motion_speak_model.tflite`
- `pose_landmarker.task`
- `hand_landmarker.task`

## Run the app

Start Metro in one terminal:

```sh
npm start
```

In a second terminal, build and install the Android app:

```sh
npm run android
```

Grant camera permission when prompted. A physical device is recommended for testing real-time camera recognition.

## Development commands

```sh
npm test       # Run Jest tests
npm run lint   # Run ESLint
```

The Python files in `ai_engine/` are offline analysis and validation utilities for the landmark pipeline and model. They are not part of the React Native runtime. Running them requires the Python dependencies used by those scripts, including TensorFlow, MediaPipe, OpenCV, and NumPy.

## Native architecture

- `App.tsx` provides navigation, language, font-size, and safe-area contexts.
- `src/navigation/StackNavigator.tsx` defines Splash, Tips, Tutorial, and Home routes.
- `src/screens/HomepageScreen.tsx` controls camera state, message-board updates, text-to-speech, and preferences.
- `src/services/aiService.ts` calls the native AI module and exposes model information and prediction results to JavaScript.
- `MotionSpeakAIModule.kt` performs MediaPipe preprocessing and TensorFlow Lite inference.
- `MotionSpeakCameraView.kt` and `MotionSpeakCameraViewManager.kt` provide the native camera view.

## Troubleshooting

- **Camera view is unavailable:** rebuild and reinstall the Android app with `npm run android`; the JavaScript fallback view is shown when the native view is not present in the installed binary.
- **No predictions appear:** confirm camera permission is granted, keep the hands in the signing area, and allow enough frames for the 30-frame history to fill.
- **Model loading fails:** verify that all three `.tflite` and `.task` assets are present in `android/app/src/main/assets/` and rebuild the app.
- **Metro or Gradle state is stale:** stop Metro, rebuild the Android app, and reload the application.
