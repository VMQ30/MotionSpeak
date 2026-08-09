package com.motionspeakapp

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

class MotionSpeakModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var interpreter: Interpreter? = null

    init {
        try {
            // Load motion_speak_model.tflite from assets
            val fileDescriptor = reactContext.assets.openFd("motion_speak_model.tflite")
            val inputStream = FileInputStream(fileDescriptor.fileDescriptor)
            val fileChannel = inputStream.channel
            val startOffset = fileDescriptor.startOffset
            val declaredLength = fileDescriptor.declaredLength
            val modelBuffer: MappedByteBuffer = fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)

            interpreter = Interpreter(modelBuffer)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun getName(): String = "MotionSpeakModule"

    @ReactMethod
    fun predictSign(landmarkData: ReadableArray, promise: Promise) {
        try {
            if (interpreter == null) {
                promise.reject("MODEL_ERROR", "TFLite Interpreter is not initialized.")
                return
            }

            var landmarkSum = 0.0f
            val input = FloatArray(landmarkData.size())
            for (i in 0 until landmarkData.size()) {
                val v = landmarkData.getDouble(i).toFloat()
                input[i] = v
                landmarkSum += Math.abs(v)
            }

            // If input landmark data is empty or sum is near 0, no hand is detected
            if (landmarkData.size() == 0 || landmarkSum < 0.05f) {
                val params = Arguments.createMap().apply {
                    putString("label", "Unknown")
                    putDouble("confidence", 0.0)
                    putBoolean("isHandDetected", false)
                }
                promise.resolve("Unknown")
                return
            }

            // Output buffer matching 15 model labels/classes
            val labels = arrayOf(
                "hello", "yes", "no", "good", "bad",
                "what", "thank you", "welcome", "please", "sorry",
                "goodbye", "morning", "afternoon", "evening", "excuse"
            )
            val output = Array(1) { FloatArray(labels.size) }
            interpreter?.run(arrayOf(input), output)

            var maxIndex = -1
            var maxProb = 0.0f
            for (i in output[0].indices) {
                if (output[0][i] > maxProb) {
                    maxProb = output[0][i]
                    maxIndex = i
                }
            }

            val isRecognized = maxProb >= 0.65f
            val predictedLabel = if (isRecognized && maxIndex >= 0 && maxIndex < labels.size) labels[maxIndex] else "Unknown"

            if (isRecognized) {
                val params = Arguments.createMap().apply {
                    putString("label", predictedLabel)
                    putDouble("confidence", maxProb.toDouble())
                    putBoolean("isHandDetected", true)
                }
                sendEvent("onSignDetected", params)
            }

            promise.resolve(predictedLabel)
        } catch (e: Exception) {
            promise.reject("PREDICTION_ERROR", e.localizedMessage)
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext.runOnJSQueueThread {
            try {
                reactApplicationContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(eventName, params)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}