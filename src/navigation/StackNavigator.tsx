import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SplashScreen from '../screens/SplashScreen';
import TutorialScreen from '../screens/TutorialScreen';
import TipsScreen from '../screens/TipsScreen';
import BlankScreen from '../screens/BlankScreen'; 
import HomepageScreen from '../screens/HomepageScreen';


export type RootStackParamList = {
  Splash: undefined;
  Tutorial: { fromTips?: boolean; fromHomepage?: boolean };
  Tips: undefined;
  Blank: undefined;
  Home: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const StackNavigator = () => {
  return (
    <Stack.Navigator initialRouteName="Splash">
      <Stack.Screen name="Splash" component={SplashScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Tips" component={TipsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Tutorial" component={TutorialScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Blank" component={BlankScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Home" component={HomepageScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
};

export default StackNavigator;
