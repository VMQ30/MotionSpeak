package com.motionspeakapp

import android.content.res.AssetFileDescriptor
import android.graphics.Bitmap
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

class MotionSpeakAIModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var interpreter: Interpreter? = null
    private var poseLandmarker: PoseLandmarker? = null
    private var handLandmarker: HandLandmarker? = null
    private var isMediaPipeInitialized = false

    private val frameHistory = mutableListOf<FloatArray>()
    private val HISTORY_SIZE = 30
    private val FEATURE_SIZE = 225

    private val glosses = listOf(
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
        "excuse"
    )

    override fun getName(): String {
        return "MotionSpeakAI"
    }

    private fun getOrInitInterpreter(): Interpreter? {
        synchronized(this) {
            if (interpreter == null) {
                try {
                    val fileDescriptor: AssetFileDescriptor =
                        reactApplicationContext.assets.openFd("motion_speak_model.tflite")
                    val inputStream = FileInputStream(fileDescriptor.fileDescriptor)
                    val fileChannel = inputStream.channel
                    val startOffset = fileDescriptor.startOffset
                    val declaredLength = fileDescriptor.declaredLength
                    val modelBuffer: MappedByteBuffer =
                        fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)
                    interpreter = Interpreter(modelBuffer)
                    Log.d("MotionSpeakAI", "TFLite Interpreter initialized with motion_speak_model.tflite")
                } catch (e: Exception) {
                    Log.e("MotionSpeakAI", "Failed to initialize TFLite Interpreter: ${e.message}", e)
                }
            }
            return interpreter
        }
    }

    private fun getOrInitMediaPipe() {
        synchronized(this) {
            if (!isMediaPipeInitialized) {
                try {
                    val poseFd = reactContext.assets.openFd("pose_landmarker.task")
                    Log.d("MotionSpeakAI", "pose_landmarker.task asset length: ${poseFd.length}")
                    poseFd.close()

                    val handFd = reactContext.assets.openFd("hand_landmarker.task")
                    Log.d("MotionSpeakAI", "hand_landmarker.task asset length: ${handFd.length}")
                    handFd.close()

                    val poseBaseOptions = BaseOptions.builder().setModelAssetPath("pose_landmarker.task").build()
                    val poseOptions = PoseLandmarker.PoseLandmarkerOptions.builder()
                        .setBaseOptions(poseBaseOptions)
                        .setRunningMode(RunningMode.IMAGE)
                        .build()
                    poseLandmarker = PoseLandmarker.createFromOptions(reactContext, poseOptions)

                    val handBaseOptions = BaseOptions.builder().setModelAssetPath("hand_landmarker.task").build()
                    val handOptions = HandLandmarker.HandLandmarkerOptions.builder()
                        .setBaseOptions(handBaseOptions)
                        .setRunningMode(RunningMode.IMAGE)
                        .setNumHands(2)
                        .build()
                    handLandmarker = HandLandmarker.createFromOptions(reactContext, handOptions)

                    isMediaPipeInitialized = true
                    Log.d("MotionSpeakAI", "MediaPipe Pose & Hand Landmarkers initialized successfully.")
                } catch (e: Exception) {
                    Log.e("MotionSpeakAI", "Failed to initialize MediaPipe Landmarkers: ${e.message}", e)
                }
            }
        }
    }

    private fun addFrameToHistory(features: FloatArray) {
        synchronized(frameHistory) {
            if (frameHistory.size >= HISTORY_SIZE) {
                frameHistory.removeAt(0)
            }
            frameHistory.add(features)
        }
    }

    private fun clearFrameHistory() {
        synchronized(frameHistory) {
            frameHistory.clear()
        }
    }

    private fun buildHistoryInputTensor(): Array<Array<FloatArray>> {
        val input = Array(1) { Array(HISTORY_SIZE) { FloatArray(FEATURE_SIZE) } }
        synchronized(frameHistory) {
            val count = frameHistory.size
            if (count == 0) return input
            for (i in 0 until HISTORY_SIZE) {
                val srcIdx = (i * count) / HISTORY_SIZE
                val features = frameHistory[Math.min(srcIdx, count - 1)]
                System.arraycopy(features, 0, input[0][i], 0, FEATURE_SIZE)
            }
        }
        return input
    }

    @ReactMethod
    fun getModelInfo(promise: Promise) {
        try {
            val tflite = getOrInitInterpreter()
            val result: WritableMap = Arguments.createMap()
            result.putBoolean("isLoaded", tflite != null)
            result.putString("modelName", "motion_speak_model.tflite")
            result.putInt("sequenceLength", 30)
            result.putInt("featureVectorSize", 225)
            result.putInt("numClasses", glosses.size)
            
            val glossesArray = Arguments.createArray()
            for (g in glosses) {
                glossesArray.pushString(g)
            }
            result.putArray("glosses", glossesArray)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("MODEL_INFO_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun predictSign(keypointsArray: ReadableArray, promise: Promise) {
        try {
            val tflite = getOrInitInterpreter()
            if (tflite == null) {
                promise.reject("TFLITE_NOT_LOADED", "Failed to load motion_speak_model.tflite from assets.")
                return
            }

            val input = Array(1) { Array(30) { FloatArray(225) } }

            if (keypointsArray.size() == 30) {
                for (i in 0 until 30) {
                    val frameArray = keypointsArray.getArray(i)
                    val frameSize = frameArray?.size() ?: 0
                    for (j in 0 until 225) {
                        input[0][i][j] = if (j < frameSize && frameArray != null) frameArray.getDouble(j).toFloat() else 0.0f
                    }
                }
            } else if (keypointsArray.size() == 6750) {
                var idx = 0
                for (i in 0 until 30) {
                    for (j in 0 until 225) {
                        input[0][i][j] = keypointsArray.getDouble(idx++).toFloat()
                    }
                }
            } else {
                var flatIdx = 0
                val totalSize = keypointsArray.size()
                for (i in 0 until 30) {
                    for (j in 0 until 225) {
                        input[0][i][j] = if (flatIdx < totalSize) keypointsArray.getDouble(flatIdx++).toFloat() else 0.0f
                    }
                }
            }

            var handKeypointsSum = 0.0f
            var totalHandPointsCount = 0
            for (i in 0 until 30) {
                for (j in 99 until 225) {
                    val v = Math.abs(input[0][i][j])
                    handKeypointsSum += v
                    if (v > 0.0001f) totalHandPointsCount++
                }
            }

            val hasHandLandmarks = totalHandPointsCount > 5 || handKeypointsSum > 0.05f

            val resultMap: WritableMap = Arguments.createMap()

            if (!hasHandLandmarks) {
                resultMap.putBoolean("isHandDetected", false)
                resultMap.putBoolean("isGestureRecognized", false)
                resultMap.putString("status", "no_hand")
                resultMap.putString("gloss", "")
                resultMap.putInt("confidence", 0)
                resultMap.putDouble("rawConfidence", 0.0)
                promise.resolve(resultMap)
                return
            }

            val output = Array(1) { FloatArray(glosses.size) }
            tflite.run(input, output)

            val indexedProbs = output[0].indices.map { Pair(it, output[0][it]) }.sortedByDescending { it.second }
            val top1 = indexedProbs[0]
            val top2 = if (indexedProbs.size > 1) indexedProbs[1] else Pair(0, 0f)
            val top3 = if (indexedProbs.size > 2) indexedProbs[2] else Pair(0, 0f)

            val topPredLog = "Top 3: 1.${glosses[top1.first]} (${(top1.second * 100).toInt()}%), 2.${glosses[top2.first]} (${(top2.second * 100).toInt()}%), 3.${glosses[top3.first]} (${(top3.second * 100).toInt()}%)"
            Log.d("MotionSpeakAI", "[predictSign] $topPredLog")

            val maxIndex = top1.first
            val maxProb = top1.second

            val confidencePercent = (maxProb * 100).toInt()
            val isRecognized = maxProb >= 0.10f
            val predictedGloss = glosses[maxIndex]

            resultMap.putBoolean("isHandDetected", true)
            resultMap.putBoolean("isGestureRecognized", isRecognized)
            resultMap.putString("status", if (isRecognized) "success" else "unrecognized")
            resultMap.putString("gloss", if (isRecognized) predictedGloss else "Unknown")
            resultMap.putInt("confidence", confidencePercent)
            resultMap.putDouble("rawConfidence", maxProb.toDouble())
            resultMap.putInt("classIndex", maxIndex)
            resultMap.putString("topPredictions", topPredLog)

            promise.resolve(resultMap)
        } catch (e: Exception) {
            promise.reject("PREDICTION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun predictCameraFrame(promise: Promise) {
        try {
            val cameraView = MotionSpeakCameraView.activeInstance
            val bitmap = cameraView?.getLatestFrameBitmap()
            val resultMap: WritableMap = Arguments.createMap()

            if (bitmap == null) {
                resultMap.putBoolean("isHandDetected", false)
                resultMap.putBoolean("isGestureRecognized", false)
                resultMap.putString("status", "no_hand")
                resultMap.putString("gloss", "")
                resultMap.putInt("confidence", 0)
                resultMap.putDouble("rawConfidence", 0.0)
                promise.resolve(resultMap)
                return
            }

            getOrInitMediaPipe()

            val mpImage = BitmapImageBuilder(bitmap).build()
            val poseResult = try {
                poseLandmarker?.detect(mpImage)
            } catch (e: Exception) {
                Log.e("MotionSpeakAI", "PoseLandmarker detect error: ${e.message}", e)
                null
            }

            val handResult = try {
                handLandmarker?.detect(mpImage)
            } catch (e: Exception) {
                Log.e("MotionSpeakAI", "HandLandmarker detect error: ${e.message}", e)
                null
            }

            val frameFeatures = FloatArray(225)
            var isHandDetected = false

            val poseLandmarks = poseResult?.landmarks()
            val handLandmarks = handResult?.landmarks()
            val handedness = handResult?.handedness()

            var centerAnchorX = 0.5f
            var centerAnchorY = 0.5f
            var centerAnchorZ = 0.0f
            var scaleFactor = 1.0f

            var isPoseValid = false

            // 1. Process Pose Landmarks (indices 0..98) with validation
            if (poseLandmarks != null && poseLandmarks.isNotEmpty() && poseLandmarks[0].size > 12) {
                val poseList = poseLandmarks[0]
                val leftShoulder = poseList[11]
                val rightShoulder = poseList[12]

                val candX = (leftShoulder.x() + rightShoulder.x()) / 2.0f
                val candY = (leftShoulder.y() + rightShoulder.y()) / 2.0f
                val candZ = (leftShoulder.z() + rightShoulder.z()) / 2.0f

                val dx = leftShoulder.x() - rightShoulder.x()
                val dy = leftShoulder.y() - rightShoulder.y()
                val dz = leftShoulder.z() - rightShoulder.z()
                val shoulderDist = Math.sqrt((dx * dx + dy * dy + dz * dz).toDouble()).toFloat()

                // Validate that detected pose shoulders are realistically placed inside frame (not noise artifacts at edges)
                if (shoulderDist >= 0.10f && shoulderDist <= 0.70f && candX >= 0.15f && candX <= 0.85f && candY >= 0.15f && candY <= 0.85f) {
                    centerAnchorX = candX
                    centerAnchorY = candY
                    centerAnchorZ = candZ
                    scaleFactor = Math.max(shoulderDist, 0.18f)
                    isPoseValid = true

                    for (p in 0 until Math.min(33, poseList.size)) {
                        val lm = poseList[p]
                        frameFeatures[p * 3] = (lm.x() - centerAnchorX) / scaleFactor
                        frameFeatures[p * 3 + 1] = (lm.y() - centerAnchorY) / scaleFactor
                        frameFeatures[p * 3 + 2] = (lm.z() - centerAnchorZ) / scaleFactor
                    }
                }
            }

            // 2. Process Hand Landmarks (indices 99..161 for Left, 162..224 for Right) with position-invariant hand-centric fallback
            if (handLandmarks != null && handLandmarks.isNotEmpty() && handedness != null && handedness.isNotEmpty()) {
                isHandDetected = true

                for (idx in 0 until Math.min(handLandmarks.size, handedness.size)) {
                    val rawCategory = handedness[idx][0].categoryName()
                    val handList = handLandmarks[idx]

                    // Position-invariant fallback: if pose is missing/invalid or hand is positioned freely in frame, anchor around wrist
                    if (!isPoseValid && idx == 0) {
                        val wrist = handList[0]
                        val middleMcp = if (handList.size > 9) handList[9] else wrist
                        val hdx = wrist.x() - middleMcp.x()
                        val hdy = wrist.y() - middleMcp.y()
                        val hdz = wrist.z() - middleMcp.z()
                        val handLength = Math.sqrt((hdx * hdx + hdy * hdy + hdz * hdz).toDouble()).toFloat()

                        centerAnchorX = wrist.x()
                        centerAnchorY = wrist.y() + 0.15f
                        centerAnchorZ = wrist.z()
                        scaleFactor = Math.max(handLength * 2.2f, 0.25f)
                    }

                    // Match handedness category directly: Left hand -> offset 99 (lh), Right hand -> offset 162 (rh)
                    val offset = if (rawCategory.equals("Left", ignoreCase = true)) 99 else 162

                    for (h in 0 until Math.min(21, handList.size)) {
                        val lm = handList[h]
                        frameFeatures[offset + h * 3] = (lm.x() - centerAnchorX) / scaleFactor
                        frameFeatures[offset + h * 3 + 1] = (lm.y() - centerAnchorY) / scaleFactor
                        frameFeatures[offset + h * 3 + 2] = (lm.z() - centerAnchorZ) / scaleFactor
                    }
                }
            }

            if (!isHandDetected) {
                clearFrameHistory()
                resultMap.putBoolean("isHandDetected", false)
                resultMap.putBoolean("isGestureRecognized", false)
                resultMap.putString("status", "no_hand")
                resultMap.putString("gloss", "")
                resultMap.putInt("confidence", 0)
                resultMap.putDouble("rawConfidence", 0.0)
                resultMap.putString("fingerTrackingSummary", "No hand landmarks detected by MediaPipe")
                promise.resolve(resultMap)
                return
            }

            addFrameToHistory(frameFeatures)

            // Extract active non-zero finger tip landmark coordinates for tracking logs
            val activeOffset = if (Math.abs(frameFeatures[162]) > 0.0001f) 162 else 99
            val thumbX = String.format("%.2f", frameFeatures[activeOffset + 12])
            val thumbY = String.format("%.2f", frameFeatures[activeOffset + 13])
            val indexX = String.format("%.2f", frameFeatures[activeOffset + 24])
            val indexY = String.format("%.2f", frameFeatures[activeOffset + 25])
            val middleX = String.format("%.2f", frameFeatures[activeOffset + 36])
            val middleY = String.format("%.2f", frameFeatures[activeOffset + 37])
            val ringX = String.format("%.2f", frameFeatures[activeOffset + 48])
            val ringY = String.format("%.2f", frameFeatures[activeOffset + 49])
            val pinkyX = String.format("%.2f", frameFeatures[activeOffset + 60])
            val pinkyY = String.format("%.2f", frameFeatures[activeOffset + 61])

            val fingerSummary = "Anchor=(${String.format("%.2f", centerAnchorX)}, ${String.format("%.2f", centerAnchorY)}) | Hand Tips: Thumb($thumbX, $thumbY) Index($indexX, $indexY) Mid($middleX, $middleY) Ring($ringX, $ringY) Pinky($pinkyX, $pinkyY)"
            Log.d("MotionSpeakAI", "[Finger Tracking] $fingerSummary")

            val tflite = getOrInitInterpreter()
            if (tflite == null) {
                resultMap.putBoolean("isHandDetected", true)
                resultMap.putBoolean("isGestureRecognized", false)
                resultMap.putString("status", "unrecognized")
                resultMap.putString("gloss", "Unknown")
                resultMap.putInt("confidence", 0)
                resultMap.putDouble("rawConfidence", 0.0)
                resultMap.putString("fingerTrackingSummary", fingerSummary)
                promise.resolve(resultMap)
                return
            }

            val input = buildHistoryInputTensor()
            val output = Array(1) { FloatArray(glosses.size) }
            tflite.run(input, output)

            val indexedProbs = output[0].indices.map { Pair(it, output[0][it]) }.sortedByDescending { it.second }
            val top1 = indexedProbs[0]
            val top2 = if (indexedProbs.size > 1) indexedProbs[1] else Pair(0, 0f)
            val top3 = if (indexedProbs.size > 2) indexedProbs[2] else Pair(0, 0f)

            val topPredLog = "Top 3: 1.${glosses[top1.first]} (${(top1.second * 100).toInt()}%), 2.${glosses[top2.first]} (${(top2.second * 100).toInt()}%), 3.${glosses[top3.first]} (${(top3.second * 100).toInt()}%)"
            Log.d("MotionSpeakAI", "[Camera Prediction] $topPredLog")

            val maxIndex = top1.first
            val maxProb = top1.second

            val confidencePercent = (maxProb * 100).toInt()
            val isRecognized = maxProb >= 0.10f
            val predictedGloss = glosses[maxIndex]

            resultMap.putBoolean("isHandDetected", true)
            resultMap.putBoolean("isGestureRecognized", isRecognized)
            resultMap.putString("status", if (isRecognized) "success" else "unrecognized")
            resultMap.putString("gloss", if (isRecognized) predictedGloss else "Unknown")
            resultMap.putInt("confidence", confidencePercent)
            resultMap.putDouble("rawConfidence", maxProb.toDouble())
            resultMap.putInt("classIndex", maxIndex)
            resultMap.putString("fingerTrackingSummary", fingerSummary)
            resultMap.putString("topPredictions", topPredLog)

            promise.resolve(resultMap)
        } catch (e: Exception) {
            Log.e("MotionSpeakAI", "predictCameraFrame error: ${e.message}", e)
            promise.reject("CAMERA_PREDICT_ERROR", e.message, e)
        }
    }
}
