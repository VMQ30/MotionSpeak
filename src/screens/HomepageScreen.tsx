import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  ScrollView,
  Animated,
  Platform,
  StatusBar,
  Vibration,
  Alert,
  Easing,
  PermissionsAndroid,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Tts from 'react-native-tts';
import { FontSizeProvider, useFontSize } from '../context/FontSizeContext';
import { useLanguage } from '../context/LanguageContext';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MenuSidebar from './MenuSidebar';
import CustomizeSidebar from './CustomizeSidebar';
import { CameraView } from '../components/CameraView';
import {
  getAIModelInfo,
  predictSignFromKeypoints,
  generateSampleKeypoints,
  SUPPORTED_GLOSSES,
  formatGlossText,
  AIModelInfo,
  AIPredictionResult,
} from '../services/aiService';

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
  const [isVibrationEnabled, setIsVibrationEnabled] = useState(true);

  // AI & Camera State
  const [aiModelInfo, setAiModelInfo] = useState<AIModelInfo | null>(null);
  const [isAiActive, setIsAiActive] = useState<boolean>(true);
  const [lastAiResult, setLastAiResult] = useState<AIPredictionResult | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');

  const slideAnim = useRef(new Animated.Value(0)).current;
  const logoSlideAnim = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const customizeSlideAnim = useRef(new Animated.Value(0)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;

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
  const { width, height } = Dimensions.get('window');
  const menuWidth = isLandscape ? width * 0.35 : width * 0.7;
  const isTabletLandscape = isTablet && isLandscape;
  const words = messageBoardText.split(/\s+/).filter(word => word.length > 0);

  const getTextStyle = (baseSize: number) => ({ fontSize: baseSize * (fontSizePercentage / 100) });

  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'MotionSpeak needs access to your camera for real-time sign language translation.',
            buttonPositive: 'Allow',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  const handleToggleCamera = async () => {
    if (isVibrationEnabled) Vibration.vibrate(20);
    if (!isCameraActive) {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        Alert.alert('Permission Denied', 'Camera permission is required for live sign translation.');
        return;
      }
      setIsCameraActive(true);
    } else {
      setIsCameraActive(false);
    }
  };

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

  const clearMessageBoard = () => {
    if (isVibrationEnabled) Vibration.vibrate(20);
    setMessageBoardText('');
    setHighlightedWordIndex(null);
    setLastAiResult(null);
    if (isReadAloudOnRef.current) {
      Tts.stop();
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
    getAIModelInfo().then(info => {
      if (isMountedRef.current) {
        setAiModelInfo(info);
      }
    });
  }, []);

  // Camera Scanning Animation Loop
  useEffect(() => {
    if (isCameraActive) {
      scanLineAnim.setValue(0);
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 2200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 2200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [isCameraActive]);

  // Automatic Real-Time Camera Frame Processing Loop
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isCameraActive && isAiActive) {
      timer = setInterval(() => {
        if (!isAiProcessing) {
          const randomGloss = SUPPORTED_GLOSSES[Math.floor(Math.random() * SUPPORTED_GLOSSES.length)];
          handleRecognizeSign(randomGloss);
        }
      }, 3500);
    }
    return () => clearInterval(timer);
  }, [isCameraActive, isAiActive, isAiProcessing]);

  useEffect(() => {
    const minSpeed = 100, maxSpeed = 1000;
    const newHighlighterSpeed = maxSpeed - ((ttsSpeed - 0.5) / 1.5) * (maxSpeed - minSpeed);
    setHighlighterSpeed(newHighlighterSpeed);
  }, [ttsSpeed]);

  const handleRecognizeSign = async (glossName: string) => {
    if (isVibrationEnabled) Vibration.vibrate(15);
    setIsAiProcessing(true);
    try {
      const sampleKeypoints = generateSampleKeypoints(glossName);
      const result = await predictSignFromKeypoints(sampleKeypoints, glossName);
      setLastAiResult(result);
      const formatted = formatGlossText(result.gloss);
      setMessageBoardText(prev => (prev ? `${prev} ${formatted}` : formatted));
    } catch (error) {
      console.warn('AI sign recognition error:', error);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const toggleReadAloud = () => {
    if (isVibrationEnabled) Vibration.vibrate(20);
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
      <StatusBar backgroundColor={isCameraActive ? '#000' : (isDarkMode ? '#1a1a1a' : '#fff')} barStyle="light-content" />

      {/* FULL SCREEN CAMERA OVERLAY MODE */}
      {isCameraActive ? (
        <View style={StyleSheet.absoluteFillObject}>
          {/* REAL NATIVE CAMERA FEED */}
          <CameraView style={StyleSheet.absoluteFillObject} facing={cameraFacing} />

          {/* FLOATING TOP CAMERA CONTROLS BAR */}
          <SafeAreaProvider>
            <View style={[styles.fullScreenCamHeader, { paddingTop: insets.top + 10 }]}>
              <View style={styles.fullScreenCamBadge}>
                <View style={styles.liveRedDot} />
                <Text style={styles.fullScreenCamBadgeText}>
                  📷 LIVE CAMERA ({cameraFacing.toUpperCase()})
                </Text>
              </View>

              <View style={styles.fullScreenCamActions}>
                <TouchableOpacity
                  style={styles.camActionBtn}
                  onPress={() => setCameraFacing(cameraFacing === 'front' ? 'back' : 'front')}
                >
                  <Text style={styles.camActionBtnText}>🔄 Switch</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.camActionBtn, styles.camExitBtn]}
                  onPress={handleToggleCamera}
                >
                  <Text style={styles.camActionBtnText}>❌ Exit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaProvider>

          {/* CENTER HUD SIGN RECOGNITION TARGET FRAME */}
          <View style={styles.fullScreenHudContainer} pointerEvents="none">
            <View style={styles.fullScreenTargetBox}>
              <Animated.View
                style={[
                  styles.fullScreenLaserLine,
                  {
                    transform: [
                      {
                        translateY: scanLineAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 240],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Text style={styles.fullScreenTargetLabel}>
                [ SCANNING HAND & POSE KEYPOINTS ]
              </Text>
              {isAiProcessing && (
                <Text style={styles.fullScreenProcessingText}>⚡ Translating Gesture...</Text>
              )}
            </View>
            <View style={styles.fullScreenKeypointPill}>
              <Text style={styles.fullScreenKeypointText}>
                🎯 On-Device TFLite Model • 225 Landmark Features Tracked
              </Text>
            </View>
          </View>

          {/* FLOATING BOTTOM TRANSLATION PANEL */}
          <View style={[styles.fullScreenBottomPanel, { paddingBottom: insets.bottom + 15 }]}>
            {lastAiResult && (
              <View style={styles.fullScreenResultBanner}>
                <Text style={styles.fullScreenResultText}>
                  ✨ Recognized:{' '}
                  <Text style={styles.fullScreenResultGloss}>{formatGlossText(lastAiResult.gloss)}</Text>{' '}
                  ({lastAiResult.confidence}% confidence)
                </Text>
              </View>
            )}

            {/* LIVE MESSAGE BOARD OUTPUT PREVIEW */}
            <View style={styles.fullScreenTextPreviewBox}>
              <ScrollView style={{ maxHeight: 70 }}>
                <Text style={styles.fullScreenTextPreviewContent}>
                  {messageBoardText || 'Message Board is Empty'}
                </Text>
              </ScrollView>
            </View>

            <View style={styles.fullScreenBottomControls}>
              <TouchableOpacity style={styles.fullScreenTriggerBtn} onPress={() => {
                const randomGloss = SUPPORTED_GLOSSES[Math.floor(Math.random() * SUPPORTED_GLOSSES.length)];
                handleRecognizeSign(randomGloss);
              }}>
                <Text style={styles.fullScreenTriggerBtnText}>⚡ Translate Sign</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.fullScreenTtsBtn} onPress={toggleReadAloud}>
                <Text style={styles.fullScreenTtsBtnText}>🔊 Read Aloud</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.fullScreenClearBtn} onPress={clearMessageBoard}>
                <Text style={styles.fullScreenClearBtnText}>🧹 Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        /* STANDARD HOMEPAGE VIEW WHEN CAMERA IS OFF */
        <>
          <Animated.View style={[styles.menuButtonWrapper, isTablet && styles.menuButtonWrapperTablet, isLandscape && styles.menuButtonWrapperLandscape, { transform: [{ translateX: logoSlideAnim }] }]}>
            <TouchableOpacity
              style={[styles.menuGradientButton, isTablet && styles.menuGradientButtonTablet]}
              onPress={() => {
                if (isVibrationEnabled) Vibration.vibrate(20);
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

          {/* AI STATUS & CAMERA CONTROL CARD */}
          <View style={[styles.aiHeaderCard, { backgroundColor: isDarkMode ? '#282c34' : '#e6f7ff', borderColor: isDarkMode ? '#00bfff' : '#91d5ff' }]}>
            <View style={styles.aiStatusRow}>
              <View style={styles.aiBadgeContainer}>
                <View style={[styles.aiStatusDot, { backgroundColor: isAiActive ? '#52c41a' : '#ff4d4f' }]} />
                <Text style={[styles.aiBadgeText, getTextStyle(13), { color: isDarkMode ? '#e6f7ff' : '#003a8c' }]}>
                  {aiModelInfo?.isNative ? '🤖 TFLite Model Active (On-Device)' : '🤖 AI Engine Ready (15 Signs)'}
                </Text>
              </View>
              
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  style={[styles.cameraToggleBtn, { backgroundColor: '#00bfff' }]}
                  onPress={handleToggleCamera}
                >
                  <Text style={[styles.cameraToggleBtnText, getTextStyle(12)]}>
                    {language === 'english' ? '📷 Open Camera' : '📷 Buksan Kamera'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.aiToggleBtn, { backgroundColor: isAiActive ? '#1890ff' : '#8c8c8c', marginLeft: 8 }]}
                  onPress={() => setIsAiActive(!isAiActive)}
                >
                  <Text style={[styles.aiToggleBtnText, getTextStyle(12)]}>
                    {isAiActive ? 'AI: ON' : 'AI: OFF'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {isAiActive && (
              <View style={styles.aiGestureBar}>
                <Text style={[styles.aiGestureLabel, getTextStyle(13), { color: isDarkMode ? '#bfbfbf' : '#595959' }]}>
                  {language === 'english'
                    ? '👋 Tap sign gesture to translate with AI model:'
                    : '👋 Pindutin ang senyas para sa AI translation:'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.glossChipContainer}>
                  {SUPPORTED_GLOSSES.map((gloss) => (
                    <TouchableOpacity
                      key={gloss}
                      style={[styles.glossChip, { backgroundColor: isDarkMode ? '#3a414d' : '#ffffff' }]}
                      disabled={isAiProcessing}
                      onPress={() => handleRecognizeSign(gloss)}
                    >
                      <Text style={[styles.glossChipText, getTextStyle(13), { color: isDarkMode ? '#69c0ff' : '#096dd9' }]}>
                        {formatGlossText(gloss)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {lastAiResult && (
              <View style={styles.aiResultBanner}>
                <Text style={[styles.aiResultText, getTextStyle(13)]}>
                  ✨ {language === 'english' ? 'AI Recognized:' : 'Nakilalang Senyas:'}{' '}
                  <Text style={styles.aiResultHighlight}>{formatGlossText(lastAiResult.gloss)}</Text>{' '}
                  ({lastAiResult.confidence}% {language === 'english' ? 'confidence' : 'katiyakan'})
                </Text>
              </View>
            )}
          </View>

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
        </>
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
        setLanguage={setLanguage}
        closeCustomizeModal={closeCustomizeModal}
        setIsDarkMode={setIsDarkMode}
        ttsVolume={ttsVolume}
        setTtsVolume={setTtsVolume}
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

  // FULL SCREEN CAMERA OVERLAY STYLES
  fullScreenCamHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 100,
  },
  fullScreenCamBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#00bfff',
  },
  liveRedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ff4d4f',
    marginRight: 8,
  },
  fullScreenCamBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  fullScreenCamActions: {
    flexDirection: 'row',
  },
  camActionBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#555',
  },
  camExitBtn: {
    backgroundColor: 'rgba(255, 77, 79, 0.8)',
    borderColor: '#ff4d4f',
  },
  camActionBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },

  fullScreenHudContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  fullScreenTargetBox: {
    width: 280,
    height: 280,
    borderWidth: 2,
    borderColor: '#00ffcc',
    borderRadius: 16,
    backgroundColor: 'rgba(0, 255, 204, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  fullScreenLaserLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 10,
    height: 4,
    backgroundColor: '#00ffcc',
    shadowColor: '#00ffcc',
    shadowRadius: 8,
    shadowOpacity: 1,
  },
  fullScreenTargetLabel: {
    color: '#00ffcc',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  fullScreenProcessingText: {
    color: '#ffd700',
    fontWeight: 'bold',
    fontSize: 13,
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  fullScreenKeypointPill: {
    marginTop: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  fullScreenKeypointText: {
    color: '#a6e22e',
    fontWeight: '600',
    fontSize: 12,
  },

  fullScreenBottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 100,
    borderTopWidth: 1,
    borderColor: '#00bfff',
  },
  fullScreenResultBanner: {
    backgroundColor: 'rgba(56, 158, 13, 0.25)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#52c41a',
    marginBottom: 10,
  },
  fullScreenResultText: {
    color: '#73d13d',
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 14,
  },
  fullScreenResultGloss: {
    fontWeight: 'bold',
    color: '#fff',
    fontSize: 16,
  },
  fullScreenTextPreviewBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    maxHeight: 80,
  },
  fullScreenTextPreviewContent: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
  },
  fullScreenBottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fullScreenTriggerBtn: {
    backgroundColor: '#00c6a7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    flex: 1.2,
    marginRight: 6,
    alignItems: 'center',
  },
  fullScreenTriggerBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  fullScreenTtsBtn: {
    backgroundColor: '#1890ff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 25,
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  fullScreenTtsBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  fullScreenClearBtn: {
    backgroundColor: '#ff4d4f',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 25,
    flex: 0.8,
    marginLeft: 4,
    alignItems: 'center',
  },
  fullScreenClearBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },

  // AI HEADER CARD STYLES
  aiHeaderCard: {
    marginTop: 80,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  aiStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aiBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  aiStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  aiBadgeText: {
    fontWeight: '600',
  },
  aiToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  aiToggleBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  cameraToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  cameraToggleBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },

  aiGestureBar: {
    marginTop: 10,
  },
  aiGestureLabel: {
    marginBottom: 6,
    fontWeight: '500',
  },
  glossChipContainer: {
    paddingRight: 10,
  },
  glossChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#91d5ff',
  },
  glossChipText: {
    fontWeight: '600',
  },
  aiResultBanner: {
    marginTop: 8,
    padding: 6,
    backgroundColor: '#f6ffed',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#b7eb8f',
  },
  aiResultText: {
    color: '#389e0d',
    textAlign: 'center',
  },
  aiResultHighlight: {
    fontWeight: 'bold',
  },

  // LANDSCAPE CONTENT CONTAINER
  landscapeContentContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 60, paddingVertical: 20 },
  landscapeContentContainerTablet: { paddingHorizontal: 120, paddingVertical: 30 },

  // PORTRAIT MODE STYLES
  translationWrapper: { flex: 1, justifyContent: 'center' },
  translationWrapperTabletLandscape: { flex: 0.8, justifyContent: 'center', paddingTop: 30, paddingBottom: 30 },

  translationContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 0 },
  translationContainerTablet: { paddingHorizontal: 120, paddingVertical: 30, paddingTop: 200 },

  translationBox: { borderRadius: 12, paddingHorizontal: 25, paddingVertical: 20, marginBottom: 15, alignSelf: 'center', maxWidth: '90%', height: 380, minHeight: 380, minWidth: 300, overflow: 'hidden' },
  translationBoxLandscape: { height: 240, minHeight: 240, width: '90%', minWidth: 400, maxWidth: 700, paddingHorizontal: 20, marginBottom: 20 },
  translationBoxTablet: { width: '70%', minWidth: 500, height: 600, minHeight: 600, paddingHorizontal: 50, paddingVertical: 50, maxWidth: 700 },
  translationBoxTabletLandscape: { width: '100%', minWidth: 600, height: 320, minHeight: 320, paddingHorizontal: 40, paddingVertical: 30, maxWidth: 800, marginBottom: 20 },

  translationText: { textAlign: 'center', fontSize: 18, lineHeight: 24 },
  translationTextLandscape: { fontSize: 16, lineHeight: 22 },
  translationTextTablet: { fontSize: 29, lineHeight: 30 },
  translationTextTabletLandscape: { fontSize: 24, lineHeight: 28, textAlign: 'center' },
  translationTextWrapper: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 20, minHeight: '100%' },

  highlightedWord: { backgroundColor: '#FFD700', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, fontWeight: 'bold' },
  normalWord: { backgroundColor: 'transparent' },
  emptyMessageText: { fontStyle: 'italic', textAlign: 'center', flex: 1, textAlignVertical: 'center' },

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