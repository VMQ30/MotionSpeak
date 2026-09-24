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
    private var noHandFrameCount = 0

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

    private fun loadAssetByteBuffer(assetName: String): java.nio.ByteBuffer {
        val inputStream = reactContext.assets.open(assetName)
        val bytes = inputStream.readBytes()
        inputStream.close()
        val buffer = java.nio.ByteBuffer.allocateDirect(bytes.size)
        buffer.order(java.nio.ByteOrder.nativeOrder())
        buffer.put(bytes)
        buffer.rewind()
        return buffer
    }

    private fun getOrInitInterpreter(): Interpreter? {
        synchronized(this) {
            if (interpreter == null) {
                try {
                    val modelBuffer = loadAssetByteBuffer("motion_speak_model.tflite")
                    interpreter = Interpreter(modelBuffer)
                    val inputTensor = interpreter!!.getInputTensor(0)
                    val outputTensor = interpreter!!.getOutputTensor(0)
                    Log.d("MotionSpeakAI", "TFLite Interpreter initialized successfully.")
                    Log.d("MotionSpeakAI", "Model Input 0: Shape=${inputTensor.shape().contentToString()}, Type=${inputTensor.dataType()}, Bytes=${inputTensor.numBytes()}")
                    Log.d("MotionSpeakAI", "Model Output 0: Shape=${outputTensor.shape().contentToString()}, Type=${outputTensor.dataType()}, Bytes=${outputTensor.numBytes()}")
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

            val bw = bitmap.width
            val bh = bitmap.height
            val squareBitmap = if (bw != bh) {
                val maxDim = Math.max(bw, bh)
                val padded = Bitmap.createBitmap(maxDim, maxDim, Bitmap.Config.ARGB_8888)
                val canvas = android.graphics.Canvas(padded)
                canvas.drawColor(android.graphics.Color.BLACK)
                val left = (maxDim - bw) / 2.0f
                val top = (maxDim - bh) / 2.0f
                canvas.drawBitmap(bitmap, left, top, null)
                padded
            } else {
                bitmap
            }

            val mpImage = BitmapImageBuilder(squareBitmap).build()
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

                // Validate that detected pose shoulders are realistically placed inside frame
                if (shoulderDist >= 0.05f && shoulderDist <= 0.70f && candX >= 0.05f && candX <= 0.95f && candY >= 0.05f && candY <= 0.95f) {
                    centerAnchorX = candX
                    centerAnchorY = candY
                    centerAnchorZ = candZ
                    scaleFactor = Math.max(shoulderDist, 0.15f)
                    isPoseValid = true

                    for (p in 0 until Math.min(33, poseList.size)) {
                        val lm = poseList[p]
                        frameFeatures[p * 3] = (lm.x() - centerAnchorX) / scaleFactor
                        frameFeatures[p * 3 + 1] = (lm.y() - centerAnchorY) / scaleFactor
                        frameFeatures[p * 3 + 2] = (lm.z() - centerAnchorZ) / scaleFactor
                    }
                }
            }

            // 2. Process Hand Landmarks (indices 99..161 for Left, 162..224 for Right)
            if (handLandmarks != null && handLandmarks.isNotEmpty() && handedness != null && handedness.isNotEmpty()) {
                isHandDetected = true

                for (idx in 0 until Math.min(handLandmarks.size, handedness.size)) {
                    val rawCategory = handedness[idx][0].categoryName()
                    val handList = handLandmarks[idx]

                    // Canonical placement matching MediaPipe physical category directly:
                    // Left hand -> offset 99 (lh slot), Right hand -> offset 162 (rh slot)
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
                noHandFrameCount++
                if (noHandFrameCount > 15) {
                    clearFrameHistory()
                }
                resultMap.putBoolean("isHandDetected", false)
                resultMap.putBoolean("isGestureRecognized", false)
                resultMap.putString("status", "no_hand")
                resultMap.putString("gloss", "")
                resultMap.putInt("confidence", 0)
                resultMap.putDouble("rawConfidence", 0.0)
                resultMap.putString("fingerTrackingSummary", "No hand landmarks detected by MediaPipe")
                promise.resolve(resultMap)
                return
            } else {
                noHandFrameCount = 0
                addFrameToHistory(frameFeatures)
            }

            val frameCount = frameHistory.size
            val poseNz = (0 until 99).count { Math.abs(frameFeatures[it]) > 0.0001f }
            val lhNz = (99 until 162).count { Math.abs(frameFeatures[it]) > 0.0001f }
            val rhNz = (162 until 225).count { Math.abs(frameFeatures[it]) > 0.0001f }

            val fingerSummary = "History=$frameCount/30 | NZ: P=$poseNz, LH=$lhNz, RH=$rhNz | Anchor=(${String.format("%.2f", centerAnchorX)}, ${String.format("%.2f", centerAnchorY)})"

            Log.d("MotionSpeakAI", "========== MOTIONSPEAK LIVE TRUTH LOG ==========")
            Log.d("MotionSpeakAI", "Frame Dimensions : ${bw}x${bh} -> Square ${squareBitmap.width}x${squareBitmap.height}")
            Log.d("MotionSpeakAI", "Pose Detected    : $isPoseValid (Shoulder Anchor: $centerAnchorX, $centerAnchorY, Scale: $scaleFactor)")
            Log.d("MotionSpeakAI", "Hand Detected    : $isHandDetected")
            Log.d("MotionSpeakAI", "Handedness Raw   : ${handedness?.map { it[0].categoryName() + ":" + String.format("%.2f", it[0].score()) }}")
            Log.d("MotionSpeakAI", "Feature Vector   : PoseNZ=$poseNz, LH_NZ=$lhNz, RH_NZ=$rhNz (Total=${poseNz + lhNz + rhNz})")
            Log.d("MotionSpeakAI", "Frame History    : Size=${frameCount}/30")

            val tflite = getOrInitInterpreter()
            if (tflite == null) {
                Log.d("MotionSpeakAI", "Inference State  : NOT EXECUTED (TFLite Interpreter is null)")
                resultMap.putBoolean("isHandDetected", isHandDetected)
                resultMap.putBoolean("isGestureRecognized", false)
                resultMap.putString("status", "tflite_error")
                resultMap.putString("gloss", "Interpreter Error")
                resultMap.putString("errorMessage", "TFLite Interpreter failed to initialize")
                resultMap.putInt("confidence", 0)
                resultMap.putDouble("rawConfidence", 0.0)
                resultMap.putString("fingerTrackingSummary", fingerSummary)
                promise.resolve(resultMap)
                return
            }

            if (frameCount < 3) {
                Log.d("MotionSpeakAI", "Inference State  : NOT EXECUTED (History count < 3)")
                resultMap.putBoolean("isHandDetected", isHandDetected)
                resultMap.putBoolean("isGestureRecognized", false)
                resultMap.putString("status", "scanning")
                resultMap.putString("gloss", "Scanning...")
                resultMap.putInt("confidence", 0)
                resultMap.putDouble("rawConfidence", 0.0)
                resultMap.putString("fingerTrackingSummary", fingerSummary)
                promise.resolve(resultMap)
                return
            }

            Log.d("MotionSpeakAI", "[AI-1] Input construction START")
            val input = buildHistoryInputTensor()
            Log.d("MotionSpeakAI", "[AI-2] Input construction SUCCESS: Shape=[1, 30, 225], TotalElements=6750")

            Log.d("MotionSpeakAI", "[AI-3] Output allocation START")
            val output = Array(1) { FloatArray(glosses.size) }
            Log.d("MotionSpeakAI", "[AI-4] Output allocation SUCCESS: Shape=[1, 15]")

            try {
                Log.d("MotionSpeakAI", "[AI-5] TFLITE RUN START")
                synchronized(this) {
                    tflite.run(input, output)
                }
                Log.d("MotionSpeakAI", "[AI-6] TFLITE RUN SUCCESS")

                Log.d("MotionSpeakAI", "[AI-7] Output parsing START")
                val indexedProbs = output[0].indices.map { Pair(it, output[0][it]) }.sortedByDescending { it.second }
                val top1 = indexedProbs[0]
                val top2 = if (indexedProbs.size > 1) indexedProbs[1] else Pair(0, 0f)
                val top3 = if (indexedProbs.size > 2) indexedProbs[2] else Pair(0, 0f)

                val rawOutputsLog = output[0].indices.joinToString(", ") { "${glosses[it]}:${String.format("%.3f", output[0][it])}" }
                val topPredLog = "Top 3: 1.${glosses[top1.first]} (${(top1.second * 100).toInt()}%), 2.${glosses[top2.first]} (${(top2.second * 100).toInt()}%), 3.${glosses[top3.first]} (${(top3.second * 100).toInt()}%)"
                
                val maxIndex = top1.first
                val maxProb = top1.second
                val confidencePercent = (maxProb * 100).toInt()
                val predictedGloss = glosses[maxIndex]

                Log.d("MotionSpeakAI", "RAW MODEL OUTPUT TENSOR: [$rawOutputsLog]")
                Log.d("MotionSpeakAI", "PREDICTION DECISION    : Top1 Gloss='$predictedGloss' ($confidencePercent%)")
                Log.d("MotionSpeakAI", "[AI-8] Output parsing SUCCESS")
                Log.d("MotionSpeakAI", "==================================================")

                resultMap.putBoolean("isHandDetected", true)
                resultMap.putBoolean("isGestureRecognized", true)
                resultMap.putString("status", "success")
                resultMap.putString("gloss", predictedGloss)
                resultMap.putInt("confidence", confidencePercent)
                resultMap.putDouble("rawConfidence", maxProb.toDouble())
                resultMap.putInt("classIndex", maxIndex)
                resultMap.putString("fingerTrackingSummary", fingerSummary)
                resultMap.putString("topPredictions", topPredLog)
                resultMap.putString("rawOutputs", rawOutputsLog)

                promise.resolve(resultMap)
            } catch (tfliteError: Throwable) {
                val errClass = tfliteError.javaClass.name
                val errMsg = tfliteError.message ?: "Unknown TFLite error"
                val stackTrace = Log.getStackTraceString(tfliteError)

                Log.e("MotionSpeakAI", "========== TFLITE RUN EXCEPTION ==========")
                Log.e("MotionSpeakAI", "Exception Class : $errClass")
                Log.e("MotionSpeakAI", "Exception Msg   : $errMsg")
                Log.e("MotionSpeakAI", "Stack Trace     :\n$stackTrace")
                Log.e("MotionSpeakAI", "==========================================")

                resultMap.putBoolean("isHandDetected", true)
                resultMap.putBoolean("isGestureRecognized", false)
                resultMap.putString("status", "tflite_error")
                resultMap.putString("gloss", "TFLite Error: $errMsg")
                resultMap.putString("errorClass", errClass)
                resultMap.putString("errorMessage", errMsg)
                resultMap.putString("stackTrace", stackTrace)
                resultMap.putInt("confidence", 0)
                resultMap.putDouble("rawConfidence", 0.0)
                resultMap.putString("fingerTrackingSummary", fingerSummary)
                promise.resolve(resultMap)
            }
        } catch (e: Exception) {
            Log.e("MotionSpeakAI", "predictCameraFrame outer error: ${e.message}", e)
            val resultMap: WritableMap = Arguments.createMap()
            resultMap.putBoolean("isHandDetected", false)
            resultMap.putBoolean("isGestureRecognized", false)
            resultMap.putString("status", "error")
            resultMap.putString("gloss", "Error: ${e.message}")
            resultMap.putString("errorMessage", e.message ?: "Unknown outer error")
            resultMap.putInt("confidence", 0)
            promise.resolve(resultMap)
        }
    }

    @ReactMethod
    fun testKnownGoodTensor(promise: Promise) {
        try {
            val tflite = getOrInitInterpreter()
            if (tflite == null) {
                promise.reject("TFLITE_NULL", "TFLite Interpreter is null")
                return
            }

            val bb = loadAssetByteBuffer("known_good_tensor.bin")
            val input = Array(1) { Array(30) { FloatArray(225) } }
            for (i in 0 until 30) {
                for (j in 0 until 225) {
                    input[0][i][j] = bb.float
                }
            }

            val output = Array(1) { FloatArray(glosses.size) }
            synchronized(this) {
                tflite.run(input, output)
            }

            val indexedProbs = output[0].indices.map { Pair(it, output[0][it]) }.sortedByDescending { it.second }
            val top1 = indexedProbs[0]
            val predictedGloss = glosses[top1.first]
            val confidence = (top1.second * 100).toInt()

            val result: WritableMap = Arguments.createMap()
            result.putBoolean("success", true)
            result.putString("gloss", predictedGloss)
            result.putInt("confidence", confidence)
            result.putDouble("rawConfidence", top1.second.toDouble())
            result.putString("rawOutputs", output[0].indices.joinToString(", ") { "${glosses[it]}:${String.format("%.3f", output[0][it])}" })

            Log.d("MotionSpeakAI", "[KnownGoodTensor Test] Success! Predicted '$predictedGloss' ($confidence%)")
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e("MotionSpeakAI", "[KnownGoodTensor Test] Error: ${e.message}", e)
            promise.reject("KNOWN_GOOD_TEST_ERROR", "${e.javaClass.name}: ${e.message}", e)
        }
    }
}
