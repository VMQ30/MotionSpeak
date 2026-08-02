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

            // Example input preparation (adjust shape based on your TFLite input layer)
            val input = FloatArray(landmarkData.size())
            for (i in 0 until landmarkData.size()) {
                input[i] = landmarkData.getDouble(i).toFloat()
            }

            // Output buffer matching model labels/classes
            val output = Array(1) { FloatArray(10) } 
            interpreter?.run(arrayOf(input), output)

            // Calculate label with highest confidence
            val predictedIndex = output[0].indices.maxByOrNull { output[0][it] } ?: -1
            val labels = arrayOf("Hello", "Thank You", "Yes", "No", "Help") // Match your classes
            val predictedLabel = if (predictedIndex != -1) labels[predictedIndex] else "Unknown"
            val confidence = if (predictedIndex != -1) output[0][predictedIndex] else 0.0f

            // Send event back to React Native listener in App.tsx
            val params = Arguments.createMap().apply {
                putString("label", predictedLabel)
                putDouble("confidence", confidence.toDouble())
            }
            sendEvent("onSignDetected", params) //[cite: 1, 8]

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