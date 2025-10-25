import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import StackNavigator from './src/navigation/StackNavigator';
import { LanguageProvider } from './src/context/LanguageContext';

const App = () => {
  return (
    <LanguageProvider>
      <NavigationContainer>
        <StackNavigator />
      </NavigationContainer>
    </LanguageProvider>
  );
};

export default App;
