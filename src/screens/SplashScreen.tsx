import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SplashScreen = ({ navigation }: any) => {
  const fadeAnim = new Animated.Value(0);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    loadDarkModePreference();
  }, []);

  const loadDarkModePreference = async () => {
    try {
      const savedDarkMode = await AsyncStorage.getItem('darkMode');
      if (savedDarkMode !== null) {
        setIsDarkMode(JSON.parse(savedDarkMode));
      }
      setIsReady(true);
    } catch (error) {
      console.log('Error loading dark mode preference:', error);
      setIsReady(true);
    }
  };

  useEffect(() => {
    if (isReady) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }).start(() => {
        setTimeout(() => {
          navigation.replace('Tips');
        }, 1500);
      });
    }
  }, [isReady]);

  console.log('Dark Mode:', isDarkMode);
  console.log('Is Ready:', isReady);

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#1a1a1a' : '#fff' }]}>
      <Animated.View style={[styles.logoWrapper, { opacity: fadeAnim }]}>
        <Image
          source={require('../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoWrapper: {
    zIndex: 10,
    elevation: 10,
  },
  logo: {
    width: 300,
    height: 300,
    backgroundColor: 'transparent',
  },
  debugOverlay: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 5,
    zIndex: 100,
  },
  debugText: {
    color: '#fff',
    fontSize: 12,
  },
});

export default SplashScreen;