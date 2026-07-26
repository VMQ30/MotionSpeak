import React, { useEffect } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FontSizeProvider } from './src/context/FontSizeContext';
import { LanguageProvider } from './src/context/LanguageContext';
import StackNavigator from './src/navigation/StackNavigator';

const { MotionSpeakModule } = NativeModules;
const motionSpeakEmitter = new NativeEventEmitter(MotionSpeakModule);

const App = () => {
  useEffect(() => {
    const subscription = motionSpeakEmitter.addListener(
      'onSignDetected',
      event => {
        console.log('Detected Sign:', event.label);
        console.log('Confidence:', event.confidence);
      },
    );

    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <FontSizeProvider>
          <NavigationContainer>
            <StackNavigator />
          </NavigationContainer>
        </FontSizeProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
};

export default App;
