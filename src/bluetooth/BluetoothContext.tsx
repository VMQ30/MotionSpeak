import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import BluetoothService from './BluetoothService';
import { BluetoothContextType } from './BluetoothTypes';
import NotificationService from '../services/NotificationService';

const BluetoothContext = createContext<BluetoothContextType | undefined>(undefined);

async function requestBluetoothPermission() {
  if (Platform.OS === 'android') {
    try {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Bluetooth Permission",
            message: "MotionSpeak needs location permission to scan for Bluetooth devices",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel", 
            buttonPositive: "OK",
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch {
      return false;
    }
  }
  return true;
}

export const BluetoothProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [sensorData, setSensorData] = useState<string>('');
  const [isReceivingData, setIsReceivingData] = useState<boolean>(false);
  const [receivedMessages, setReceivedMessages] = useState<string[]>([]);
  const prevIsConnectedRef = useRef(false);

  useEffect(() => {
    initializeBluetooth();

    BluetoothService.startConnectionListener(({ isConnected, deviceName }) => {
      // Handle connection status changes and notifications
      if (isConnected && deviceName && !prevIsConnectedRef.current) {
        NotificationService.showBluetoothConnected(deviceName);
      } else if (!isConnected && prevIsConnectedRef.current) {
        NotificationService.showBluetoothDisconnected();
      }
      
      prevIsConnectedRef.current = isConnected;
      setIsConnected(isConnected);
      setDeviceName(deviceName);
      
      if (isConnected) {
        setIsScanning(false);
        startDataListening();
      } else {
        stopDataListening();
        setSensorData('');
      }
    });

    return () => {
      BluetoothService.stopScanning();
      BluetoothService.stopConnectionListener();
      stopDataListening();
    };
  }, []);

  const initializeBluetooth = async () => {
    const hasPermission = await requestBluetoothPermission();
    if (!hasPermission) return;

    const status = await BluetoothService.checkCurrentConnection();
    setIsConnected(status.isConnected);
    setDeviceName(status.deviceName);
    
    if (status.isConnected) {
      startDataListening();
    }
  };

  const startDataListening = () => {
    setIsReceivingData(true);
    
    BluetoothService.startDataListening((data: string) => {
      setSensorData(data);
      
      setReceivedMessages(prev => {
        const newMessages = [...prev, data];
        return newMessages.slice(-50);
      });
    });
  };

  const stopDataListening = () => {
    setIsReceivingData(false);
    BluetoothService.stopDataListening();
  };

  const startScanning = async (): Promise<void> => {
    if (isConnected) return;
    
    setIsScanning(true);

    try {
      await BluetoothService.startDeviceScan(async (devices) => {
        if (devices.length > 0) {
          const connected = await BluetoothService.connectToDevice(devices[0]);
          setIsConnected(connected);
          setDeviceName(connected ? devices[0].name : null);
          
          if (!connected) {
            NotificationService.showBluetoothConnectionFailed();
          }
        }
        setIsScanning(false);
      });
    } catch (error) {
      setIsScanning(false);
      NotificationService.showBluetoothConnectionFailed();
    }
  };

  const disconnectDevice = async (): Promise<void> => {
    stopDataListening();
    await BluetoothService.disconnectDevice();
    setIsConnected(false);
    setDeviceName(null);
    setSensorData('');
    setReceivedMessages([]);
  };

  const sendData = async (data: string): Promise<void> => {
    if (!isConnected) {
      throw new Error('Not connected to ESP32 gloves');
    }
    await BluetoothService.sendData(data);
  };

  const clearMessages = () => {
    setReceivedMessages([]);
    setSensorData('');
  };

  const value: BluetoothContextType = {
    isConnected,
    deviceName,
    isScanning,
    sensorData,
    isReceivingData,
    receivedMessages,
    connectToDevice: startScanning,
    disconnectDevice,
    startScan: startScanning,
    stopScan: () => {
      BluetoothService.stopScanning();
      setIsScanning(false);
    },
    startDataListening,
    stopDataListening,
    sendData,
    clearMessages,
  };

  return (
    <BluetoothContext.Provider value={value}>
      {children}
    </BluetoothContext.Provider>
  );
};

export const useBluetooth = (): BluetoothContextType => {
  const context = useContext(BluetoothContext);
  if (!context) throw new Error('useBluetooth must be used within a BluetoothProvider');
  return context;
};