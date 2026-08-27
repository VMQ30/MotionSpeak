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
  PanResponder,
  NativeModules,
  NativeEventEmitter,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Tts from 'react-native-tts';
import { FontSizeProvider, useFontSize } from '../context/FontSizeContext';
import { useLanguage } from '../context/LanguageContext';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
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
  const [highlightedWordIndex, setHighlightedWordIndex] = useState<
    number | null
  >(null);
  const [ttsReady, setTtsReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [ttsVolume, setTtsVolume] = useState(100);
  const [isVibrationEnabled, setIsVibrationEnabled] = useState(true);

  // AI & Camera State
  const [aiModelInfo, setAiModelInfo] = useState<AIModelInfo | null>(null);
  const [isAiActive, setIsAiActive] = useState<boolean>(true);
  const [lastAiResult, setLastAiResult] = useState<AIPredictionResult | null>(
    null,
  );
  const [isAiProcessing, setIsAiProcessing] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [isHandDetected, setIsHandDetected] = useState<boolean>(false);
  const [isGestureRecognized, setIsGestureRecognized] =
    useState<boolean>(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebugLogs, setShowDebugLogs] = useState<boolean>(false);
  const lastHandDetectionTimeRef = useRef<number>(0);
  const lastGestureRecognizedTimeRef = useRef<number>(0);
  const debugScrollViewRef = useRef<ScrollView>(null);

  const addDebugLog = (msg: string) => {
    const timeStr = new Date().toISOString().split('T')[1].slice(0, 8);
    const logLine = `[${timeStr}] ${msg}`;
    console.log(`[MotionSpeak AI Debug] ${logLine}`);
    setDebugLogs(prev => [...prev.slice(-49), logLine]);
  };

  // Draggable Drawer State
  const drawerAnim = useRef(new Animated.Value(0)).current;
  const [isDrawerCollapsed, setIsDrawerCollapsed] = useState(false);

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
  const { width, height } = Dimensions.get('window');
  const menuWidth = isLandscape ? width * 0.35 : width * 0.7;
  const isTabletLandscape = isTablet && isLandscape;
  const words = messageBoardText.split(/\s+/).filter(word => word.length > 0);

  // Safe Inset Calculations to prevent collision with Android System Navigation Bar & Notch
  const safeTopPadding =
    Math.max(insets.top, Platform.OS === 'android' ? 36 : 20) + 10;
  const safeBottomPadding =
    Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 34) + 16;
  const collapseOffset = 190;

  const getTextStyle = (baseSize: number) => ({
    fontSize: baseSize * (fontSizePercentage / 100),
  });

  // Smooth PanResponder for Real-Time Dragging
  const drawerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 4,
      onMoveShouldSetPanResponderCapture: (_, gestureState) =>
        Math.abs(gestureState.dy) > 4,
      onPanResponderGrant: () => {
        drawerAnim.extractOffset();
      },
      onPanResponderMove: (_, gestureState) => {
        drawerAnim.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        drawerAnim.flattenOffset();
        if (gestureState.dy > 50 || gestureState.vy > 0.3) {
          setIsDrawerCollapsed(true);
          Animated.timing(drawerAnim, {
            toValue: collapseOffset,
            duration: 250,
            useNativeDriver: false,
          }).start();
        } else if (gestureState.dy < -50 || gestureState.vy < -0.3) {
          setIsDrawerCollapsed(false);
          Animated.timing(drawerAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: false,
          }).start();
        } else {
          const currentVal = (drawerAnim as any)._value || 0;
          const snapTo = currentVal > collapseOffset / 2 ? collapseOffset : 0;
          setIsDrawerCollapsed(snapTo > 0);
          Animated.timing(drawerAnim, {
            toValue: snapTo,
            duration: 200,
            useNativeDriver: false,
          }).start();
        }
      },
    }),
  ).current;

  const toggleDrawerPosition = () => {
    if (isVibrationEnabled) Vibration.vibrate(15);
    drawerAnim.flattenOffset();
    if (isDrawerCollapsed) {
      setIsDrawerCollapsed(false);
      Animated.timing(drawerAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: false,
      }).start();
    } else {
      setIsDrawerCollapsed(true);
      Animated.timing(drawerAnim, {
        toValue: collapseOffset,
        duration: 250,
        useNativeDriver: false,
      }).start();
    }
  };

  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message:
              'MotionSpeak needs access to your camera for real-time sign language translation.',
            buttonPositive: 'Allow',
          },
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
        Alert.alert(
          language === 'english'
            ? 'Permission Denied'
            : 'Pahintulot ay Tinanggihan',
          language === 'english'
            ? 'Camera permission is required for live sign translation.'
            : 'Kailangan ang pahintulot sa camera para sa live sign translation.',
        );
        return;
      }
      drawerAnim.flattenOffset();
      drawerAnim.setValue(0);
      setIsDrawerCollapsed(false);
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

  // Cooldown tracking to prevent duplicate word spamming when holding a sign
  const lastAddedGlossRef = useRef<string>('');
  const lastAddedTimeRef = useRef<number>(0);

  // Automatic Real-Time Continuous MediaPipe Camera Processing Loop (~13-15 fps)
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isCameraActive && isAiActive) {
      timer = setInterval(() => {
        if (!isAiProcessing) {
          processRealtimeCameraFrame();
        }
      }, 75);
    }
    return () => clearInterval(timer);
  }, [isCameraActive, isAiActive, isAiProcessing]);

  // Set initial hand detection state when camera opens
  useEffect(() => {
    if (isCameraActive) {
      setIsHandDetected(true);
      setIsGestureRecognized(false);
      lastHandDetectionTimeRef.current = Date.now();
      lastGestureRecognizedTimeRef.current = 0;
      lastAddedGlossRef.current = '';
      lastAddedTimeRef.current = 0;
    }
  }, [isCameraActive]);

  // Periodic check: if no hand activity for >5s, set isHandDetected=false; if gesture un-updated for >3.5s, set isGestureRecognized=false
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isCameraActive) {
      interval = setInterval(() => {
        const now = Date.now();
        if (
          lastHandDetectionTimeRef.current > 0 &&
          now - lastHandDetectionTimeRef.current > 5000
        ) {
          setIsHandDetected(false);
          setIsGestureRecognized(false);
        } else if (
          lastGestureRecognizedTimeRef.current > 0 &&
          now - lastGestureRecognizedTimeRef.current > 3500
        ) {
          setIsGestureRecognized(false);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isCameraActive]);

  // Native event listener for onSignDetected (if emitted natively)
  useEffect(() => {
    if (NativeModules.MotionSpeakModule) {
      try {
        const motionSpeakEmitter = new NativeEventEmitter(
          NativeModules.MotionSpeakModule,
        );
        const subscription = motionSpeakEmitter.addListener(
          'onSignDetected',
          (event: {
            label?: string;
            confidence?: number;
            isHandDetected?: boolean;
          }) => {
            const now = Date.now();
            const labelLower = (event?.label || '').toLowerCase();
            const isUnknown = !event?.label || labelLower === 'unknown';
            const isSupported = SUPPORTED_GLOSSES.includes(labelLower);
            const confPercent = Math.round((event?.confidence || 0) * 100);

            if (event?.isHandDetected === false || isUnknown || !isSupported) {
              return;
            }

            setIsHandDetected(true);
            lastHandDetectionTimeRef.current = now;

            if (isCameraActive && isAiActive && confPercent >= 65) {
              setIsGestureRecognized(true);
              lastGestureRecognizedTimeRef.current = now;
              const formatted = formatGlossText(event.label!);
              setLastAiResult({
                gloss: event.label!,
                confidence: confPercent,
                status: 'success',
                isNative: true,
              });

              if (
                lastAddedGlossRef.current !== formatted ||
                now - lastAddedTimeRef.current > 2500
              ) {
                lastAddedGlossRef.current = formatted;
                lastAddedTimeRef.current = now;
                if (isVibrationEnabled) Vibration.vibrate(15);
                setMessageBoardText(prev =>
                  prev ? `${prev} ${formatted}` : formatted,
                );
              }
            }
          },
        );
        return () => subscription.remove();
      } catch (e) {
        console.warn('Native emitter sub error:', e);
      }
    }
  }, [isCameraActive, isAiActive, isVibrationEnabled]);

  useEffect(() => {
    const minSpeed = 100,
      maxSpeed = 1000;
    const newHighlighterSpeed =
      maxSpeed - ((ttsSpeed - 0.5) / 1.5) * (maxSpeed - minSpeed);
    setHighlighterSpeed(newHighlighterSpeed);
  }, [ttsSpeed]);

  const processRealtimeCameraFrame = async () => {
    setIsAiProcessing(true);
    try {
      const result = await predictSignFromKeypoints();
      const now = Date.now();

      if (result.fingerTrackingSummary) {
        addDebugLog(`👉 ${result.fingerTrackingSummary}`);
      }
      if (result.topPredictions) {
        addDebugLog(`🎯 ${result.topPredictions}`);
      }

      if (!result.isHandDetected || result.status === 'no_hand') {
        setIsHandDetected(false);
        setIsGestureRecognized(false);
        setLastAiResult(null);
        lastAddedGlossRef.current = '';
        addDebugLog(`========== FSL DEBUG ==========`);
        addDebugLog(`Decision: NO HAND DETECTED (${result.status})`);
      } else if (result.status === 'scanning') {
        setIsHandDetected(true);
        lastHandDetectionTimeRef.current = now;
        if (now - lastGestureRecognizedTimeRef.current > 1500) {
          setIsGestureRecognized(false);
          setLastAiResult(null);
        }
        addDebugLog(`========== FSL DEBUG ==========`);
        addDebugLog(`Decision: HAND DETECTED | Accumulating history frames...`);
      } else if (
        !result.isGestureRecognized ||
        result.status === 'unrecognized'
      ) {
        setIsHandDetected(true);
        lastHandDetectionTimeRef.current = now;
        if (now - lastGestureRecognizedTimeRef.current > 2000) {
          setIsGestureRecognized(false);
          setLastAiResult(null);
        }
        addDebugLog(`========== FSL DEBUG ==========`);
        addDebugLog(`Decision: HAND DETECTED | Transition / Unrecognized Gesture`);
      } else if (result.status === 'success' && result.gloss) {
        setIsHandDetected(true);
        setIsGestureRecognized(true);
        lastHandDetectionTimeRef.current = now;
        lastGestureRecognizedTimeRef.current = now;
        setLastAiResult(result);
        const formatted = formatGlossText(result.gloss);
        addDebugLog(`========== FSL DEBUG ==========`);
        addDebugLog(
          `Decision: SIGN RECOGNIZED | Gloss="${formatted}" (${result.confidence}%)`,
        );

        if (
          lastAddedGlossRef.current !== formatted ||
          now - lastAddedTimeRef.current > 2500
        ) {
          lastAddedGlossRef.current = formatted;
          lastAddedTimeRef.current = now;
          if (isVibrationEnabled) Vibration.vibrate(15);
          setMessageBoardText(prev =>
            prev ? `${prev} ${formatted}` : formatted,
          );
        }
      }
    } catch (error: any) {
      console.warn('AI sign recognition error:', error);
      addDebugLog(`Frame check error: ${error?.message || error}`);
      setIsGestureRecognized(false);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const toggleReadAloud = () => {
    if (isVibrationEnabled) Vibration.vibrate(20);
    if (!ttsReady) {
      Alert.alert(
        language === 'english' ? 'TTS Not Ready' : 'Hindi Pa Handa ang TTS',
        language === 'english'
          ? 'Text-to-speech is still initializing'
          : 'Inihahanda pa ang text-to-speech',
      );
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
      const baseRate = 0.5,
        calculatedRate = baseRate * ttsSpeed;
      Tts.setDefaultRate(calculatedRate);
      speakNextWord();
    }
  };

  const ttsVolumeRef = useRef(ttsVolume);
  useEffect(() => {
    ttsVolumeRef.current = ttsVolume;
  }, [ttsVolume]);

  const speakWithVolume = (text: string, rate: number) => {
    Tts.speak(text, {
      androidParams: {
        KEY_PARAM_PAN: 0,
        KEY_PARAM_VOLUME: ttsVolumeRef.current / 100,
        KEY_PARAM_STREAM: 'STREAM_MUSIC',
      },
      rate: rate,
      iosVoiceId: 'com.apple.ttsbundle.Samantha-compact',
    } as any);
  };

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
    const baseRate = 0.5,
      calculatedRate = baseRate * ttsSpeed;
    Tts.setDefaultRate(calculatedRate);
    speakWithVolume(word, calculatedRate);
  };

  useEffect(() => {
    isMountedRef.current = true;
    const initTTS = async () => {
      try {
        const status = await Tts.getInitStatus();
        const ttsLanguage = language === 'english' ? 'en-US' : 'fil-PH';
        const baseRate = 0.3,
          calculatedRate = baseRate * ttsSpeed;
        Tts.setDefaultLanguage(ttsLanguage);
        Tts.setDefaultRate(calculatedRate);
        Tts.setDefaultPitch(1.0);

        Tts.addEventListener('tts-start', event => {
          if (isMountedRef.current) setIsSpeaking(true);
        });
        Tts.addEventListener('tts-finish', () => {
          setIsSpeaking(false);
          if (isReadAloudOnRef.current) speakNextWord();
        });
        Tts.addEventListener('tts-error', error => {
          if (isMountedRef.current) {
            setIsSpeaking(false);
            setIsReadAloudOn(false);
            isReadAloudOnRef.current = false;
            setHighlightedWordIndex(null);
            Alert.alert(
              language === 'english' ? 'TTS Error' : 'Error sa TTS',
              language === 'english'
                ? 'Unable to speak text'
                : 'Hindi mabigkas ang teksto',
            );
          }
        });
        if (isMountedRef.current) setTtsReady(true);
      } catch (error) {
        if (isMountedRef.current) {
          setTtsReady(false);
          Alert.alert(
            language === 'english' ? 'TTS Error' : 'Error sa TTS',
            language === 'english'
              ? 'Text-to-speech failed to initialize'
              : 'Bumagsak ang inisyalisasyon ng text-to-speech',
          );
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
    const handleChange = ({
      window,
    }: {
      window: { width: number; height: number };
    }) => {
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
        Animated.timing(customizeSlideAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
      setTimeout(() => setCustomizeModalVisible(true), 10);
    } else {
      Animated.parallel([
        Animated.timing(customizeSlideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCustomizeModalVisible(false);
      });
    }
  }, [showCustomizeModal]);

  const closeCustomizeModal = () => {
    setShowCustomizeModal(false);
  };

  const toggleMenu = () => {
    const toValue = menuOpen ? 0 : 1;
    const overlayToValue = menuOpen ? 0 : 0.5;
    const logoToValue = menuOpen ? 0 : -200;

    setMenuOpen(prev => !prev);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: overlayToValue,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(logoSlideAnim, {
        toValue: logoToValue,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(logoSlideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const slideStyle = {
    transform: [
      {
        translateX: slideAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-menuWidth, 0],
        }),
      },
    ],
  };
  const customizeSlideStyle = {
    transform: [
      {
        translateX: customizeSlideAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-menuWidth, 0],
        }),
      },
    ],
  };
  const overlayStyle = { opacity: overlayOpacity };

  const getButtonStyles = () => {
    if (isReadAloudOn) {
      return {
        container: [
          styles.gradientButton,
          isLandscape && styles.gradientButtonLandscape,
          isTablet && styles.gradientButtonTablet,
        ],
        text: [styles.readText, isTablet && styles.readTextTablet],
        icon: [styles.speakIcon, isTablet && styles.speakIconTablet],
        gradient: true,
      };
    } else {
      return {
        container: [
          styles.readAloudButtonOff,
          isLandscape && styles.gradientButtonLandscape,
          isTablet && styles.gradientButtonTablet,
        ],
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
          ? language === 'english'
            ? 'Reading...'
            : 'Nagbabasa...'
          : language === 'english'
          ? 'Read Aloud'
          : 'Basahin nang Malakas'}
      </Text>
      <Image
        source={require('../assets/speak.png')}
        style={buttonStyles.icon}
        resizeMode="contain"
      />
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        isLandscape && styles.landscapeContainer,
        isTablet && styles.tabletContainer,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          backgroundColor: isDarkMode ? '#1a1a1a' : '#fff',
        },
      ]}
    >
      <StatusBar
        backgroundColor={
          isCameraActive ? '#000' : isDarkMode ? '#1a1a1a' : '#fff'
        }
        barStyle="light-content"
      />

      {/* FULL SCREEN CAMERA OVERLAY MODE */}
      {isCameraActive ? (
        <View style={StyleSheet.absoluteFillObject}>
          {/* REAL PHYSICAL CAMERA VIDEO FEED */}
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing={cameraFacing}
          />

          {/* FLOATING TOP CAMERA CONTROLS BAR (SAFE AREA PADDED) */}
          <SafeAreaProvider>
            <View
              style={[
                styles.fullScreenCamHeader,
                { paddingTop: safeTopPadding },
              ]}
            >
              <View
                style={[
                  styles.topCamControlsCard,
                  {
                    backgroundColor: isDarkMode
                      ? 'rgba(26, 26, 26, 0.95)'
                      : 'rgba(255, 255, 255, 0.96)',
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.camPillActionBtn}
                  onPress={() => {
                    if (isVibrationEnabled) Vibration.vibrate(20);
                    setCameraFacing(
                      cameraFacing === 'front' ? 'back' : 'front',
                    );
                  }}
                >
                  <Text style={[styles.camActionBtnText, getTextStyle(13)]}>
                    {language === 'english' ? '🔄 Switch' : '🔄 Palitan'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.camPillActionBtn}
                  onPress={() => {
                    if (isVibrationEnabled) Vibration.vibrate(20);
                    setShowDebugLogs(prev => !prev);
                  }}
                >
                  <Text style={[styles.camActionBtnText, getTextStyle(13)]}>
                    {showDebugLogs ? '📊 Hide Logs' : '📊 Debug Logs'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.camPillActionBtn, styles.camExitPillBtn]}
                  onPress={handleToggleCamera}
                >
                  <Text style={[styles.camActionBtnText, getTextStyle(13)]}>
                    {language === 'english' ? '❌ Exit' : '❌ Lumabas'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* REAL-TIME AI TELEMETRY DEBUG LOG OVERLAY */}
            {showDebugLogs && (
              <View style={styles.debugLogOverlayBox}>
                <Text style={styles.debugLogTitle}>
                  📊 MediaPipe AI Diagnostic Logs
                </Text>
                <ScrollView
                  ref={debugScrollViewRef}
                  style={styles.debugLogScroll}
                  nestedScrollEnabled={true}
                  onContentSizeChange={() => {
                    debugScrollViewRef.current?.scrollToEnd({ animated: true });
                  }}
                >
                  {debugLogs.length === 0 ? (
                    <Text style={styles.debugLogText}>
                      Initializing AI frame scanner logs...
                    </Text>
                  ) : (
                    debugLogs.map((log, idx) => (
                      <Text key={idx} style={styles.debugLogText}>
                        {log}
                      </Text>
                    ))
                  )}
                </ScrollView>
              </View>
            )}
          </SafeAreaProvider>

          {/* CENTER HUD SIGN RECOGNITION TARGET FRAME (EXPANDED TO TAKE UP MORE SCREEN) */}
          <View
            style={[
              styles.fullScreenHudContainer,
              {
                paddingTop: safeTopPadding + 10,
                paddingBottom: safeBottomPadding + 10,
              },
            ]}
            pointerEvents="none"
          >
            <View
              style={[
                styles.fullScreenTargetBox,
                !isHandDetected
                  ? styles.fullScreenTargetBoxNoHand
                  : isGestureRecognized
                  ? styles.fullScreenTargetBoxRecognized
                  : styles.fullScreenTargetBoxUnrecognized,
                { width: width - 20, height: height * 0.78 },
              ]}
            />
          </View>

          {/* FLOATING REAL-TIME DRAGGABLE BOTTOM DRAWER (ELEVATED ABOVE SYSTEM BUTTONS) */}
          <Animated.View
            style={[
              styles.fullScreenBottomPanel,
              {
                paddingBottom: safeBottomPadding,
                backgroundColor: isDarkMode
                  ? 'rgba(26, 26, 26, 0.95)'
                  : 'rgba(255, 255, 255, 0.96)',
                transform: [{ translateY: drawerAnim }],
              },
            ]}
          >
            {/* DRAG HANDLE BAR FOR TOUCH & GESTURE DRAGGING */}
            <View
              {...drawerPanResponder.panHandlers}
              style={styles.drawerDragHandleContainer}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={toggleDrawerPosition}
                style={{ alignItems: 'center' }}
              >
                <View style={styles.drawerDragIndicator} />
                <Text style={[styles.drawerDragHelpText, getTextStyle(11)]}>
                  {isDrawerCollapsed
                    ? language === 'english'
                      ? '▲ Tap or drag up to expand'
                      : '▲ Pindutin o i-drag pataas para palakihin'
                    : language === 'english'
                    ? '▼ Drag down to collapse drawer'
                    : '▼ I-drag pababa para itago'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: height * 0.4 }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={true}
            >
              {/* LIVE MESSAGE BOARD OUTPUT PREVIEW */}
              <View
                style={[
                  styles.fullScreenTextPreviewBox,
                  { backgroundColor: isDarkMode ? '#2a2a2a' : '#f2f2f2' },
                ]}
              >
                <ScrollView
                  style={{ maxHeight: 75 }}
                  contentContainerStyle={styles.translationTextWrapper}
                >
                  <Text
                    style={[
                      styles.fullScreenTextPreviewContent,
                      getTextStyle(16),
                      { color: isDarkMode ? '#fff' : '#333' },
                    ]}
                  >
                    {messageBoardText ? (
                      words.map((word, index) => (
                        <Text
                          key={index}
                          style={[
                            index === highlightedWordIndex
                              ? styles.highlightedWord
                              : styles.normalWord,
                            getTextStyle(16),
                            { color: isDarkMode ? '#fff' : '#333' },
                          ]}
                        >
                          {word + ' '}
                        </Text>
                      ))
                    ) : (
                      <Text
                        style={[
                          styles.emptyMessageText,
                          getTextStyle(16),
                          { color: isDarkMode ? '#888' : '#999' },
                        ]}
                      >
                        {language === 'english'
                          ? 'Message board is empty'
                          : 'Walang laman ang message board'}
                      </Text>
                    )}
                  </Text>
                </ScrollView>
              </View>

              {/* READ ALOUD AND CLEAR BUTTONS SIDE-BY-SIDE UNDERNEATH */}
              <View style={styles.camSubControlsRow}>
                <TouchableOpacity
                  style={[
                    styles.camSubBtn,
                    styles.camReadAloudBtn,
                    !ttsReady && styles.buttonDisabled,
                  ]}
                  onPress={toggleReadAloud}
                  disabled={!ttsReady}
                >
                  <View style={styles.camSubBtnContent}>
                    <Text style={[styles.camSubBtnText, getTextStyle(15)]}>
                      {isReadAloudOn
                        ? language === 'english'
                          ? 'Reading...'
                          : 'Nagbabasa...'
                        : language === 'english'
                        ? 'Read Aloud'
                        : 'Basahin'}
                    </Text>
                    <Image
                      source={require('../assets/speak.png')}
                      style={styles.camSpeakIcon}
                      resizeMode="contain"
                    />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.camSubBtn, styles.camClearBtn]}
                  onPress={clearMessageBoard}
                >
                  <Text style={[styles.camSubBtnText, getTextStyle(15)]}>
                    {language === 'english' ? 'Clear' : 'Burahin'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      ) : (
        /* STANDARD HOMEPAGE VIEW WHEN CAMERA IS OFF */
        <>
          <Animated.View
            style={[
              styles.menuButtonWrapper,
              isTablet && styles.menuButtonWrapperTablet,
              isLandscape && styles.menuButtonWrapperLandscape,
              { transform: [{ translateX: logoSlideAnim }] },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.menuGradientButton,
                isTablet && styles.menuGradientButtonTablet,
              ]}
              onPress={() => {
                if (isVibrationEnabled) Vibration.vibrate(20);
                toggleMenu();
              }}
            >
              <LinearGradient
                colors={['#0086b3', '#00bfff']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.menuGradientFill}
              >
                <View style={styles.menuButtonContent}>
                  <Image
                    source={require('../assets/menu.png')}
                    style={[
                      styles.menuButtonIcon,
                      isTablet && styles.menuButtonIconTablet,
                    ]}
                    resizeMode="contain"
                  />
                  <Text
                    style={[
                      styles.menuButtonText,
                      isTablet && styles.menuButtonTextTablet,
                      getTextStyle(16),
                    ]}
                  >
                    {language === 'english' ? 'Menu' : 'Menu'}
                  </Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* STANDALONE OPEN CAMERA BUTTON */}
          <View
            style={[
              styles.openCameraContainer,
              isTablet && styles.openCameraContainerTablet,
              isLandscape && styles.openCameraContainerLandscape,
            ]}
          >
            <TouchableOpacity
              style={[
                styles.openCameraButton,
                isTablet && styles.openCameraButtonTablet,
              ]}
              onPress={handleToggleCamera}
            >
              <Text
                style={[
                  styles.openCameraButtonText,
                  isTablet && styles.openCameraButtonTextTablet,
                  getTextStyle(16),
                ]}
              >
                {language === 'english' ? 'Open Camera' : 'Buksan Kamera'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* PORTRAIT MODE - SEPARATE COMPONENTS */}
          {!isLandscape && (
            <>
              <View
                style={[
                  styles.translationWrapper,
                  isTabletLandscape && styles.translationWrapperTabletLandscape,
                ]}
              >
                <View
                  style={[
                    styles.translationContainer,
                    isTablet && styles.translationContainerTablet,
                  ]}
                >
                  <View
                    style={[
                      styles.translationBox,
                      isTablet && styles.translationBoxTablet,
                      { backgroundColor: isDarkMode ? '#2a2a2a' : '#f2f2f2' },
                    ]}
                  >
                    <ScrollView
                      showsVerticalScrollIndicator={true}
                      contentContainerStyle={styles.translationTextWrapper}
                    >
                      <Text
                        style={[
                          styles.translationText,
                          isTablet && styles.translationTextTablet,
                          getTextStyle(16),
                          { color: isDarkMode ? '#fff' : '#333' },
                        ]}
                      >
                        {messageBoardText ? (
                          words.map((word, index) => (
                            <Text
                              key={index}
                              style={[
                                index === highlightedWordIndex
                                  ? styles.highlightedWord
                                  : styles.normalWord,
                                getTextStyle(16),
                                { color: isDarkMode ? '#fff' : '#333' },
                              ]}
                            >
                              {word + ' '}
                            </Text>
                          ))
                        ) : (
                          <Text
                            style={[
                              styles.emptyMessageText,
                              getTextStyle(16),
                              { color: isDarkMode ? '#888' : '#999' },
                            ]}
                          >
                            {language === 'english'
                              ? 'Message board is empty'
                              : 'Walang laman ang message board'}
                          </Text>
                        )}
                      </Text>
                    </ScrollView>
                  </View>
                </View>
              </View>

              <View
                style={[
                  styles.buttonsContainer,
                  isTablet && styles.buttonsContainerTablet,
                ]}
              >
                <View
                  style={[
                    styles.readAloudContainer,
                    isTablet && styles.readAloudContainerTablet,
                  ]}
                >
                  {buttonStyles.gradient ? (
                    <View style={buttonStyles.container}>
                      <LinearGradient
                        colors={['#00c6a7', '#00bfff']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.gradientFill}
                      >
                        <TouchableOpacity
                          style={styles.readButtonTouchable}
                          onPress={toggleReadAloud}
                          disabled={!ttsReady}
                        >
                          <ReadAloudButtonContent />
                        </TouchableOpacity>
                      </LinearGradient>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        buttonStyles.container,
                        !ttsReady && styles.buttonDisabled,
                      ]}
                      onPress={toggleReadAloud}
                      disabled={!ttsReady}
                    >
                      <ReadAloudButtonContent />
                    </TouchableOpacity>
                  )}
                  {!ttsReady && (
                    <Text
                      style={[
                        styles.ttsNotReadyText,
                        getTextStyle(14),
                        { color: isDarkMode ? '#888' : '#666' },
                      ]}
                    >
                      {language === 'english'
                        ? 'TTS initializing...'
                        : 'Inihahanda ang TTS...'}
                    </Text>
                  )}
                </View>

                <View
                  style={[
                    styles.clearMessageContainer,
                    isTablet && styles.clearMessageContainerTablet,
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.clearMessageButton,
                      isTablet && styles.clearMessageButtonTablet,
                    ]}
                    onPress={clearMessageBoard}
                  >
                    <LinearGradient
                      colors={['#FF6B6B', '#FF8E8E']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.clearMessageGradient}
                    >
                      <View style={styles.clearMessageButtonContent}>
                        <Text
                          style={[
                            styles.clearMessageText,
                            isTablet && styles.clearMessageTextTablet,
                            getTextStyle(16),
                          ]}
                        >
                          {language === 'english'
                            ? 'Clear Message Board'
                            : 'Burahin ang Message Board'}
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
            <View
              style={[
                styles.landscapeContentContainer,
                isTabletLandscape && styles.landscapeContentContainerTablet,
              ]}
            >
              <View
                style={[
                  styles.translationBox,
                  isLandscape && styles.translationBoxLandscape,
                  isTabletLandscape && styles.translationBoxTabletLandscape,
                  { backgroundColor: isDarkMode ? '#2a2a2a' : '#f2f2f2' },
                ]}
              >
                <ScrollView
                  showsVerticalScrollIndicator={true}
                  contentContainerStyle={styles.translationTextWrapper}
                >
                  <Text
                    style={[
                      styles.translationText,
                      isLandscape && styles.translationTextLandscape,
                      isTabletLandscape &&
                        styles.translationTextTabletLandscape,
                      getTextStyle(16),
                      { color: isDarkMode ? '#fff' : '#333' },
                    ]}
                  >
                    {messageBoardText ? (
                      words.map((word, index) => (
                        <Text
                          key={index}
                          style={[
                            index === highlightedWordIndex
                              ? styles.highlightedWord
                              : styles.normalWord,
                            getTextStyle(16),
                            { color: isDarkMode ? '#fff' : '#333' },
                          ]}
                        >
                          {word + ' '}
                        </Text>
                      ))
                    ) : (
                      <Text
                        style={[
                          styles.emptyMessageText,
                          getTextStyle(16),
                          { color: isDarkMode ? '#888' : '#999' },
                        ]}
                      >
                        {language === 'english'
                          ? 'Message board is empty'
                          : 'Walang laman ang message board'}
                      </Text>
                    )}
                  </Text>
                </ScrollView>
              </View>

              <View
                style={[
                  styles.landscapeButtonsContainer,
                  isTabletLandscape && styles.landscapeButtonsContainerTablet,
                ]}
              >
                <View
                  style={[
                    styles.readAloudContainerLandscape,
                    isTabletLandscape &&
                      styles.readAloudContainerTabletLandscape,
                  ]}
                >
                  {buttonStyles.gradient ? (
                    <View
                      style={[
                        buttonStyles.container,
                        isLandscape && styles.gradientButtonLandscape,
                        isTabletLandscape &&
                          styles.gradientButtonTabletLandscape,
                      ]}
                    >
                      <LinearGradient
                        colors={['#00c6a7', '#00bfff']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.gradientFill}
                      >
                        <TouchableOpacity
                          style={styles.readButtonTouchable}
                          onPress={toggleReadAloud}
                          disabled={!ttsReady}
                        >
                          <ReadAloudButtonContent />
                        </TouchableOpacity>
                      </LinearGradient>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        buttonStyles.container,
                        isLandscape && styles.gradientButtonLandscape,
                        isTabletLandscape &&
                          styles.gradientButtonTabletLandscape,
                        !ttsReady && styles.buttonDisabled,
                      ]}
                      onPress={toggleReadAloud}
                      disabled={!ttsReady}
                    >
                      <ReadAloudButtonContent />
                    </TouchableOpacity>
                  )}
                  {!ttsReady && (
                    <Text
                      style={[
                        styles.ttsNotReadyText,
                        getTextStyle(14),
                        { color: isDarkMode ? '#888' : '#666' },
                      ]}
                    >
                      {language === 'english'
                        ? 'TTS initializing...'
                        : 'Inihahanda ang TTS...'}
                    </Text>
                  )}
                </View>

                <View
                  style={[
                    styles.clearMessageContainerLandscape,
                    isTabletLandscape &&
                      styles.clearMessageContainerTabletLandscape,
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.clearMessageButton,
                      isLandscape && styles.clearMessageButtonLandscape,
                      isTabletLandscape &&
                        styles.clearMessageButtonTabletLandscape,
                    ]}
                    onPress={clearMessageBoard}
                  >
                    <LinearGradient
                      colors={['#FF6B6B', '#FF8E8E']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.clearMessageGradient}
                    >
                      <View style={styles.clearMessageButtonContent}>
                        <Text
                          style={[
                            styles.clearMessageText,
                            isTabletLandscape &&
                              styles.clearMessageTextTabletLandscape,
                            getTextStyle(16),
                          ]}
                        >
                          {language === 'english'
                            ? 'Clear Message Board'
                            : 'Burahin ang Message Board'}
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

      <Animated.View
        style={[
          styles.overlay,
          { top: insets.top, bottom: insets.bottom },
          overlayStyle,
        ]}
        pointerEvents={menuOpen ? 'auto' : 'none'}
      >
        <TouchableOpacity
          style={styles.overlayTouchable}
          onPress={() => {
            if (isVibrationEnabled) Vibration.vibrate(20);
            closeMenu();
            if (showCustomizeModal) {
              closeCustomizeModal();
            }
          }}
          activeOpacity={1}
        />
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

const HomepageScreen: React.FC<Props> = props => {
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
    alignItems: 'center',
    zIndex: 100,
  },
  topCamControlsCard: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#00bfff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 6,
  },
  camPillActionBtn: {
    backgroundColor: '#0086b3',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camExitPillBtn: {
    backgroundColor: '#FF6B6B',
  },
  camActionBtnText: {
    color: '#fff',
    fontWeight: '600',
  },

  debugLogOverlayBox: {
    position: 'absolute',
    top: 90,
    left: 16,
    right: 16,
    maxHeight: 180,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#38bdf8',
    padding: 12,
    zIndex: 99,
  },
  debugLogTitle: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  debugLogScroll: {
    maxHeight: 130,
  },
  debugLogText: {
    color: '#e2e8f0',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 14,
  },

  fullScreenHudContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  fullScreenTargetBox: {
    borderWidth: 2,
    borderColor: '#00bfff',
    borderRadius: 24,
    backgroundColor: 'rgba(0, 191, 255, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  fullScreenTargetBoxNoHand: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  fullScreenTargetBoxUnrecognized: {
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },
  fullScreenTargetBoxRecognized: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  fullScreenTargetLabel: {
    color: '#00bfff',
    fontWeight: 'bold',
    letterSpacing: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  fullScreenTargetLabelNoHand: {
    color: '#f87171',
  },
  fullScreenTargetLabelUnrecognized: {
    color: '#fbbf24',
  },
  fullScreenTargetLabelRecognized: {
    color: '#4ade80',
  },
  noHandDetectedBanner: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(220, 38, 38, 0.88)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fca5a5',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '85%',
  },
  noHandDetectedTitle: {
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  noHandDetectedSubtext: {
    color: '#fef2f2',
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '500',
  },
  recognizedGestureBanner: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(22, 163, 74, 0.92)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#86efac',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '85%',
  },
  recognizedGestureTitle: {
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  recognizedGestureSubtext: {
    color: '#f0fdf4',
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '600',
  },
  unrecognizedGestureBanner: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(217, 119, 6, 0.88)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fde68a',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '85%',
  },
  unrecognizedGestureTitle: {
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  unrecognizedGestureSubtext: {
    color: '#fffbe6',
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '500',
  },
  fullScreenProcessingText: {
    color: '#FFD700',
    fontWeight: 'bold',
    marginTop: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },

  // DRAGGABLE BOTTOM DRAWER STYLES
  fullScreenBottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    zIndex: 100,
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 12,
  },
  drawerDragHandleContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 6,
  },
  drawerDragIndicator: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#cbd5e1',
    marginBottom: 4,
  },
  drawerDragHelpText: {
    color: '#64748b',
    fontWeight: '500',
    textAlign: 'center',
  },
  fullScreenTextPreviewBox: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
    maxHeight: 90,
  },
  fullScreenTextPreviewContent: {
    textAlign: 'center',
  },

  // CAMERA STACKED BUTTON LAYOUT (SOLID COLORS)
  camTranslateTopBtn: {
    backgroundColor: '#0086b3',
    borderRadius: 25,
    height: 48,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  camTranslateTopBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  camSubControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  camSubBtn: {
    borderRadius: 25,
    height: 48,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camReadAloudBtn: {
    backgroundColor: '#00c6a7',
    marginRight: 6,
  },
  camClearBtn: {
    backgroundColor: '#FF6B6B',
    marginLeft: 6,
  },
  camSubBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camSubBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  camSpeakIcon: {
    width: 22,
    height: 22,
    tintColor: '#fff',
    marginLeft: 6,
  },

  // STANDALONE OPEN CAMERA BUTTON STYLES
  openCameraContainer: {
    marginTop: 85,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  openCameraContainerTablet: {
    marginTop: 100,
    marginBottom: 15,
  },
  openCameraContainerLandscape: {
    marginTop: 25,
    marginBottom: 5,
  },

  openCameraButton: {
    backgroundColor: '#0086b3',
    borderRadius: 50,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 160,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  openCameraButtonTablet: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    minWidth: 200,
  },
  openCameraButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  openCameraButtonTextTablet: {
    fontSize: 18,
  },

  // LANDSCAPE CONTENT CONTAINER
  landscapeContentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 60,
    paddingVertical: 20,
  },
  landscapeContentContainerTablet: {
    paddingHorizontal: 120,
    paddingVertical: 30,
  },

  // PORTRAIT MODE STYLES
  translationWrapper: { flex: 1, justifyContent: 'center' },
  translationWrapperTabletLandscape: {
    flex: 0.8,
    justifyContent: 'center',
    paddingTop: 30,
    paddingBottom: 30,
  },

  translationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 0,
  },
  translationContainerTablet: {
    paddingHorizontal: 120,
    paddingVertical: 30,
    paddingTop: 20,
  },

  translationBox: {
    borderRadius: 12,
    paddingHorizontal: 25,
    paddingVertical: 20,
    marginBottom: 15,
    alignSelf: 'center',
    maxWidth: '90%',
    height: 380,
    minHeight: 380,
    minWidth: 300,
    overflow: 'hidden',
  },
  translationBoxLandscape: {
    height: 240,
    minHeight: 240,
    width: '90%',
    minWidth: 400,
    maxWidth: 700,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  translationBoxTablet: {
    width: '70%',
    minWidth: 500,
    height: 600,
    minHeight: 600,
    paddingHorizontal: 50,
    paddingVertical: 50,
    maxWidth: 700,
  },
  translationBoxTabletLandscape: {
    width: '100%',
    minWidth: 600,
    height: 320,
    minHeight: 320,
    paddingHorizontal: 40,
    paddingVertical: 30,
    maxWidth: 800,
    marginBottom: 20,
  },

  translationText: { textAlign: 'center', fontSize: 18, lineHeight: 24 },
  translationTextLandscape: { fontSize: 16, lineHeight: 22 },
  translationTextTablet: { fontSize: 29, lineHeight: 30 },
  translationTextTabletLandscape: {
    fontSize: 24,
    lineHeight: 28,
    textAlign: 'center',
  },
  translationTextWrapper: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    minHeight: '100%',
  },

  highlightedWord: {
    backgroundColor: '#FFD700',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    fontWeight: 'bold',
  },
  normalWord: { backgroundColor: 'transparent' },
  emptyMessageText: {
    fontStyle: 'italic',
    textAlign: 'center',
    flex: 1,
    textAlignVertical: 'center',
  },

  // PORTRAIT BUTTONS
  buttonsContainer: { width: '100%', alignItems: 'center', paddingBottom: 20 },
  buttonsContainerTablet: { paddingBottom: 40 },

  readAloudContainer: { width: '100%', alignItems: 'center', marginBottom: 15 },
  readAloudContainerTablet: { marginBottom: 20 },

  gradientButton: {
    borderRadius: 50,
    alignSelf: 'center',
    overflow: 'hidden',
    height: 48,
    minWidth: 160,
  },
  gradientButtonLandscape: { marginBottom: 0, height: 45, minWidth: 150 },
  gradientButtonTablet: { height: 60, minWidth: 240 },
  gradientButtonTabletLandscape: { height: 55, minWidth: 200 },

  readAloudButtonOff: {
    borderRadius: 50,
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: '#cccccc',
    height: 48,
    minWidth: 160,
    justifyContent: 'center',
  },

  gradientFill: { flex: 1, borderRadius: 50, justifyContent: 'center' },
  readButtonTouchable: { flex: 1, justifyContent: 'center' },
  readButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  readText: { color: '#fff', fontWeight: '600', marginRight: 10, fontSize: 16 },
  readTextOff: {
    color: '#666',
    fontWeight: '600',
    marginRight: 10,
    fontSize: 16,
  },
  readTextTablet: { fontSize: 20 },

  speakIcon: { width: 30, height: 30, tintColor: '#fff' },
  speakIconOff: { width: 30, height: 30, tintColor: '#666' },
  speakIconTablet: { width: 38, height: 38 },

  buttonDisabled: { opacity: 0.6 },
  ttsNotReadyText: { fontSize: 12, textAlign: 'center', marginTop: 5 },

  clearMessageContainer: { width: '100%', alignItems: 'center' },
  clearMessageContainerTablet: {},

  clearMessageButton: {
    borderRadius: 50,
    alignSelf: 'center',
    overflow: 'hidden',
    height: 48,
    minWidth: 200,
  },
  clearMessageButtonLandscape: { height: 45, minWidth: 180 },
  clearMessageButtonTablet: { height: 60, minWidth: 280 },
  clearMessageButtonTabletLandscape: { height: 55, minWidth: 220 },

  clearMessageGradient: { flex: 1, borderRadius: 50, justifyContent: 'center' },
  clearMessageButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 25,
  },
  clearMessageText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  clearMessageTextTablet: { fontSize: 20 },
  clearMessageTextTabletLandscape: { fontSize: 18 },

  // LANDSCAPE BUTTONS CONTAINER
  landscapeButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  landscapeButtonsContainerTablet: { marginTop: 20 },

  readAloudContainerLandscape: { marginRight: 20 },
  readAloudContainerTabletLandscape: { marginRight: 30 },

  clearMessageContainerLandscape: { marginLeft: 20 },
  clearMessageContainerTabletLandscape: { marginLeft: 30 },

  // MENU BUTTON STYLES
  menuButtonWrapper: { position: 'absolute', top: 35, left: 20, zIndex: 30 },
  menuButtonWrapperTablet: { top: 60, left: 40 },
  menuButtonWrapperLandscape: { top: 25, left: 20 },
  menuGradientButton: {
    borderRadius: 50,
    overflow: 'hidden',
    height: 48,
    minWidth: 120,
  },
  menuGradientButtonTablet: { height: 60, minWidth: 160 },
  menuGradientFill: { flex: 1, borderRadius: 50, justifyContent: 'center' },
  menuButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  menuButtonIcon: { width: 20, height: 20, tintColor: '#fff', marginRight: 8 },
  menuButtonIconTablet: { width: 25, height: 25 },
  menuButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  menuButtonTextTablet: { fontSize: 18 },

  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 10,
  },
  overlayTouchable: { flex: 1 },
});
