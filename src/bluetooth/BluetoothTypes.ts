export interface BluetoothDevice {
  id: string;
  name: string;
  address: string;
  isConnected: boolean;
}

export interface BluetoothContextType {
  isConnected: boolean;
  deviceName: string | null;
  isScanning: boolean;
  sensorData: string;
  isReceivingData: boolean;
  receivedMessages: string[];
  connectToDevice: () => Promise<void>;
  disconnectDevice: () => Promise<void>;
  startScan: () => Promise<void>;
  stopScan: () => void;
  startDataListening: () => void;
  stopDataListening: () => void;
  sendData: (data: string) => Promise<void>;
  clearMessages: () => void;
}

export interface ClassicBluetoothDevice {
  name: string;
  address: string;
  id?: string;
  class?: number;
}