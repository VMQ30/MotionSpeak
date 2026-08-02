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

            val predictedGloss = glosses[maxIndex]
            val confidencePercent = (maxProb * 100).toInt()

            val resultMap: WritableMap = Arguments.createMap()
            resultMap.putString("gloss", predictedGloss)
            resultMap.putInt("confidence", confidencePercent)
            resultMap.putDouble("rawConfidence", maxProb.toDouble())
            resultMap.putInt("classIndex", maxIndex)
            resultMap.putString("status", "success")

            promise.resolve(resultMap)
        } catch (e: Exception) {
            promise.reject("PREDICTION_ERROR", e.message, e)
        }
    }
}
