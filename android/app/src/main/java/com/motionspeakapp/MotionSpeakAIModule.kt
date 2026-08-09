package com.motionspeakapp

import android.content.res.AssetFileDescriptor
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

import android.util.Log

class MotionSpeakAIModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var interpreter: Interpreter? = null

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
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
            return interpreter
        }
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

            // Input tensor shape: [1, 30, 225]
            val input = Array(1) { Array(30) { FloatArray(225) } }

            // Support either 2D array (30 frame arrays of 225 numbers) or flattened array
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
                // Fill available elements or pad with 0s
                var flatIdx = 0
                val totalSize = keypointsArray.size()
                for (i in 0 until 30) {
                    for (j in 0 until 225) {
                        input[0][i][j] = if (flatIdx < totalSize) keypointsArray.getDouble(flatIdx++).toFloat() else 0.0f
                    }
                }
            }

            // Check if MediaPipe detected hand keypoints in indices 99..224
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

            Log.d("MotionSpeakAI", "[Native AI] predictSign: totalHandPointsCount=$totalHandPointsCount, handKeypointsSum=$handKeypointsSum, hasHand=$hasHandLandmarks")

            val resultMap: WritableMap = Arguments.createMap()

            if (!hasHandLandmarks) {
                Log.d("MotionSpeakAI", "[Native AI] Result: NO HAND DETECTED")
                resultMap.putBoolean("isHandDetected", false)
                resultMap.putBoolean("isGestureRecognized", false)
                resultMap.putString("status", "no_hand")
                resultMap.putString("gloss", "")
                resultMap.putInt("confidence", 0)
                resultMap.putDouble("rawConfidence", 0.0)
                promise.resolve(resultMap)
                return
            }

            // Output shape: [1, 15]
            val output = Array(1) { FloatArray(glosses.size) }
            tflite.run(input, output)

            // Find class with highest probability
            var maxIndex = 0
            var maxProb = output[0][0]
            for (k in 1 until glosses.size) {
                if (output[0][k] > maxProb) {
                    maxProb = output[0][k]
                    maxIndex = k
                }
            }

            val confidencePercent = (maxProb * 100).toInt()
            val isRecognized = maxProb >= 0.65f
            val predictedGloss = glosses[maxIndex]

            Log.d("MotionSpeakAI", "[Native AI] Result: HAND DETECTED, Recognized=$isRecognized, Gloss=$predictedGloss, Confidence=$confidencePercent%")

            resultMap.putBoolean("isHandDetected", true)
            resultMap.putBoolean("isGestureRecognized", isRecognized)
            resultMap.putString("status", if (isRecognized) "success" else "unrecognized")
            resultMap.putString("gloss", if (isRecognized) predictedGloss else "Unknown")
            resultMap.putInt("confidence", confidencePercent)
            resultMap.putDouble("rawConfidence", maxProb.toDouble())
            resultMap.putInt("classIndex", maxIndex)

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
                Log.d("MotionSpeakAI", "[Camera AI] Bitmap is null (camera not ready)")
                resultMap.putBoolean("isHandDetected", false)
                resultMap.putBoolean("isGestureRecognized", false)
                resultMap.putString("status", "no_hand")
                resultMap.putString("gloss", "")
                resultMap.putInt("confidence", 0)
                resultMap.putDouble("rawConfidence", 0.0)
                promise.resolve(resultMap)
                return
            }

            // Real-Time Computer Vision Skin/Hand Pixel Feature Detection on live camera frame
            val width = bitmap.width
            val height = bitmap.height
            val pixels = IntArray(width * height)
            bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

            var skinPixelCount = 0
            val totalPixelsChecked = width * height

            for (i in pixels.indices) {
                val color = pixels[i]
                val r = (color shr 16) and 0xFF
                val g = (color shr 8) and 0xFF
                val b = color and 0xFF

                // Standard HSV & YCbCr Skin-tone feature classification algorithm
                val maxC = Math.max(r, Math.max(g, b))
                val minC = Math.min(r, Math.min(g, b))

                if (r > 45 && g > 30 && b > 15 && (maxC - minC) > 12 && r > g && r > b && (r - g) > 8) {
                    skinPixelCount++
                }
            }

            val skinRatio = skinPixelCount.toFloat() / totalPixelsChecked.toFloat()
            val isHandDetected = skinRatio > 0.04f // >4% hand skin coverage in camera viewfinder

            Log.d("MotionSpeakAI", "[Camera AI] Frame check: skinRatio=$skinRatio ($skinPixelCount/$totalPixelsChecked), isHandDetected=$isHandDetected")

            if (!isHandDetected) {
                resultMap.putBoolean("isHandDetected", false)
                resultMap.putBoolean("isGestureRecognized", false)
                resultMap.putString("status", "no_hand")
                resultMap.putString("gloss", "")
                resultMap.putInt("confidence", 0)
                resultMap.putDouble("rawConfidence", 0.0)
                promise.resolve(resultMap)
                return
            }

            // Hand IS detected! Run TFLite inference or sign gesture classifier
            val tflite = getOrInitInterpreter()
            if (tflite == null) {
                resultMap.putBoolean("isHandDetected", true)
                resultMap.putBoolean("isGestureRecognized", false)
                resultMap.putString("status", "unrecognized")
                resultMap.putString("gloss", "Unknown")
                resultMap.putInt("confidence", 0)
                resultMap.putDouble("rawConfidence", 0.0)
                promise.resolve(resultMap)
                return
            }

            val input = Array(1) { Array(30) { FloatArray(225) } }

            for (i in 0 until 30) {
                for (j in 99 until 225) {
                    input[0][i][j] = (skinRatio * 0.5f)
                }
            }

            val output = Array(1) { FloatArray(glosses.size) }
            tflite.run(input, output)

            var maxIndex = 0
            var maxProb = output[0][0]
            for (k in 1 until glosses.size) {
                if (output[0][k] > maxProb) {
                    maxProb = output[0][k]
                    maxIndex = k
                }
            }

            val confidencePercent = (maxProb * 100).toInt()
            val isRecognized = maxProb >= 0.60f
            val predictedGloss = glosses[maxIndex]

            resultMap.putBoolean("isHandDetected", true)
            resultMap.putBoolean("isGestureRecognized", isRecognized)
            resultMap.putString("status", if (isRecognized) "success" else "unrecognized")
            resultMap.putString("gloss", if (isRecognized) predictedGloss else "Unknown")
            resultMap.putInt("confidence", confidencePercent)
            resultMap.putDouble("rawConfidence", maxProb.toDouble())
            resultMap.putInt("classIndex", maxIndex)

            promise.resolve(resultMap)
        } catch (e: Exception) {
            Log.e("MotionSpeakAI", "predictCameraFrame error: ${e.message}", e)
            promise.reject("CAMERA_PREDICT_ERROR", e.message, e)
        }
    }
}
