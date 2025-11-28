import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FontSizeProvider } from './src/context/FontSizeContext';
import { LanguageProvider } from './src/context/LanguageContext';
import StackNavigator from './src/navigation/StackNavigator';
import { BluetoothProvider } from './src/bluetooth/BluetoothContext';
import notifee from '@notifee/react-native';
notifee.requestPermission();
const App = () => {
  return (
<BluetoothProvider>
    <SafeAreaProvider>
      <LanguageProvider>
        <FontSizeProvider>
          <NavigationContainer>
            <StackNavigator />
          </NavigationContainer>
        </FontSizeProvider>
      </LanguageProvider>
    </SafeAreaProvider>
</BluetoothProvider>
  );
};

export default App;