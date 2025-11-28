import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, ScrollView } from 'react-native';
import { useLanguage } from '../context/LanguageContext';
import { useNavigation } from '@react-navigation/native';
import { useFontSize } from '../context/FontSizeContext';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/StackNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NotificationService, { AppNotification } from '../services/NotificationService';

const NotificationsScreen = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
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

  const loadNotifications = async () => {
    const storedNotifications = await NotificationService.getNotifications();
    setNotifications(storedNotifications);
  };

  useEffect(() => {
    loadDarkModePreference();
    loadNotifications();
  }, []);

  const handleBack = () => {
    navigation.navigate('Home');
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'connection':
        return require('../assets/bluetooth_connected.png');
      case 'disconnection':
        return require('../assets/bluetooth_disconnected.png');
      case 'error':
        return require('../assets/error.png');
      case 'message':
        return require('../assets/message.png');
      default:
        return require('../assets/notification.png');
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'connection':
        return '#00c6a7';
      case 'disconnection':
        return '#ff6b6b';
      case 'error':
        return '#ffa726';
      case 'message':
        return '#0086b3';
      default:
        return '#666';
    }
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

  const notificationItemStyle = [
    styles.notificationItem,
    isTablet && styles.notificationItemTablet,
    isLandscape && styles.notificationItemLandscape,
    { backgroundColor: isDarkMode ? '#2a2a2a' : '#f8f8f8' }
  ];

  const emptyTextStyle = [
    styles.emptyText,
    isTablet && styles.emptyTextTablet,
    isLandscape && styles.emptyTextLandscape,
    { color: isDarkMode ? '#888' : '#999' }
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
        {language === 'english' ? 'Notifications' : 'Mga Notifications'}
      </Text>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollView}>
        {notifications.length > 0 ? (
          notifications.map((notification) => (
            <View key={notification.id} style={notificationItemStyle}>
              <View style={styles.notificationHeader}>
                <Image 
                  source={getNotificationIcon(notification.type)} 
                  style={[
                    styles.notificationIcon,
                    { tintColor: getNotificationColor(notification.type) }
                  ]} 
                />
                <View style={styles.notificationTitleContainer}>
                  <Text style={[
                    styles.notificationTitle, 
                    getTextStyle(16),
                    { color: getNotificationColor(notification.type) }
                  ]}>
                    {notification.title}
                  </Text>
                  <Text style={[styles.notificationTime, getTextStyle(12), { color: isDarkMode ? '#aaa' : '#666' }]}>
                    {formatDate(notification.timestamp)} • {formatTime(notification.timestamp)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.notificationBody, getTextStyle(14), { color: isDarkMode ? '#e0e0e0' : '#333' }]}>
                {notification.body}
              </Text>
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Image 
              source={require('../assets/notification.png')} 
              style={[styles.emptyIcon, { tintColor: isDarkMode ? '#666' : '#999' }]} 
            />
            <Text style={[emptyTextStyle, getTextStyle(18)]}>
              {language === 'english' ? 'No notifications yet' : 'Wala pang notifications'}
            </Text>
            <Text style={[styles.emptySubtext, getTextStyle(14), { color: isDarkMode ? '#666' : '#999' }]}>
              {language === 'english' ? 'Connection events and messages will appear here' : 'Ang mga koneksyon at mensahe ay lalabas dito'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex:1,padding:20,paddingTop:50},
  containerLandscape: {paddingHorizontal:40,paddingTop:40},
  containerTablet: {paddingHorizontal:60,paddingTop:60},
  
  scrollView: {flex:1},
  
  backButton: {position:'absolute',top:43,left:20,zIndex:10,padding:10},
  backButtonTablet: {top:63,left:30},
  backButtonLandscape: {top:43,left:40},
  
  backIcon: {width:35,height:35},
  backIconTablet: {width:45,height:45},
  backIconLandscape: {width:35,height:35},
  
  title: {fontWeight:'bold',textAlign:'center',marginBottom:30},
  titleTablet: {marginBottom:40},
  titleLandscape: {marginBottom:35},
  
  notificationItem: {padding:15,borderRadius:12,marginBottom:12},
  notificationItemTablet: {padding:20,marginBottom:15},
  notificationItemLandscape: {padding:15,marginBottom:10},
  
  notificationHeader: {flexDirection:'row',alignItems:'center',marginBottom:8},
  notificationTitleContainer: {flex:1,marginLeft:12},
  notificationTitle: {fontWeight:'bold'},
  notificationTime: {marginTop:2},
  notificationBody: {lineHeight:20},
  
  notificationIcon: {width:20,height:20},
  
  emptyContainer: {alignItems:'center',justifyContent:'center',paddingVertical:60},
  emptyIcon: {width:80,height:80,marginBottom:20,opacity:0.5},
  emptyText: {textAlign:'center',fontWeight:'500',marginBottom:8},
  emptyTextTablet: {marginBottom:12},
  emptyTextLandscape: {marginBottom:8},
  emptySubtext: {textAlign:'center'},
});

export default NotificationsScreen;