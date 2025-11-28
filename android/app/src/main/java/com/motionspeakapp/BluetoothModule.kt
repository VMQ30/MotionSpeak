package com.motionspeakapp

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.IOException
import java.io.InputStream
import java.util.*
import java.util.concurrent.Executors

class BluetoothModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private var bluetoothSocket: BluetoothSocket? = null
    private var inputStream: InputStream? = null
    private var readThread: Thread? = null
    private val executor = Executors.newSingleThreadExecutor()
    
    // SPP UUID for Serial Communication
    private val serialUUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    override fun getName(): String {
        return "BluetoothModule"
    }

    @ReactMethod
    fun isBluetoothEnabled(promise: Promise) {
        try {
            val enabled = bluetoothAdapter != null && bluetoothAdapter.isEnabled
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("BLUETOOTH_ERROR", "Error checking Bluetooth status", e)
        }
    }

    @ReactMethod
    fun getBondedDevices(promise: Promise) {
        try {
            if (bluetoothAdapter == null) {
                promise.reject("BLUETOOTH_ERROR", "Bluetooth not supported")
                return
            }

            val pairedDevices: Set<BluetoothDevice> = bluetoothAdapter.bondedDevices
            val devices = mutableListOf<String>()

            for (device in pairedDevices) {
                val deviceInfo = "${device.name}|${device.address}"
                devices.add(deviceInfo)
            }

            promise.resolve(devices.toString())
        } catch (e: Exception) {
            promise.reject("BLUETOOTH_ERROR", "Error getting bonded devices", e)
        }
    }

    @ReactMethod
    fun connectToDevice(address: String, promise: Promise) {
        try {
            if (bluetoothAdapter == null) {
                promise.reject("BLUETOOTH_ERROR", "Bluetooth not supported")
                return
            }

            val device = bluetoothAdapter.getRemoteDevice(address)
            
            // Stop any existing connection
            disconnectInternal()
            
            // Create SPP socket
            bluetoothSocket = device.createRfcommSocketToServiceRecord(serialUUID)

            executor.execute {
                try {
                    bluetoothSocket!!.connect()
                    Log.d("BluetoothModule", "✅ Connected to ${device.name}")
                    
                    // Start listening for data
                    startInputStream()
                    
                    reactApplicationContext.runOnUiQueueThread {
                        promise.resolve(true)
                    }
                } catch (e: IOException) {
                    Log.e("BluetoothModule", "❌ Connection failed to ${device.name}", e)
                    disconnectInternal()
                    reactApplicationContext.runOnUiQueueThread {
                        promise.reject("CONNECTION_ERROR", "Failed to connect to device: ${e.message}")
                    }
                } catch (e: Exception) {
                    Log.e("BluetoothModule", "❌ Unexpected connection error", e)
                    disconnectInternal()
                    reactApplicationContext.runOnUiQueueThread {
                        promise.reject("CONNECTION_ERROR", "Connection failed: ${e.message}")
                    }
                }
            }
        } catch (e: Exception) {
            promise.reject("BLUETOOTH_ERROR", "Connection setup failed: ${e.message}")
        }
    }

    @ReactMethod
    fun disconnect(promise: Promise) {
        try {
            disconnectInternal()
            promise.resolve(true)
            Log.d("BluetoothModule", "🔌 Disconnected successfully")
        } catch (e: Exception) {
            promise.reject("DISCONNECT_ERROR", "Error during disconnect: ${e.message}")
        }
    }

    @ReactMethod
    fun getConnectedDevices(promise: Promise) {
        try {
            val connectedDevices = mutableListOf<String>()
            
            bluetoothSocket?.let { socket ->
                if (socket.isConnected) {
                    val device = socket.remoteDevice
                    connectedDevices.add("${device.name}|${device.address}")
                    Log.d("BluetoothModule", "Connected to: ${device.name}")
                }
            }

            promise.resolve(connectedDevices.toString())
        } catch (e: Exception) {
            promise.reject("BLUETOOTH_ERROR", "Error getting connected devices: ${e.message}")
        }
    }

    @ReactMethod
    fun startDataListening() {
        Log.d("BluetoothModule", "🎯 Starting data listening...")
        // InputStream is started automatically when connected
        // This method is for React Native compatibility
    }

    @ReactMethod
    fun stopDataListening() {
        Log.d("BluetoothModule", "🛑 Stopping data listening...")
        stopInputStream()
    }

    @ReactMethod
    fun sendData(data: String, promise: Promise) {
        try {
            if (bluetoothSocket == null || !bluetoothSocket!!.isConnected) {
                promise.reject("SEND_ERROR", "Not connected to any device")
                return
            }

            val outputStream = bluetoothSocket!!.outputStream
            outputStream.write(data.toByteArray())
            outputStream.flush()
            
            Log.d("BluetoothModule", "📤 Sent data: $data")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e("BluetoothModule", "❌ Error sending data", e)
            promise.reject("SEND_ERROR", "Failed to send data: ${e.message}")
        }
    }

    // PRIVATE METHODS
    private fun startInputStream() {
        stopInputStream() // Stop any existing thread

        readThread = Thread {
            try {
                inputStream = bluetoothSocket?.inputStream
                val buffer = ByteArray(1024)
                var bytes: Int

                Log.d("BluetoothModule", "📡 Starting ESP32 data reception thread")

                while (!Thread.currentThread().isInterrupted && 
                       bluetoothSocket != null && 
                       bluetoothSocket!!.isConnected) {
                    try {
                        bytes = inputStream!!.read(buffer)
                        if (bytes > 0) {
                            val receivedData = String(buffer, 0, bytes).trim()
                            Log.d("BluetoothModule", "📨 Received from ESP32: $receivedData")
                            
                            // Send to React Native
                            sendEvent("onDataReceived", receivedData)
                        }
                    } catch (e: IOException) {
                        Log.e("BluetoothModule", "❌ Error reading data stream", e)
                        break
                    } catch (e: Exception) {
                        Log.e("BluetoothModule", "❌ Unexpected read error", e)
                        break
                    }
                }
            } catch (e: Exception) {
                Log.e("BluetoothModule", "❌ Input stream setup failed", e)
            } finally {
                Log.d("BluetoothModule", "📡 Data reception thread ended")
            }
        }.apply {
            start()
        }
    }

    private fun stopInputStream() {
        readThread?.interrupt()
        readThread = null
        
        try {
            inputStream?.close()
        } catch (e: IOException) {
            Log.e("BluetoothModule", "Error closing input stream", e)
        }
        inputStream = null
    }

    private fun disconnectInternal() {
        stopInputStream()
        
        try {
            bluetoothSocket?.close()
        } catch (e: IOException) {
            Log.e("BluetoothModule", "Error closing socket", e)
        }
        bluetoothSocket = null
    }

    private fun sendEvent(eventName: String, data: String) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, data)
        } catch (e: Exception) {
            Log.e("BluetoothModule", "❌ Error sending event to React Native", e)
        }
    }

    override fun invalidate() {
        disconnectInternal()
        executor.shutdown()
        super.invalidate()
    }
}