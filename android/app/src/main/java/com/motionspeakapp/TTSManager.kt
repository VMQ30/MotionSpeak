package com.motionspeakapp

import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.*

class TTSManager(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), TextToSpeech.OnInitListener {
    private var tts: TextToSpeech? = null
    private var isInitialized = false

    init {
        tts = TextToSpeech(reactContext, this)
    }

    override fun getName(): String {
        return "TTSManager"
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            isInitialized = true
            tts?.language = Locale("fil", "PH")
            
            tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    sendEvent("onTTSStart", utteranceId)
                }

                override fun onDone(utteranceId: String?) {
                    sendEvent("onTTSDone", utteranceId)
                }

                override fun onError(utteranceId: String?) {
                    sendEvent("onTTSError", utteranceId)
                }

                override fun onRangeStart(utteranceId: String?, start: Int, end: Int, frame: Int) {
                    val rangeData = "{\"start\":$start,\"end\":$end}"
                    sendEvent("onTTSWordRange", rangeData)
                }
            })
        }
    }

    @ReactMethod
    fun speak(text: String) {
        if (isInitialized && tts != null && text.isNotEmpty()) {
            val params = HashMap<String, String>()
            params[TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID] = "motionspeak_utterance"
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, params)
        }
    }

    @ReactMethod
    fun stop() {
        tts?.stop()
    }

    @ReactMethod
    fun setRate(rate: Double) {
        if (isInitialized) {
            tts?.setSpeechRate(rate.toFloat())
        }
    }

    @ReactMethod
    fun setPitch(pitch: Double) {
        if (isInitialized) {
            tts?.setPitch(pitch.toFloat())
        }
    }

    private fun sendEvent(eventName: String, data: String?) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, data)
        } catch (e: Exception) {
            // Event emitter might not be available
        }
    }

    override fun invalidate() {
        tts?.stop()
        tts?.shutdown()
        super.invalidate()
    }
}