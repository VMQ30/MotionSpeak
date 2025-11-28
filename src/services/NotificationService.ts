import { Platform } from 'react-native';
import notifee, { AndroidImportance } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  type: 'connection' | 'disconnection' | 'error' | 'message';
}

class NotificationService {
  private readonly STORAGE_KEY = 'app_notifications';

  async requestPermissions() {
    if (Platform.OS === 'android') {
      await notifee.requestPermission();
    }
  }

  async createChannel() {
    if (Platform.OS === 'android') {
      await notifee.createChannel({
        id: 'bluetooth',
        name: 'Bluetooth Notifications',
        importance: AndroidImportance.HIGH,
        vibration: true,
      });
    }
  }

  private async saveNotification(notification: Omit<AppNotification, 'id'>) {
    try {
      const existingNotifications = await this.getNotifications();
      const newNotification: AppNotification = {
        ...notification,
        id: Date.now().toString(),
      };

      const updatedNotifications = [newNotification, ...existingNotifications];
      
      // Keep only last 100 notifications to prevent storage issues
      const trimmedNotifications = updatedNotifications.slice(0, 100);
      
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(trimmedNotifications));
      
      return newNotification;
    } catch (error) {
      console.log('Error saving notification:', error);
    }
  }

  async getNotifications(): Promise<AppNotification[]> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.log('Error getting notifications:', error);
      return [];
    }
  }

  async clearNotifications() {
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.log('Error clearing notifications:', error);
    }
  }

  async showBluetoothConnected(deviceName: string) {
    try {
      await this.saveNotification({
        title: 'MotionSpeak Gloves Connected',
        body: `Successfully connected to ${deviceName}`,
        timestamp: Date.now(),
        type: 'connection'
      });

      await notifee.displayNotification({
        id: 'bluetooth-connected',
        title: 'MotionSpeak Gloves Connected',
        body: `Successfully connected to ${deviceName}`,
        android: {
          channelId: 'bluetooth',
          importance: AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          pressAction: {
            id: 'default',
          },
        },
        ios: {
          sound: 'default',
        },
      });
    } catch (error) {
      console.log('Error showing connection notification:', error);
    }
  }

  async showBluetoothDisconnected() {
    try {
      await this.requestPermissions();
      await this.createChannel();

      await this.saveNotification({
        title: 'MotionSpeak Gloves Disconnected',
        body: 'Bluetooth connection lost',
        timestamp: Date.now(),
        type: 'disconnection'
      });

      await notifee.displayNotification({
        id: 'bluetooth-disconnected',
        title: 'MotionSpeak Gloves Disconnected',
        body: 'Bluetooth connection lost',
        android: {
          channelId: 'bluetooth',
          importance: AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          pressAction: {
            id: 'default',
          },
        },
        ios: {
          sound: 'default',
        },
      });
    } catch (error) {
      console.log('Error showing disconnection notification:', error);
    }
  }

  async showBluetoothConnectionFailed() {
    try {
      await this.requestPermissions();
      await this.createChannel();

      await this.saveNotification({
        title: 'Connection Failed',
        body: 'Unable to connect to MotionSpeak gloves',
        timestamp: Date.now(),
        type: 'error'
      });

      await notifee.displayNotification({
        id: 'bluetooth-failed',
        title: 'Connection Failed',
        body: 'Unable to connect to MotionSpeak gloves',
        android: {
          channelId: 'bluetooth',
          importance: AndroidImportance.HIGH,
          pressAction: {
            id: 'default',
          },
        },
      });
    } catch (error) {
      console.log('Error showing failed connection notification:', error);
    }
  }
}

export default new NotificationService();