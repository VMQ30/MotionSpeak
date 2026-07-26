package com.motionspeakapp

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments

class MotionSpeakModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "MotionSpeakModule"
    }

    // Example ReactMethod to trigger prediction logic from JS
    @ReactMethod
    fun predictSign(landmarkData: String, promise: Promise) {
        try {
            // TODO: Pass keypoints to your TFLite Interpreter here
            val predictedLabel = "Hello" // Placeholder result
            val confidence = 0.95f

            // Emit real-time event to React Native
            val params = Arguments.createMap().apply {
                putString("label", predictedLabel)
                putDouble("confidence", confidence.toDouble())
            }
            sendEvent("onSignDetected", params)

            promise.resolve(predictedLabel)
        } catch (e: Exception) {
            promise.reject("PREDICTION_ERROR", e.localizedMessage)
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}