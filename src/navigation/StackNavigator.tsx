import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SplashScreen from '../screens/SplashScreen';
import TutorialScreen from '../screens/TutorialScreen';
import BlankScreen from '../screens/BlankScreen'; 
import HomepageScreen from '../screens/HomepageScreen';


export type RootStackParamList = {
  Splash: undefined;
  Tutorial: undefined;
  Blank: undefined;
  Home: undefined; // added for homepage
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const StackNavigator = () => {
  return (
    <Stack.Navigator initialRouteName="Splash">
      <Stack.Screen name="Splash" component={SplashScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Tutorial" component={TutorialScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Blank" component={BlankScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Home" component={HomepageScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
};

export default StackNavigator;
