import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FontSizeProvider } from './src/context/FontSizeContext';
import { LanguageProvider } from './src/context/LanguageContext';
import StackNavigator from './src/navigation/StackNavigator';

const App = () => {
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