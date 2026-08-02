package com.motionspeakapp

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class MotionSpeakCameraViewManager : SimpleViewManager<MotionSpeakCameraView>() {

    override fun getName(): String {
        return "MotionSpeakCameraView"
    }

    override fun createViewInstance(reactContext: ThemedReactContext): MotionSpeakCameraView {
        return MotionSpeakCameraView(reactContext)
    }

    @ReactProp(name = "facing")
    fun setFacing(view: MotionSpeakCameraView, facing: String?) {
        view.setFacing(facing ?: "front")
    }
}
