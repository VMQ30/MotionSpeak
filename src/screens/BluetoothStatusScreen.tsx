import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import { useBluetooth } from '../bluetooth/BluetoothContext';
import { useLanguage } from '../context/LanguageContext';
import { useNavigation } from '@react-navigation/native';
import { useFontSize } from '../context/FontSizeContext';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/StackNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BluetoothStatusScreen = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const { isConnected, deviceName, isScanning, connectToDevice, disconnectDevice } = useBluetooth();
  const { language } = useLanguage();
  const { fontSizePercentage } = useFontSize();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const getTextStyle = (baseSize: number) => ({ fontSize: baseSize * (fontSizePercentage / 100) });

  useEffect(() => {
    const handleChange = ({ window }: { window: { width: number; height: number } }) => {
      const { width, height } = window;
      setIsLandscape(width > height);
      setIsTablet(Math.min(width, height) >= 600);
    };
    
    const sub = Dimensions.addEventListener('change', handleChange);
    const { width, height } = Dimensions.get('window');
    setIsLandscape(width > height);
    setIsTablet(Math.min(width, height) >= 600);
    
    return () => sub?.remove?.();
  }, []);

  const loadDarkModePreference = async () => {
    try {
      const savedDarkMode = await AsyncStorage.getItem('darkMode');
      if (savedDarkMode !== null) {
        setIsDarkMode(JSON.parse(savedDarkMode));
      }
    } catch (error) {
      console.log('Error loading dark mode preference:', error);
    }
  };

  useEffect(() => {
    loadDarkModePreference();
  }, []);

  const handleBack = () => {
    navigation.navigate('Home');
  };

  const handleConnect = async () => {
    await connectToDevice();
  };

  const containerStyle = [
    styles.container,
    isLandscape && styles.containerLandscape,
    isTablet && styles.containerTablet,
    { backgroundColor: isDarkMode ? '#1a1a1a' : '#fff' }
  ];

  const titleStyle = [
    styles.title,
    isTablet && styles.titleTablet,
    isLandscape && styles.titleLandscape,
    { color: isDarkMode ? '#fff' : '#0086b3' }
  ];

  const statusContainerStyle = [
    styles.statusContainer,
    isTablet && styles.statusContainerTablet,
    isLandscape && styles.statusContainerLandscape,
    { borderBottomColor: isDarkMode ? '#444' : '#f0f0f0' }
  ];

  const statusLabelStyle = [
    styles.statusLabel,
    isTablet && styles.statusLabelTablet,
    isLandscape && styles.statusLabelLandscape,
    { color: isDarkMode ? '#e0e0e0' : '#333' }
  ];

  const statusValueStyle = [
    styles.statusValue,
    isTablet && styles.statusValueTablet,
    isLandscape && styles.statusValueLandscape,
    { color: isDarkMode ? '#ffffff' : '#000000' }
  ];

  const buttonStyle = [
    styles.button,
    isTablet && styles.buttonTablet,
    isLandscape && styles.buttonLandscape,
    { 
      backgroundColor: isConnected 
        ? (isDarkMode ? '#ff6b6b' : '#ff4444') 
        : (isDarkMode ? '#0086b3' : '#0086b3')
    }
  ];

  const backButtonStyle = [
    styles.backButton,
    isTablet && styles.backButtonTablet,
    isLandscape && styles.backButtonLandscape
  ];

  const backIconStyle = [
    styles.backIcon,
    isTablet && styles.backIconTablet,
    isLandscape && styles.backIconLandscape,
    { tintColor: isDarkMode ? '#fff' : '#0086b3' }
  ];

  return (
    <View style={containerStyle}>
      {/* Back Button */}
      <TouchableOpacity style={backButtonStyle} onPress={handleBack}>
        <Image 
          source={require('../assets/back_arrow.png')} 
          style={backIconStyle} 
        />
      </TouchableOpacity>
      
      <Text style={[titleStyle, getTextStyle(24)]}>
        {language === 'english' ? 'Bluetooth Status' : 'Status ng Bluetooth'}
      </Text>

      <View style={styles.content}>
        <View style={statusContainerStyle}>
          <Text style={[statusLabelStyle, getTextStyle(18)]}>
            {language === 'english' ? 'Connection:' : 'Koneksyon:'}
          </Text>
          <Text style={[
            statusValueStyle,
            getTextStyle(16),
            { color: isConnected ? (isDarkMode ? '#00c6a7' : '#0086b3') : (isDarkMode ? '#ff6b6b' : '#ff4444') }
          ]}>
            {isConnected 
              ? (language === 'english' ? 'Connected' : 'Konektado')
              : (language === 'english' ? 'Not Connected' : 'Hindi Konektado')
            }
          </Text>
        </View>

        <View style={statusContainerStyle}>
          <Text style={[statusLabelStyle, getTextStyle(18)]}>
            {language === 'english' ? 'Device:' : 'Device:'}
          </Text>
          <Text style={[statusValueStyle, getTextStyle(16)]}>
            {deviceName || (language === 'english' ? 'None' : 'Wala')}
          </Text>
        </View>

        <View style={statusContainerStyle}>
          <Text style={[statusLabelStyle, getTextStyle(18)]}>
            {language === 'english' ? 'Scanning:' : 'Nagsescan:'}
          </Text>
          <Text style={[statusValueStyle, getTextStyle(16)]}>
            {isScanning 
              ? (language === 'english' ? 'Yes' : 'Oo')
              : (language === 'english' ? 'No' : 'Hindi')
            }
          </Text>
        </View>

        <TouchableOpacity 
          style={buttonStyle}
          onPress={isConnected ? disconnectDevice : handleConnect}
        >
          <Text style={[styles.buttonText, isTablet && styles.buttonTextTablet, isLandscape && styles.buttonTextLandscape, getTextStyle(18)]}>
            {isConnected 
              ? (language === 'english' ? 'Disconnect' : 'Idiskonekta')
              : (language === 'english' ? 'Connect to Gloves' : 'Kumonekta sa Gloves')
            }
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex:1,padding:20,paddingTop:50},
  containerLandscape: {paddingHorizontal:60,paddingTop:40},
  containerTablet: {paddingHorizontal:80,paddingTop:70},
  
  content: {flex:1,justifyContent:'center'},
  
  backButton: {position:'absolute',top:43,left:20,zIndex:10,padding:10},
  backButtonTablet: {top:63,left:30},
  backButtonLandscape: {top:43,left:50},
  
  backIcon: {width:35,height:35},
  backIconTablet: {width:45,height:45},
  backIconLandscape: {width:35,height:35},
  
  title: {fontWeight:'bold',textAlign:'center',marginBottom:30},
  titleTablet: {marginBottom:40},
  titleLandscape: {marginBottom:35},
  
  statusContainer: {flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:15,borderBottomWidth:1,marginBottom:15},
  statusContainerTablet: {paddingVertical:20,marginBottom:20},
  statusContainerLandscape: {paddingVertical:18,marginBottom:18},
  
  statusLabel: {fontWeight:'600'},
  statusLabelTablet: {},
  statusLabelLandscape: {},
  
  statusValue: {fontWeight:'500'},
  statusValueTablet: {},
  statusValueLandscape: {},
  
  button: {marginTop:30,padding:15,borderRadius:40,alignItems:'center'},
  buttonTablet: {marginTop:40,padding:20,borderRadius:50},
  buttonLandscape: {marginTop:35,padding:18,borderRadius:40},
  
  buttonText: {color:'white',fontWeight:'bold'},
  buttonTextTablet: {},
  buttonTextLandscape: {},
});

export default BluetoothStatusScreen;