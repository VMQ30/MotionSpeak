import { NativeModules, NativeEventEmitter } from 'react-native';

interface BluetoothModuleInterface {
  isBluetoothEnabled(): Promise<boolean>;
  getBondedDevices(): Promise<string>;
  getConnectedDevices(): Promise<string>;
  connectToDevice(address: string): Promise<boolean>;
  disconnect(): Promise<boolean>;
  startDataListening(): void;
  stopDataListening(): void;
  sendData(data: string): Promise<boolean>;
}

const { BluetoothModule } = NativeModules as { BluetoothModule: BluetoothModuleInterface };
const bluetoothEventEmitter = new NativeEventEmitter(BluetoothModule as any);

const TARGET_DEVICE_NAME = 'MotionSpeakGloves';

class BluetoothService {
  private pollingInterval: number | null = null;
  private dataListener: any = null;
  private onDataReceivedCallback: ((data: string) => void) | null = null;

  async startDeviceScan(onDeviceFound: (devices: any[]) => void): Promise<void> {
    try {
      const enabled = await BluetoothModule.isBluetoothEnabled();
      if (!enabled) throw new Error('Enable Bluetooth first');

      const bondedDevicesString: string = await BluetoothModule.getBondedDevices();
      const deviceStrings = bondedDevicesString.replace("[", "").replace("]", "").split(", ");
      const devices = deviceStrings.filter(str => str.trim() !== "").map((deviceStr: string) => {
        const [name, address] = deviceStr.split('|');
        return { name, address };
      });

      // Look for MotionSpeakGloves or any ESP32 device
      const targetDevice = devices.find((device: any) => 
        device.name === TARGET_DEVICE_NAME || 
        device.name.includes('ESP32') ||
        device.name.includes('HC-05') // Common ESP32 Bluetooth module names
      );
      
      if (targetDevice) onDeviceFound([targetDevice]);
      else onDeviceFound([]);
    } catch (error) {
      throw error;
    }
  }

  async connectToDevice(device: any): Promise<boolean> {
    try {
      const currentStatus = await this.checkCurrentConnection();
      if (currentStatus.isConnected && currentStatus.deviceName === device.name) {
        return true;
      }

      await BluetoothModule.connectToDevice(device.address);

      await new Promise<void>(resolve => setTimeout(resolve, 2000)); // Increased timeout for serial connection
      const verifiedStatus = await this.checkCurrentConnection();
      return verifiedStatus.isConnected;
    } catch {
      return false;
    }
  }

  async disconnectDevice(): Promise<void> {
    try {
      this.stopDataListening();
      await BluetoothModule.disconnect();
    } catch {}
  }

  async checkCurrentConnection(): Promise<{ isConnected: boolean; deviceName: string | null }> {
    try {
      const connectedDevicesString: string = await BluetoothModule.getConnectedDevices();
      if (!connectedDevicesString || connectedDevicesString === '[]' || connectedDevicesString === '') {
        return { isConnected: false, deviceName: null };
      }

      const devices = connectedDevicesString.replace("[", "").replace("]", "").split(", ");
      const parsedDevices = devices.filter(str => str.trim() !== "").map((deviceStr: string) => {
        const [name] = deviceStr.split('|');
        return { name };
      });

      // Return first connected device (for serial, usually only one)
      return { 
        isConnected: parsedDevices.length > 0, 
        deviceName: parsedDevices[0]?.name || null 
      };
    } catch {
      return { isConnected: false, deviceName: null };
    }
  }

  startConnectionListener(callback: (status: { isConnected: boolean; deviceName: string | null }) => void) {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    this.pollingInterval = setInterval(async () => {
      const status = await this.checkCurrentConnection();
      callback(status);
    }, 1000);
  }

  stopConnectionListener() {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    this.pollingInterval = null;
  }

  // SERIAL DATA RECEPTION FOR ESP32
  startDataListening(onDataReceived: (data: string) => void) {
    this.onDataReceivedCallback = onDataReceived;
    
    console.log('🟢 Starting ESP32 serial data listening...');
    
    // Listen for incoming serial data from ESP32
    this.dataListener = bluetoothEventEmitter.addListener(
      'onDataReceived',
      (data: string) => {
        console.log('📱 ESP32 Serial Data Received:', data);
        if (this.onDataReceivedCallback) {
          this.onDataReceivedCallback(data);
        }
      }
    );

    // Start listening on native side
    try {
      BluetoothModule.startDataListening();
      console.log('✅ Native data listening started');
    } catch (error) {
      console.log('❌ Error starting native data listening:', error);
    }
  }

  stopDataListening() {
    if (this.dataListener) {
      this.dataListener.remove();
      this.dataListener = null;
    }
    this.onDataReceivedCallback = null;
    
    try {
      BluetoothModule.stopDataListening();
      console.log('🛑 Data listening stopped');
    } catch (error) {
      console.log('Error stopping data listening:', error);
    }
  }

  async sendData(data: string): Promise<void> {
    try {
      await BluetoothModule.sendData(data);
      console.log('📤 Data sent to ESP32:', data);
    } catch (error) {
      console.log('❌ Error sending data to ESP32:', error);
      throw error;
    }
  }

  stopScanning() {
    // Implementation if needed
  }
}

export default new BluetoothService();