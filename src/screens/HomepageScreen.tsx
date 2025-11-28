import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Dimensions, ScrollView, Animated, Platform, StatusBar, Vibration, Alert } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { FontSizeProvider, useFontSize } from '../context/FontSizeContext';
import { useLanguage } from '../context/LanguageContext';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MenuSidebar from './MenuSidebar';
import CustomizeSidebar from './CustomizeSidebar';
import { useBluetooth } from '../bluetooth/BluetoothContext';
import TTSService from '../services/TTSService';

type Props = { navigation: any };

const HomepageScreenContent: React.FC<Props> = ({ navigation }) => {
  const { language, setLanguage } = useLanguage();
  const { fontSizePercentage, setFontSizePercentage } = useFontSize();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isReadAloudOn, setIsReadAloudOn] = useState(false);
  const [highlightedWordIndex, setHighlightedWordIndex] = useState<number | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isVibrationEnabled, setIsVibrationEnabled] = useState(true);
  const { sensorData, isConnected } = useBluetooth();

  const slideAnim = useRef(new Animated.Value(0)).current;
  const logoSlideAnim = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const customizeSlideAnim = useRef(new Animated.Value(0)).current;
  const isReadAloudOnRef = useRef(false);

  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [customizeModalVisible, setCustomizeModalVisible] = useState(false);
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [ttsPitch, setTtsPitch] = useState(1.0); // Add pitch state

  const [messageBoardText, setMessageBoardText] = useState('');
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get('window');
  const menuWidth = isLandscape ? width * 0.35 : width * 0.7;
  const isTabletLandscape = isTablet && isLandscape;
  const words = messageBoardText.split(/\s+/).filter(word => word.length > 0);

  const getTextStyle = (baseSize: number) => ({ fontSize: baseSize * (fontSizePercentage / 100) });

  const loadVibrationPreference = async () => {
    try {
      const savedVibration = await AsyncStorage.getItem('vibrationEnabled');
      if (savedVibration !== null) {
        setIsVibrationEnabled(JSON.parse(savedVibration));
      }
    } catch (error) {
      console.log('Error loading vibration preference:', error);
    }
  };

  useEffect(() => {
    if (sensorData && sensorData.trim() !== '') {
      setMessageBoardText(prev => {
        return prev ? `${prev}\n${sensorData}` : sensorData;
      });
    }
  }, [sensorData]);
  /*
  useEffect(() => {
    const premadeText = "Noong ako ay labing tatlong taong gulang pa lamang, may nahawakan akong itim na bagay na lumulutang sa ilog. Akala ko uling ni lolo, tae pala ng kalabaw.";
    setMessageBoardText(premadeText);
  }, []);
  */

  const clearMessageBoard = () => {
    if (isVibrationEnabled) Vibration.vibrate(20);
    setMessageBoardText('');
    setHighlightedWordIndex(null);
    if (isReadAloudOnRef.current) {
      TTSService.stop();
      isReadAloudOnRef.current = false;
      setIsReadAloudOn(false);
    }
  };

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
    loadVibrationPreference();
  }, []);

  const toggleReadAloud = () => {
    if (isVibrationEnabled) Vibration.vibrate(20);
    
    if (isReadAloudOnRef.current) {
      TTSService.stop();
      isReadAloudOnRef.current = false;
      setIsReadAloudOn(false);
      setHighlightedWordIndex(null);
    } else {
      isReadAloudOnRef.current = true;
      setIsReadAloudOn(true);
      
      const textToSpeak = messageBoardText || "Hello this is a test message";
      
      // Set both rate and pitch before speaking
      TTSService.setRate(ttsSpeed);
      TTSService.setPitch(ttsPitch);
      
      TTSService.speak(textToSpeak, 
        // Word range callback
        (start, end) => {
          const words = messageBoardText.split(/\s+/).filter(word => word.length > 0);
          let charCount = 0;
          let wordIndex = -1;

          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const wordStart = charCount;
            const wordEnd = charCount + word.length;
            
            if (start >= wordStart && start < wordEnd) {
              wordIndex = i;
              break;
            }
            charCount += word.length + 1;
          }
          
          if (wordIndex !== -1) {
            setHighlightedWordIndex(wordIndex);
          }
        },
        // Done callback
        () => {
          isReadAloudOnRef.current = false;
          setIsReadAloudOn(false);
          setHighlightedWordIndex(null);
        }
      );
    }
  };

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

  // SIDEBAR ANIM
  useEffect(() => {
    if (showCustomizeModal) {
      customizeSlideAnim.setValue(0);
      Animated.parallel([
        Animated.timing(customizeSlideAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
      setTimeout(() => setCustomizeModalVisible(true), 10);
    } else {
      Animated.parallel([
        Animated.timing(customizeSlideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        setCustomizeModalVisible(false);
      });
    }
  }, [showCustomizeModal]);

  const closeCustomizeModal = () => { setShowCustomizeModal(false); };

  const toggleMenu = () => {
    const toValue = menuOpen ? 0 : 1;
    const overlayToValue = menuOpen ? 0 : 0.5;
    const logoToValue = menuOpen ? 0 : -200;

    setMenuOpen(prev => !prev);
    Animated.parallel([
      Animated.timing(slideAnim, { toValue, duration: 300, useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: overlayToValue, duration: 300, useNativeDriver: true }),
      Animated.timing(logoSlideAnim, { toValue: logoToValue, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const closeMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(logoSlideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  };

  const slideStyle = { transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [-menuWidth, 0] }) }] };
  const customizeSlideStyle = { transform: [{ translateX: customizeSlideAnim.interpolate({ inputRange: [0, 1], outputRange: [-menuWidth, 0] }) }] };
  const overlayStyle = { opacity: overlayOpacity };

  const getButtonStyles = () => {
    if (isReadAloudOn) {
      return {
        container: [styles.gradientButton, isLandscape && styles.gradientButtonLandscape, isTablet && styles.gradientButtonTablet],
        text: [styles.readText, isTablet && styles.readTextTablet],
        icon: [styles.speakIcon, isTablet && styles.speakIconTablet],
        gradient: true,
      };
    } else {
      return {
        container: [styles.readAloudButtonOff, isLandscape && styles.gradientButtonLandscape, isTablet && styles.gradientButtonTablet],
        text: [styles.readTextOff, isTablet && styles.readTextTablet],
        icon: [styles.speakIconOff, isTablet && styles.speakIconTablet],
        gradient: false,
      };
    }
  };

  const buttonStyles = getButtonStyles();

  const ReadAloudButtonContent = () => (
    <View style={styles.readButton}>
      <Text style={[buttonStyles.text, getTextStyle(16)]}>
        {isReadAloudOn
          ? (language === 'english' ? 'Reading...' : 'Nagbabasa...')
          : (language === 'english' ? 'Read Aloud' : 'Basahin nang Malakas')
        }
      </Text>
      <Image source={require('../assets/speak.png')} style={buttonStyles.icon} resizeMode="contain" />
    </View>
  );

  return (
    <View style={[styles.container, isLandscape && styles.landscapeContainer, isTablet && styles.tabletContainer, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isDarkMode ? '#1a1a1a' : '#fff' }]}>
      <StatusBar backgroundColor={isDarkMode ? '#1a1a1a' : '#fff'} barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <Animated.View style={[styles.menuButtonWrapper, isTablet && styles.menuButtonWrapperTablet, isLandscape && styles.menuButtonWrapperLandscape, { transform: [{ translateX: logoSlideAnim }] }]}>
        <TouchableOpacity
          style={[styles.menuGradientButton, isTablet && styles.menuGradientButtonTablet]}
          onPress={() => {
            if (isVibrationEnabled) Vibration.vibrate(20);
            toggleMenu();
          }}
        >
          <LinearGradient colors={['#0086b3', '#0086b3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.menuGradientFill, isLandscape && styles.menuGradientFillLandscape]}>
            <View style={[styles.menuButtonContent, isLandscape && styles.menuButtonContentLandscape]}>
              <Image source={require('../assets/menu.png')} style={[styles.menuButtonIcon, isTablet && styles.menuButtonIconTablet, isLandscape && styles.menuButtonIconLandscape]} resizeMode="contain" />
              {!isLandscape && (
                <Text style={[styles.menuButtonText, isTablet && styles.menuButtonTextTablet, getTextStyle(16)]}>
                  {language === 'english' ? 'Menu' : 'Menu'}
                </Text>
              )}
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* PORTRAIT MODE - SEPARATE COMPONENTS */}
      {!isLandscape && (
        <>
          <View style={[styles.translationWrapper, isTabletLandscape && styles.translationWrapperTabletLandscape]}>
            <View style={[styles.translationContainer, isTablet && styles.translationContainerTablet]}>
              <View style={[styles.translationBox, isTablet && styles.translationBoxTablet, { backgroundColor: isDarkMode ? '#2a2a2a' : '#f2f2f2' }]}>
                <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={styles.translationTextWrapper}>
                  <Text style={[styles.translationText, isTablet && styles.translationTextTablet, getTextStyle(16), { color: isDarkMode ? '#fff' : '#333' }]}>
                    {messageBoardText ? (
                      words.map((word, index) => (
                        <Text key={index} style={[index === highlightedWordIndex ? styles.highlightedWord : styles.normalWord, getTextStyle(16), { color: isDarkMode ? '#fff' : '#333' }]}>
                          {word + ' '}
                        </Text>
                      ))
                    ) : (
                      <Text style={[styles.emptyMessageText, getTextStyle(16), { color: isDarkMode ? '#888' : '#999' }]}>
                        {language === 'english' ? 'Message board is empty' : 'Walang laman ang message board'}
                      </Text>
                    )}
                  </Text>
                </ScrollView>
              </View>
            </View>
          </View>

          <View style={[styles.buttonsContainer, isTablet && styles.buttonsContainerTablet]}>
            <View style={[styles.readAloudContainer, isTablet && styles.readAloudContainerTablet]}>
              {buttonStyles.gradient ? (
                <View style={buttonStyles.container}>
                  <LinearGradient colors={['#00c6a7', '#00bfff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradientFill}>
                    <TouchableOpacity style={styles.readButtonTouchable} onPress={toggleReadAloud}>
                      <ReadAloudButtonContent />
                    </TouchableOpacity>
                  </LinearGradient>
                </View>
              ) : (
                <TouchableOpacity style={buttonStyles.container} onPress={toggleReadAloud}>
                  <ReadAloudButtonContent />
                </TouchableOpacity>
              )}
            </View>

            <View style={[styles.clearMessageContainer, isTablet && styles.clearMessageContainerTablet]}>
              <TouchableOpacity style={[styles.clearMessageButton, isTablet && styles.clearMessageButtonTablet]} onPress={clearMessageBoard}>
                <LinearGradient colors={['#FF6B6B', '#FF8E8E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.clearMessageGradient}>
                  <View style={styles.clearMessageButtonContent}>
                    <Text style={[styles.clearMessageText, isTablet && styles.clearMessageTextTablet, getTextStyle(16)]}>
                      {language === 'english' ? 'Clear Message Board' : 'Burahin ang Message Board'}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* LANDSCAPE MODE - SINGLE CONTAINER */}
      {isLandscape && (
        <View style={[styles.landscapeContentContainer, isTabletLandscape && styles.landscapeContentContainerTablet]}>
          <View style={[styles.translationBox, isLandscape && styles.translationBoxLandscape, isTabletLandscape && styles.translationBoxTabletLandscape, { backgroundColor: isDarkMode ? '#2a2a2a' : '#f2f2f2' }]}>
            <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={styles.translationTextWrapper}>
              <Text style={[styles.translationText, isLandscape && styles.translationTextLandscape, isTabletLandscape && styles.translationTextTabletLandscape, getTextStyle(16), { color: isDarkMode ? '#fff' : '#333' }]}>
                {messageBoardText ? (
                  words.map((word, index) => (
                    <Text key={index} style={[index === highlightedWordIndex ? styles.highlightedWord : styles.normalWord, getTextStyle(16), { color: isDarkMode ? '#fff' : '#333' }]}>
                      {word + ' '}
                    </Text>
                  ))
                ) : (
                  <Text style={[styles.emptyMessageText, getTextStyle(16), { color: isDarkMode ? '#888' : '#999' }]}>
                    {language === 'english' ? 'Message board is empty' : 'Walang laman ang message board'}
                  </Text>
                )}
              </Text>
            </ScrollView>
          </View>

          <View style={[styles.landscapeButtonsContainer, isTabletLandscape && styles.landscapeButtonsContainerTablet]}>
            <View style={[styles.readAloudContainerLandscape, isTabletLandscape && styles.readAloudContainerTabletLandscape]}>
              {buttonStyles.gradient ? (
                <View style={[buttonStyles.container, isLandscape && styles.gradientButtonLandscape, isTabletLandscape && styles.gradientButtonTabletLandscape]}>
                  <LinearGradient colors={['#00c6a7', '#00bfff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradientFill}>
                    <TouchableOpacity style={styles.readButtonTouchable} onPress={toggleReadAloud}>
                      <ReadAloudButtonContent />
                    </TouchableOpacity>
                  </LinearGradient>
                </View>
              ) : (
                <TouchableOpacity style={[buttonStyles.container, isLandscape && styles.gradientButtonLandscape, isTabletLandscape && styles.gradientButtonTabletLandscape]} onPress={toggleReadAloud}>
                  <ReadAloudButtonContent />
                </TouchableOpacity>
              )}
            </View>

            <View style={[styles.clearMessageContainerLandscape, isTabletLandscape && styles.clearMessageContainerTabletLandscape]}>
              <TouchableOpacity style={[styles.clearMessageButton, isLandscape && styles.clearMessageButtonLandscape, isTabletLandscape && styles.clearMessageButtonTabletLandscape]} onPress={clearMessageBoard}>
                <LinearGradient colors={['#FF6B6B', '#FF8E8E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.clearMessageGradient}>
                  <View style={styles.clearMessageButtonContent}>
                    <Text style={[styles.clearMessageText, isTabletLandscape && styles.clearMessageTextTabletLandscape, getTextStyle(16)]}>
                      {language === 'english' ? 'Clear Message Board' : 'Burahin ang Message Board'}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <Animated.View style={[styles.overlay, { top: insets.top, bottom: insets.bottom }, overlayStyle]} pointerEvents={menuOpen ? 'auto' : 'none'}>
        <TouchableOpacity style={styles.overlayTouchable} onPress={() => { 
          if (isVibrationEnabled) Vibration.vibrate(20); 
          closeMenu(); 
          if (showCustomizeModal) {
            closeCustomizeModal();
          }
        }} activeOpacity={1} />
      </Animated.View>
      

      {/* MENU SIDEBAR COMPONENT */}
      <MenuSidebar
        menuOpen={menuOpen}
        menuWidth={menuWidth}
        isLandscape={isLandscape}
        isTablet={isTablet}
        isTabletLandscape={isTabletLandscape}
        isDarkMode={isDarkMode}
        slideStyle={slideStyle}
        language={language}
        getTextStyle={getTextStyle}
        closeMenu={closeMenu}
        navigation={navigation}
        setShowCustomizeModal={setShowCustomizeModal}
      />

      {/* CUSTOMIZE SIDEBAR COMPONENT */}
      <CustomizeSidebar
        customizeModalVisible={customizeModalVisible}
        showCustomizeModal={showCustomizeModal}
        setShowCustomizeModal={setShowCustomizeModal}
        customizeSlideStyle={customizeSlideStyle}
        isDarkMode={isDarkMode}
        isTablet={isTablet}
        isLandscape={isLandscape}
        menuWidth={menuWidth}
        language={language}
        getTextStyle={getTextStyle}
        fontSizePercentage={fontSizePercentage}
        setFontSizePercentage={setFontSizePercentage}
        ttsSpeed={ttsSpeed}
        setTtsSpeed={setTtsSpeed}
        ttsPitch={ttsPitch}
        setTtsPitch={setTtsPitch}
        setLanguage={setLanguage}
        closeCustomizeModal={closeCustomizeModal}
        setIsDarkMode={setIsDarkMode}
        isVibrationEnabled={isVibrationEnabled}
        setIsVibrationEnabled={setIsVibrationEnabled}
      />
    </View>
  );
};

const HomepageScreen: React.FC<Props> = (props) => {
  return (
    <SafeAreaProvider>
      <HomepageScreenContent {...props} />
    </SafeAreaProvider>
  );
};

export default HomepageScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  landscapeContainer: { justifyContent: 'flex-start', paddingHorizontal: 20 },
  tabletContainer: { justifyContent: 'flex-start', paddingHorizontal: 60 },

  // LANDSCAPE CONTENT CONTAINER
  landscapeContentContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 60, paddingVertical: 20 },
  landscapeContentContainerTablet: { paddingHorizontal: 120, paddingVertical: 30 },

  // PORTRAIT MODE STYLES
  translationWrapper: { flex: 1, justifyContent: 'center' },
  translationWrapperTabletLandscape: { flex: 0.8, justifyContent: 'center', alignItems: 'center', paddingTop: 30, paddingBottom: 30 },

  translationContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 0 },
  translationContainerTablet: { paddingHorizontal: 120, paddingVertical: 30, paddingTop: 200, justifyContent: 'center', alignItems: 'center' },

  translationBox: { borderRadius: 12, paddingHorizontal: 25, paddingVertical: 30, marginBottom: 15, alignSelf: 'center', maxWidth: '90%', height: 510, minHeight: 510, minWidth: 300, overflow: 'hidden', alignItems: 'center' },
  translationBoxLandscape: { height: 280, minHeight: 280, width: '90%', minWidth: 400, maxWidth: 700, paddingHorizontal: 20, marginBottom:20 },
  translationBoxTablet: { width: '100%', minWidth: 650, height: 780, minHeight: 780, paddingHorizontal: 50, paddingVertical: 50, maxWidth: 700 },
  translationBoxTabletLandscape: { width: '100%', minWidth: 980, height: '88%', minHeight: 400, paddingHorizontal: 25, paddingVertical: 25, maxWidth: 800, marginBottom: 40 },

  translationText: { textAlign: 'center', fontSize: 18, lineHeight: 24 },
  translationTextLandscape: { fontSize: 16, lineHeight: 22, textAlign: 'center'},
  translationTextTablet: { fontSize: 29, lineHeight: 30 },
  translationTextTabletLandscape: { fontSize: 24, lineHeight: 28, textAlign: 'center' },
  translationTextWrapper: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 20, paddingHorizontal: 50, minHeight: '100%' },

  highlightedWord: { backgroundColor: '#FFD700', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, fontWeight: 'bold' },
  normalWord: { backgroundColor: 'transparent' },
  emptyMessageText: { fontStyle: 'italic', textAlign: 'center', flex: 1, textAlignVertical: 'center' },

  // PORTRAIT BUTTONS
  buttonsContainer: { width: '100%', alignItems: 'center', paddingBottom: 20 },
  buttonsContainerTablet: { paddingBottom: 40 },

  readAloudContainer: { width: '100%', alignItems: 'center', marginBottom: 15 },
  readAloudContainerTablet: { marginBottom: 20 },

  gradientButton: { borderRadius: 50, alignSelf: 'center', overflow: 'hidden', height: 48, minWidth: 200 },
  gradientButtonLandscape: { marginBottom: 0, height: 48, minWidth: 200 },
  gradientButtonTablet: { height: 60, minWidth: 240 },
  gradientButtonTabletLandscape: { height: 55, minWidth: 240 },

  readAloudButtonOff: { borderRadius: 50, alignSelf: 'center', overflow: 'hidden', backgroundColor: '#cccccc', height: 48, minWidth: 160, width: 200, justifyContent: 'center' },

  gradientFill: { flex: 1, borderRadius: 50, justifyContent: 'center' },
  readButtonTouchable: { flex: 1, justifyContent: 'center' },
  readButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },

  readText: { color: '#fff', fontWeight: '600', marginRight: 10, fontSize: 16, },
  readTextOff: { color: '#666', fontWeight: '600', marginRight: 10, fontSize: 16 },
  readTextTablet: { fontSize: 20 },

  speakIcon: { width: 30, height: 30, tintColor: '#fff' },
  speakIconOff: { width: 30, height: 30, tintColor: '#666' },
  speakIconTablet: { width: 38, height: 38 },

  buttonDisabled: { opacity: 0.6 },
  ttsNotReadyText: { fontSize: 12, textAlign: 'center', marginTop: 5 },

  clearMessageContainer: { width: '100%', alignItems: 'center' },
  clearMessageContainerTablet: {marginBottom: 20 },

  clearMessageButton: { borderRadius: 50, alignSelf: 'center', overflow: 'hidden', height: 48, minWidth: 200 },
  clearMessageButtonLandscape: { height: 45, minWidth: 180 },
  clearMessageButtonTablet: { height: 60, minWidth: 240 },
  clearMessageButtonTabletLandscape: { height: 55, minWidth: 240 },

  clearMessageGradient: { flex: 1, borderRadius: 50, justifyContent: 'center' },
  clearMessageButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 },
  clearMessageText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  clearMessageTextTablet: { fontSize: 20 },
  clearMessageTextTabletLandscape: { fontSize: 18 },

  // LANDSCAPE BUTTONS CONTAINER
  landscapeButtonsContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', width: '100%' },
  landscapeButtonsContainerTablet: { marginTop: 20 },

  readAloudContainerLandscape: { marginRight: 20 },
  readAloudContainerTabletLandscape: { marginRight: 30 },

  clearMessageContainerLandscape: { marginLeft: 20 },
  clearMessageContainerTabletLandscape: { marginLeft: 30 },

  // MENU BUTTON STYLES
  menuButtonWrapper: { position: 'absolute', top: 40, left: 40, zIndex: 30 },
  menuButtonWrapperTablet: { top: 60, left: 40 },
  menuButtonWrapperLandscape: { top: 40, left: 50 },
  menuGradientButton: { borderRadius: 50, overflow: 'hidden', height: 48, minWidth: 110 },
  menuGradientButtonTablet: { height: 60, minWidth: 160 },
  menuGradientFillLandscape: { 
   width: Platform.select({ 
     ios: Dimensions.get('window').height >= 600 ? 60 : 48, 
     android: Dimensions.get('window').height >= 600 ? 60 : 48 
   }), 
   height: Platform.select({ 
     ios: Dimensions.get('window').height >= 600 ? 60 : 48, 
     android: Dimensions.get('window').height >= 600 ? 60 : 48 
   }),
   borderRadius: Platform.select({ 
     ios: Dimensions.get('window').height >= 600 ? 30 : 24, 
     android: Dimensions.get('window').height >= 600 ? 30 : 24 
   }),
 },
  menuGradientFill: { flex: 1, borderRadius: 50, justifyContent: 'center' },
  menuButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  menuButtonContentLandscape: { paddingHorizontal: 0 },
  menuButtonIcon: { width: 20, height: 20, tintColor: '#fff', marginRight: 8 },
  menuButtonIconTablet: { width: 25, height: 25 },
  menuButtonIconLandscape: { marginRight: 0 },
  menuButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  menuButtonTextTablet: { fontSize: 18 },

  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 10 },
  overlayTouchable: { flex: 1 },
});