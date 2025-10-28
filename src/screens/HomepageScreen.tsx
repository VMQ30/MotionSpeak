import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Dimensions, ScrollView, Animated, Platform, StatusBar, Vibration, Alert } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Tts from 'react-native-tts';
import { FontSizeProvider, useFontSize } from '../context/FontSizeContext';
import { useLanguage } from '../context/LanguageContext';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MenuSidebar from './MenuSidebar';
import CustomizeSidebar from './CustomizeSidebar';

type Props = { navigation: any };

const HomepageScreenContent: React.FC<Props> = ({ navigation }) => {
  const { language, setLanguage } = useLanguage();
  const { fontSizePercentage, setFontSizePercentage } = useFontSize();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isReadAloudOn, setIsReadAloudOn] = useState(false);
  const [highlightedWordIndex, setHighlightedWordIndex] = useState<number | null>(null);
  const [ttsReady, setTtsReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [ttsVolume, setTtsVolume] = useState(100);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const logoSlideAnim = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const customizeSlideAnim = useRef(new Animated.Value(0)).current;
  const currentWordIndexRef = useRef(-1);
  const isMountedRef = useRef(true);
  const isReadAloudOnRef = useRef(false);

  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [customizeModalVisible, setCustomizeModalVisible] = useState(false);
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [highlighterSpeed, setHighlighterSpeed] = useState(1000);

  const textContent = `The quick brown fox jumps over the lazy dog`;
  const [messageBoardText, setMessageBoardText] = useState(textContent);
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get('window');
  const menuWidth = isLandscape ? width * 0.35 : width * 0.7;
  const isTabletLandscape = isTablet && isLandscape;
  const words = messageBoardText.split(/\s+/).filter(word => word.length > 0);

  const getTextStyle = (baseSize: number) => ({ fontSize: baseSize * (fontSizePercentage / 100) });

  const clearMessageBoard = () => {
    Vibration.vibrate(20);
    setMessageBoardText('');
    setHighlightedWordIndex(null);
    if (isReadAloudOnRef.current) {
      Tts.stop();
      isReadAloudOnRef.current = false;
      setIsReadAloudOn(false);
    }
  };

  useEffect(() => {
    loadDarkModePreference();
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
    const minSpeed = 100, maxSpeed = 1000;
    const newHighlighterSpeed = maxSpeed - ((ttsSpeed - 0.5) / 1.5) * (maxSpeed - minSpeed);
    setHighlighterSpeed(newHighlighterSpeed);
  }, [ttsSpeed]);

  const toggleReadAloud = () => {
    Vibration.vibrate(20);
    if (!ttsReady) {
      Alert.alert('TTS Not Ready', 'Text-to-speech is still initializing');
      return;
    }
    if (isReadAloudOnRef.current) {
      Tts.stop();
      isReadAloudOnRef.current = false;
      setIsReadAloudOn(false);
      setIsSpeaking(false);
      setHighlightedWordIndex(null);
      currentWordIndexRef.current = -1;
    } else {
      isReadAloudOnRef.current = true;
      setIsReadAloudOn(true);
      currentWordIndexRef.current = -1;
      const baseRate = 0.5, calculatedRate = baseRate * ttsSpeed;
      Tts.setDefaultRate(calculatedRate);
      speakNextWord();
    }
  };

  const useTTSVolume = (volume: number) => {
    const volumeRef = useRef(volume);
    
    useEffect(() => {
      volumeRef.current = volume;
    }, [volume]);

    const speakWithVolume = (text: string, rate: number) => {
      Tts.speak(text, {
        androidParams: {
          KEY_PARAM_PAN: 0,
          KEY_PARAM_VOLUME: volumeRef.current / 100,
          KEY_PARAM_STREAM: 'STREAM_MUSIC',
        },
        rate: rate,
        iosVoiceId: 'com.apple.ttsbundle.Samantha-compact',
      } as any);
    };

    return speakWithVolume;
  };

  const speakWithVolume = useTTSVolume(ttsVolume);

  const speakNextWord = () => {
    if (!isReadAloudOnRef.current) return;
    const nextIndex = currentWordIndexRef.current + 1;
    if (nextIndex >= words.length) {
      isReadAloudOnRef.current = false;
      setIsReadAloudOn(false);
      setHighlightedWordIndex(null);
      currentWordIndexRef.current = -1;
      return;
    }
    currentWordIndexRef.current = nextIndex;
    const word = words[nextIndex];
    setHighlightedWordIndex(nextIndex);
    const baseRate = 0.5, calculatedRate = baseRate * ttsSpeed;
    Tts.setDefaultRate(calculatedRate);
    speakWithVolume(word, calculatedRate);
  };

  useEffect(() => {
    isMountedRef.current = true;
    const initTTS = async () => {
      try {
        const status = await Tts.getInitStatus();
        const ttsLanguage = language === 'english' ? 'en-US' : 'fil-PH';
        const baseRate = 0.3, calculatedRate = baseRate * ttsSpeed;
        Tts.setDefaultLanguage(ttsLanguage);
        Tts.setDefaultRate(calculatedRate);
        Tts.setDefaultPitch(1.0);
        // Remove setDefaultVolume since it doesn't exist

        Tts.addEventListener('tts-start', (event) => {
          if (isMountedRef.current) setIsSpeaking(true);
        });
        Tts.addEventListener('tts-finish', () => {
          setIsSpeaking(false);
          if (isReadAloudOnRef.current) speakNextWord();
        });
        Tts.addEventListener('tts-error', (error) => {
          if (isMountedRef.current) {
            setIsSpeaking(false);
            setIsReadAloudOn(false);
            isReadAloudOnRef.current = false;
            setHighlightedWordIndex(null);
            Alert.alert('TTS Error', 'Unable to speak text');
          }
        });
        if (isMountedRef.current) setTtsReady(true);
      } catch (error) {
        if (isMountedRef.current) {
          setTtsReady(false);
          Alert.alert('TTS Error', 'Text-to-speech failed to initialize');
        }
      }
    };
    initTTS();
    return () => {
      isMountedRef.current = false;
      Tts.stop();
      Tts.removeAllListeners('tts-start');
      Tts.removeAllListeners('tts-finish');
      Tts.removeAllListeners('tts-error');
    };
  }, [language, ttsSpeed]);

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

  // Customize Sidebar Animations
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
            Vibration.vibrate(20);
            toggleMenu();
          }}
        >
          <LinearGradient colors={['#0086b3', '#00bfff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.menuGradientFill}>
            <View style={styles.menuButtonContent}>
              <Image source={require('../assets/menu.png')} style={[styles.menuButtonIcon, isTablet && styles.menuButtonIconTablet]} resizeMode="contain" />
              <Text style={[styles.menuButtonText, isTablet && styles.menuButtonTextTablet, getTextStyle(16)]}>
                {language === 'english' ? 'Menu' : 'Menu'}
              </Text>
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
                    <TouchableOpacity style={styles.readButtonTouchable} onPress={toggleReadAloud} disabled={!ttsReady}>
                      <ReadAloudButtonContent />
                    </TouchableOpacity>
                  </LinearGradient>
                </View>
              ) : (
                <TouchableOpacity style={[buttonStyles.container, !ttsReady && styles.buttonDisabled]} onPress={toggleReadAloud} disabled={!ttsReady}>
                  <ReadAloudButtonContent />
                </TouchableOpacity>
              )}
              {!ttsReady && <Text style={[styles.ttsNotReadyText, getTextStyle(14), { color: isDarkMode ? '#888' : '#666' }]}>TTS initializing...</Text>}
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
                    <TouchableOpacity style={styles.readButtonTouchable} onPress={toggleReadAloud} disabled={!ttsReady}>
                      <ReadAloudButtonContent />
                    </TouchableOpacity>
                  </LinearGradient>
                </View>
              ) : (
                <TouchableOpacity style={[buttonStyles.container, isLandscape && styles.gradientButtonLandscape, isTabletLandscape && styles.gradientButtonTabletLandscape, !ttsReady && styles.buttonDisabled]} onPress={toggleReadAloud} disabled={!ttsReady}>
                  <ReadAloudButtonContent />
                </TouchableOpacity>
              )}
              {!ttsReady && <Text style={[styles.ttsNotReadyText, getTextStyle(14), { color: isDarkMode ? '#888' : '#666' }]}>TTS initializing...</Text>}
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
          Vibration.vibrate(20); 
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

      {/* CUSTOMIZE SIDEBAR COMPONENT - NOW HANDLES ALL MODALS INTERNALLY */}
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
        setLanguage={setLanguage}
        closeCustomizeModal={closeCustomizeModal}
        setIsDarkMode={setIsDarkMode}
        ttsVolume={ttsVolume}
        setTtsVolume={setTtsVolume}
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
  translationWrapperTabletLandscape: { flex: 0.8, justifyContent: 'center', paddingTop: 30, paddingBottom: 30 },

  translationContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 0 },
  translationContainerTablet: { paddingHorizontal: 120, paddingVertical: 30, paddingTop: 200 },

  translationBox: { borderRadius: 12, paddingHorizontal: 25, paddingVertical: 30, marginBottom: 15, alignSelf: 'center', maxWidth: '90%', height: 510, overflow: 'hidden' },
  translationBoxLandscape: { height: 280, width: '90%', maxWidth: 700, paddingHorizontal: 20, marginBottom: 30 },
  translationBoxTablet: { width: '70%', height: 780, paddingHorizontal: 50, paddingVertical: 50, maxWidth: 700 },
  translationBoxTabletLandscape: { width: '100%', height: 400, paddingHorizontal: 40, paddingVertical: 30, maxWidth: 800, marginBottom: 40 },

  translationText: { textAlign: 'center', fontSize: 18, lineHeight: 24 },
  translationTextLandscape: { fontSize: 16, lineHeight: 22 },
  translationTextTablet: { fontSize: 29, lineHeight: 30 },
  translationTextTabletLandscape: { fontSize: 24, lineHeight: 28, textAlign: 'center' },
  translationTextWrapper: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 20 },

  highlightedWord: { backgroundColor: '#FFD700', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, fontWeight: 'bold' },
  normalWord: { backgroundColor: 'transparent' },
  emptyMessageText: { fontStyle: 'italic', textAlign: 'center' },

  // PORTRAIT BUTTONS
  buttonsContainer: { width: '100%', alignItems: 'center', paddingBottom: 20 },
  buttonsContainerTablet: { paddingBottom: 40 },

  readAloudContainer: { width: '100%', alignItems: 'center', marginBottom: 15 },
  readAloudContainerTablet: { marginBottom: 20 },

  gradientButton: { borderRadius: 50, alignSelf: 'center', overflow: 'hidden', height: 48, minWidth: 160 },
  gradientButtonLandscape: { marginBottom: 0, height: 45, minWidth: 150 },
  gradientButtonTablet: { height: 60, minWidth: 240 },
  gradientButtonTabletLandscape: { height: 55, minWidth: 200 },

  readAloudButtonOff: { borderRadius: 50, alignSelf: 'center', overflow: 'hidden', backgroundColor: '#cccccc', height: 48, minWidth: 160, justifyContent: 'center' },

  gradientFill: { flex: 1, borderRadius: 50, justifyContent: 'center' },
  readButtonTouchable: { flex: 1, justifyContent: 'center' },
  readButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },

  readText: { color: '#fff', fontWeight: '600', marginRight: 10, fontSize: 16 },
  readTextOff: { color: '#666', fontWeight: '600', marginRight: 10, fontSize: 16 },
  readTextTablet: { fontSize: 20 },

  speakIcon: { width: 30, height: 30, tintColor: '#fff' },
  speakIconOff: { width: 30, height: 30, tintColor: '#666' },
  speakIconTablet: { width: 38, height: 38 },

  buttonDisabled: { opacity: 0.6 },
  ttsNotReadyText: { fontSize: 12, textAlign: 'center', marginTop: 5 },

  clearMessageContainer: { width: '100%', alignItems: 'center' },
  clearMessageContainerTablet: {},

  clearMessageButton: { borderRadius: 50, alignSelf: 'center', overflow: 'hidden', height: 48, minWidth: 200 },
  clearMessageButtonLandscape: { height: 45, minWidth: 180 },
  clearMessageButtonTablet: { height: 60, minWidth: 280 },
  clearMessageButtonTabletLandscape: { height: 55, minWidth: 220 },

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
  menuButtonWrapper: { position: 'absolute', top: 35, left: 20, zIndex: 30 },
  menuButtonWrapperTablet: { top: 60, left: 40 },
  menuButtonWrapperLandscape: { top: 25, left: 20 },
  menuGradientButton: { borderRadius: 50, overflow: 'hidden', height: 48, minWidth: 120 },
  menuGradientButtonTablet: { height: 60, minWidth: 160 },
  menuGradientFill: { flex: 1, borderRadius: 50, justifyContent: 'center' },
  menuButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  menuButtonIcon: { width: 20, height: 20, tintColor: '#fff', marginRight: 8 },
  menuButtonIconTablet: { width: 25, height: 25 },
  menuButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  menuButtonTextTablet: { fontSize: 18 },

  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 10 },
  overlayTouchable: { flex: 1 },
});