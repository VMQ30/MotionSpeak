package com.motionspeakapp

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface
import android.view.TextureView
import android.widget.FrameLayout

@SuppressLint("MissingPermission")
class MotionSpeakCameraView(context: Context) : FrameLayout(context), TextureView.SurfaceTextureListener {

    private val textureView: TextureView = TextureView(context)
    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var backgroundThread: HandlerThread? = null
    private var backgroundHandler: Handler? = null
    private var facingFront: Boolean = true

    companion object {
        var activeInstance: MotionSpeakCameraView? = null
    }

    init {
        textureView.surfaceTextureListener = this
        addView(textureView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    fun getLatestFrameBitmap(): android.graphics.Bitmap? {
        if (textureView.isAvailable) {
            return textureView.getBitmap(160, 160)
        }
        return null
    }

    fun setFacing(facing: String) {
        val newFacingFront = facing.equals("front", ignoreCase = true)
        if (facingFront != newFacingFront) {
            facingFront = newFacingFront
            closeCamera()
            if (textureView.isAvailable) {
                openCamera(textureView.width, textureView.height)
            }
        }
    }

    override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
        activeInstance = this
        startBackgroundThread()
        openCamera(width, height)
    }

    override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {}

    override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
        if (activeInstance == this) {
            activeInstance = null
        }
        closeCamera()
        stopBackgroundThread()
        return true
    }

    override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}

    private fun startBackgroundThread() {
        if (backgroundThread == null) {
            backgroundThread = HandlerThread("MotionSpeakCameraBg").also { it.start() }
            backgroundHandler = Handler(backgroundThread!!.looper)
        }
    }

    private fun stopBackgroundThread() {
        backgroundThread?.quitSafely()
        try {
            backgroundThread?.join()
            backgroundThread = null
            backgroundHandler = null
        } catch (e: InterruptedException) {
            e.printStackTrace()
        }
    }

    private fun openCamera(width: Int, height: Int) {
        val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        try {
            var selectedCameraId: String? = null
            val targetFacing = if (facingFront) CameraCharacteristics.LENS_FACING_FRONT else CameraCharacteristics.LENS_FACING_BACK

            for (id in manager.cameraIdList) {
                val characteristics = manager.getCameraCharacteristics(id)
                val lensFacing = characteristics.get(CameraCharacteristics.LENS_FACING)
                if (lensFacing == targetFacing) {
                    selectedCameraId = id
                    break
                }
            }

            if (selectedCameraId == null && manager.cameraIdList.isNotEmpty()) {
                selectedCameraId = manager.cameraIdList[0]
            }

            if (selectedCameraId != null) {
                manager.openCamera(selectedCameraId, object : CameraDevice.StateCallback() {
                    override fun onOpened(camera: CameraDevice) {
                        cameraDevice = camera
                        createCameraPreviewSession()
                    }

                    override fun onDisconnected(camera: CameraDevice) {
                        closeCamera()
                    }

                    override fun onError(camera: CameraDevice, error: Int) {
                        closeCamera()
                    }
                }, backgroundHandler)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun createCameraPreviewSession() {
        val device = cameraDevice ?: return
        val texture = textureView.surfaceTexture ?: return

        try {
            val surface = Surface(texture)
            val previewRequestBuilder = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
            previewRequestBuilder.addTarget(surface)

            device.createCaptureSession(listOf(surface), object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                    if (cameraDevice == null) return
                    captureSession = session
                    try {
                        previewRequestBuilder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                        session.setRepeatingRequest(previewRequestBuilder.build(), null, backgroundHandler)
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }

                override fun onConfigureFailed(session: CameraCaptureSession) {}
            }, backgroundHandler)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun closeCamera() {
        try {
            captureSession?.close()
            captureSession = null
            cameraDevice?.close()
            cameraDevice = null
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
