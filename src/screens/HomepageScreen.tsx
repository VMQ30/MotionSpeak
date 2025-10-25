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
  Modal,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Slider from '@react-native-community/slider';
import { useLanguage } from '../context/LanguageContext';
import Tts from 'react-native-tts';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = { navigation: any };

const HomepageScreenContent: React.FC<Props> = ({ navigation }) => {
  const { language, setLanguage } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isReadAloudOn, setIsReadAloudOn] = useState(false);
  const [highlightedWordIndex, setHighlightedWordIndex] = useState<number | null>(null);
  const [ttsReady, setTtsReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(1)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const settingsSlideAnim = useRef(new Animated.Value(300)).current;
  const settingsOverlayAnim = useRef(new Animated.Value(0)).current;
  const currentWordIndexRef = useRef(-1);
  const isMountedRef = useRef(true);
  const isReadAloudOnRef = useRef(false);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [tempLanguage, setTempLanguage] = useState(language);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  // FONT SIZE ADJUST
  const [showFontSizeModal, setShowFontSizeModal] = useState(false);
  const [fontSizePercentage, setFontSizePercentage] = useState(100);
  const [tempFontSize, setTempFontSize] = useState(100);

  // TTS SPEED
  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [tempTtsSpeed, setTempTtsSpeed] = useState(1.0);
  const [highlighterSpeed, setHighlighterSpeed] = useState(1000);

  // MSG BOARD
  const textContent = `The quick brown fox jumps over the lazy dog`;
  const [messageBoardText, setMessageBoardText] = useState(textContent);
  
  // Get safe area insets
  const insets = useSafeAreaInsets();
  
  // CLEAR BOARD
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
    const minSpeed = 100;
    const maxSpeed = 1000;
    const newHighlighterSpeed = maxSpeed - ((ttsSpeed - 0.5) / 1.5) * (maxSpeed - minSpeed);
    
    setHighlighterSpeed(newHighlighterSpeed);
  }, [ttsSpeed]);

  const startWordHighlighter = () => {
    let currentIndex = -1;
    
    const highlightNext = () => {
      if (!isReadAloudOnRef.current) return;
      
      currentIndex++;
      if (currentIndex >= words.length) {
        setHighlightedWordIndex(null);
        return;
      }
      
      setHighlightedWordIndex(currentIndex);
      setTimeout(highlightNext, highlighterSpeed);
    };
    
    highlightNext();
  };

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
      
      // TTS RATE
      const baseRate = 0.5;
      const calculatedRate = baseRate * ttsSpeed;
      Tts.setDefaultRate(calculatedRate);
      
      speakNextWord();
    }
  };

  // WORD SPLIT
  const words = messageBoardText.split(/\s+/).filter(word => word.length > 0);

  // INI TTS
  useEffect(() => {
    isMountedRef.current = true;
    
    const initTTS = async () => {
      try {
        const status = await Tts.getInitStatus();
        const ttsLanguage = language === 'english' ? 'en-US' : 'fil-PH';
        const baseRate = 0.3;
        const calculatedRate = baseRate * ttsSpeed;
        
        Tts.setDefaultLanguage(ttsLanguage);
        Tts.setDefaultRate(calculatedRate);
        Tts.setDefaultPitch(1.0);
        
        Tts.addEventListener('tts-start', (event) => {
          if (isMountedRef.current) {
            setIsSpeaking(true);
          }
        });

        Tts.addEventListener('tts-finish', () => {
          setIsSpeaking(false);
          if (isReadAloudOnRef.current) {
            speakNextWord();
          }
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

        if (isMountedRef.current) {
          setTtsReady(true);
        }
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

  // DETECT ORIENTATION AND TABLET MODE
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

  // SETTINGS ANIM
  useEffect(() => {
    if (showSettingsModal) {
      settingsOverlayAnim.setValue(0);
      settingsSlideAnim.setValue(300);
      
      // START ANIM
      Animated.sequence([
        Animated.timing(settingsOverlayAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(settingsSlideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
      
      setTimeout(() => {
        setSettingsModalVisible(true);
      }, 10);
      
    } else {
      // END ANIM
      Animated.sequence([
        Animated.timing(settingsSlideAnim, {
          toValue: 300,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(settingsOverlayAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setSettingsModalVisible(false);
      });
    }
  }, [showSettingsModal]);

  const closeSettingsModal = () => {
    setShowSettingsModal(false);
  };

  const { width } = Dimensions.get('window');
  const menuWidth = isLandscape ? width * 0.35 : width * 0.7;
  const isTabletLandscape = isTablet && isLandscape;

  // SPEAK NEXT WORD
  const speakNextWord = () => {
    if (!isReadAloudOnRef.current) {
      return;
    }

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
    
    // INSTANTLY highlight the word - no delays
    setHighlightedWordIndex(nextIndex);
    
    // TTS RATE CALCULATED
    const baseRate = 0.5;
    const calculatedRate = baseRate * ttsSpeed;
    Tts.setDefaultRate(calculatedRate);
    Tts.speak(word);
  };

  // MENU TOGGLES
  const toggleMenu = () => {
    console.log('Toggling menu, current state:', menuOpen);
    const toValue = menuOpen ? 0 : 1;
    const logoToValue = menuOpen ? 1 : 0;
    const overlayToValue = menuOpen ? 0 : 0.5;
    setMenuOpen(prev => !prev);

    Animated.parallel([
      Animated.timing(slideAnim, { 
        toValue, 
        duration: 300, 
        useNativeDriver: true 
      }),
      Animated.timing(logoOpacity, { 
        toValue: logoToValue, 
        duration: 150, 
        useNativeDriver: true 
      }),
      Animated.timing(overlayOpacity, { 
        toValue: overlayToValue, 
        duration: 300, 
        useNativeDriver: true 
      }),
    ]).start();
  };

  const closeMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  };

  const openSettingsModal = () => {
    setShowSettingsModal(true);
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

  const settingsSlideStyle = {
    transform: [
      {
        translateY: settingsSlideAnim,
      },
    ],
  };

  const settingsOverlayStyle = {
    opacity: settingsOverlayAnim,
  };

  const logoStyle = { opacity: logoOpacity };
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

  // READ ALOUD
  const ReadAloudButtonContent = () => (
    <View style={styles.readButton}>
      <Text style={[
          buttonStyles.text,
          { fontSize: 16 * (fontSizePercentage / 100) } // FONT SIZE
        ]}>
        {isReadAloudOn 
          ? (language === 'english' ? 'Reading...' : 'Nagbabasa...')
          : (language === 'english' ? 'Read Aloud' : 'Basahin nang Malakas')
        }
      </Text>
      <Image
        source={require('../assets/speak.png')}
        style={buttonStyles.icon}
        resizeMode="contain"
      />
    </View>
  );

  return (
    <View style={[
      styles.container, 
      isLandscape && styles.landscapeContainer, 
      isTablet && styles.tabletContainer,
      { paddingTop: insets.top, paddingBottom: insets.bottom }
    ]}>
      <StatusBar backgroundColor="#fff" barStyle="dark-content" />
      
      {/* Logo Button */}
      <Animated.View style={[styles.logoWrapper, isTablet && styles.logoWrapperTablet, logoStyle]}>
        <TouchableOpacity
          onPress={() => {
            Vibration.vibrate(20);
            toggleMenu();
          }}
        >
          <Image
            source={require('../assets/menu.png')}
            style={[styles.logo, isTablet && styles.logoTablet]}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </Animated.View>

      {/* Translation Box */}
      <View style={styles.translationWrapper}>
        <View
          style={[
            styles.translationContainer,
            isLandscape && styles.translationContainerLandscape,
            isTablet && styles.translationContainerTablet,
            isTabletLandscape && styles.translationContainerTabletLandscape
          ]}
        >
          <View
            style={[
              styles.translationBox,
              isLandscape && styles.translationBoxLandscape,
              isTablet && styles.translationBoxTablet,
              isTabletLandscape && styles.translationBoxTabletLandscape
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
                  isTablet && styles.translationTextTablet,
                  isTabletLandscape && styles.translationTextTabletLandscape
                ]}>
                {messageBoardText ? (
                  words.map((word, index) => (
                    <Text
                      key={index}
                      style={
                        index === highlightedWordIndex 
                          ? styles.highlightedWord 
                          : styles.normalWord
                      }
                    >
                      {word + ' '}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.emptyMessageText}>
                    {language === 'english' 
                      ? 'Message board is empty' 
                      : 'Walang laman ang message board'
                    }
                  </Text>
                )}
              </Text>
            </ScrollView>
          </View>
        </View>
      </View>

      {/* Buttons Container */}
      <View style={[
        styles.buttonsContainer,
        isLandscape && styles.buttonsContainerLandscape,
        isTablet && styles.buttonsContainerTablet,
        isTabletLandscape && styles.buttonsContainerTabletLandscape
      ]}>
        
        {/* Read Aloud Button */}
        <View style={[
          styles.readAloudContainer, 
          isLandscape && styles.readAloudContainerLandscape,
          isTablet && styles.readAloudContainerTablet,
        ]}>
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
              style={[buttonStyles.container, !ttsReady && styles.buttonDisabled]}
              onPress={toggleReadAloud}
              disabled={!ttsReady}
            >
              <ReadAloudButtonContent />
            </TouchableOpacity>
          )}
          {!ttsReady && (
            <Text style={styles.ttsNotReadyText}>TTS initializing...</Text>
          )}
        </View>

        {/* Clear Message Board Button */}
        <View style={[
          styles.clearMessageContainer,
          isLandscape && styles.clearMessageContainerLandscape,
          isTablet && styles.clearMessageContainerTablet,
        ]}>
          <TouchableOpacity
            style={[
              styles.clearMessageButton,
              isLandscape && styles.clearMessageButtonLandscape,
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
                <Text style={[
                  styles.clearMessageText,
                  isTablet && styles.clearMessageTextTablet,
                  { fontSize: 16 * (fontSizePercentage / 100) }
                ]}>
                  {language === 'english' ? 'Clear Message Board' : 'Burahin ang Message Board'}
                </Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        
      </View>

      {/* Overlay */}
      <Animated.View
        style={[styles.overlay, overlayStyle]}
        pointerEvents={menuOpen ? 'auto' : 'none'}
      >
        <TouchableOpacity
          style={styles.overlayTouchable}
          onPress={() => {
            Vibration.vibrate(20);
            closeMenu();
          }}
          activeOpacity={1}
        />
      </Animated.View>

      {/* Side Menu (full) */}
      <Animated.View
        style={[
          styles.sideMenu,
          isLandscape && styles.sideMenuLandscape, 
          isTablet && styles.sideMenuTablet, 
          isTabletLandscape && styles.sideMenuTabletLandscape,
          { width: menuWidth },
          slideStyle,
        ]}
        pointerEvents={menuOpen ? 'auto' : 'none'}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuScrollContainer}>
          <View style={[styles.menuHeader, isTablet && styles.menuHeaderTablet, isTabletLandscape && styles.menuHeaderTabletLandscape]}>
            <View style={styles.logoContainer}>
              <Image
                source={require('../assets/logo-slanted.png')}
                style={[styles.menuLogo, isTablet && styles.menuLogoTablet, isTabletLandscape && styles.menuLogoTabletLandscape]}
                resizeMode="contain"
              />
            </View>
            <Text style={[styles.motionText, isTablet && styles.motionTextTablet]}>
              Motion<Text style={styles.speakText}>Speak</Text>
            </Text>
          </View>

          {/* Menu Buttons */}
          <TouchableOpacity
            style={[styles.menuButton, isTablet && styles.menuButtonTablet, isTabletLandscape && styles.menuButtonTabletLandscape]}
            onPress={() => {
              Vibration.vibrate(20);
              closeMenu();
              navigation.replace('Home');
            }}
          >
            <Image source={require('../assets/home.png')} style={[styles.menuIcon, isTablet && styles.menuIconTablet, isTabletLandscape && styles.menuIconTabletLandscape]} resizeMode="contain" />
            <Text style={[styles.menuText, isTablet && styles.menuTextTablet]}>
              {language === 'english' ? 'Back to Home' : 'Balik sa Home'}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.menuButton, isTablet && styles.menuButtonTablet, isTabletLandscape && styles.menuButtonTabletLandscape]}
            onPress={() => {
              Vibration.vibrate(20);
              closeMenu();
              openSettingsModal();
            }}
          >
            <Image source={require('../assets/settings.png')} style={[styles.menuIcon, isTablet && styles.menuIconTablet, isTabletLandscape && styles.menuIconTabletLandscape]} resizeMode="contain" />
            <Text style={[styles.menuText, isTablet && styles.menuTextTablet]}>
              {language === 'english' ? 'Settings' : 'Mga Setting'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuButton, isTablet && styles.menuButtonTablet, isTabletLandscape && styles.menuButtonTabletLandscape]}>
            <Image source={require('../assets/notification.png')} style={[styles.menuIcon, isTablet && styles.menuIconTablet, isTabletLandscape && styles.menuIconTabletLandscape]} resizeMode="contain" />
            <Text style={[styles.menuText, isTablet && styles.menuTextTablet]}>
              {language === 'english' ? 'Notifications' : 'Mga Notification'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuButton, isTablet && styles.menuButtonTablet, isTabletLandscape && styles.menuButtonTabletLandscape]}
            onPress={() => {
              Vibration.vibrate(20);
              closeMenu();
              navigation.replace('Tutorial', { fromHomepage: true });
            }}
          >
            <Image source={require('../assets/tutorial.png')} style={[styles.menuIcon, isTablet && styles.menuIconTablet, isTabletLandscape && styles.menuIconTabletLandscape]} resizeMode="contain" />
            <Text style={[styles.menuText, isTablet && styles.menuTextTablet]}>
              {language === 'english' ? 'How to use the app' : 'Paano gamitin ang app'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>

      {/* Custom Settings Modal */}
      <Modal
        visible={settingsModalVisible}
        transparent={true}
        animationType="none"
        onRequestClose={closeSettingsModal}
      >
        <Animated.View style={[styles.settingsModalOverlay, settingsOverlayStyle]}>
          <TouchableOpacity 
            style={styles.settingsModalOverlayTouchable}
            onPress={closeSettingsModal}
            activeOpacity={1}
          />
          <Animated.View style={[
            styles.settingsModalContainer, 
            isTablet && styles.settingsModalContainerTablet,
            settingsSlideStyle
          ]}>
            <View style={styles.settingsHeader}>
              <Text style={[styles.settingsTitle, isTablet && styles.settingsTitleTablet]}>Settings</Text>
              <TouchableOpacity 
                onPress={closeSettingsModal}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            {/* DARK MODE */}
            <TouchableOpacity style={styles.settingsOption}>
              <Text style={[styles.settingsOptionText, isTablet && styles.settingsOptionTextTablet]}>Dark Mode</Text>
              <Text style={styles.comingSoonText}>Coming Soon</Text>
            </TouchableOpacity>

            {/* FONT SIZE */}
            <TouchableOpacity 
              style={styles.settingsOption}
              onPress={() => {
                setShowSettingsModal(false);
                setShowFontSizeModal(true);
                setTempFontSize(fontSizePercentage);
              }}
            >
              <Text style={[styles.settingsOptionText, isTablet && styles.settingsOptionTextTablet]}>
                {language === 'english' ? 'Font Size' : 'Laki ng Font'}
              </Text>
              <Text style={styles.fontSizeValue}>{fontSizePercentage}%</Text>
            </TouchableOpacity>

            {/* TTS SPEED */}
            <TouchableOpacity 
              style={styles.settingsOption}
              onPress={() => {
                setShowSettingsModal(false);
                setShowSpeedModal(true);
                setTempTtsSpeed(ttsSpeed);
              }}
            >
              <Text style={[styles.settingsOptionText, isTablet && styles.settingsOptionTextTablet]}>
                {language === 'english' ? 'TTS Speed' : 'Bilis ng TTS'}
              </Text>
              <Text style={styles.speedValue}>{ttsSpeed.toFixed(1)}x</Text>
            </TouchableOpacity>
            
            {/* LANGUAGE */}
            <TouchableOpacity 
              style={styles.settingsOption}
              onPress={() => {
                closeSettingsModal();
                setShowLanguageModal(true);
                setTempLanguage(language);
              }}>
              <Text style={[styles.settingsOptionText, isTablet && styles.settingsOptionTextTablet]}>
                {language === 'english' ? 'Language' : 'Wika'}</Text>
              <Text style={styles.languageValue}>{language === 'english' ? 'English' : 'Filipino'}</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* TTS Speed Modal */}
      <Modal
        visible={showSpeedModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSpeedModal(false)}
      >
        <View style={styles.speedModalOverlay}>
          <View style={[styles.speedModalContainer, isTablet && styles.speedModalContainerTablet]}>
            <View style={styles.speedHeader}>
              <Text style={[styles.speedTitle, isTablet && styles.speedTitleTablet]}>
                {language === 'english' ? 'TTS Speed' : 'Bilis ng TTS'}
              </Text>
              <TouchableOpacity 
                onPress={() => setShowSpeedModal(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.sliderText, isTablet && styles.sliderTextTablet]}>
              {language === 'english' ? 'Adjust text-to-speech speed' : 'Ayusin ang bilis ng text-to-speech'}
            </Text>
            
            <View style={styles.speedSliderContainer}>
              <Text style={styles.speedSliderLabel}>0.5x</Text>
              <Slider
                style={styles.speedSlider}
                minimumValue={0.5}
                maximumValue={2.0}
                step={0.1}
                value={tempTtsSpeed}
                onValueChange={setTempTtsSpeed}
                minimumTrackTintColor="#007AFF"
                maximumTrackTintColor="#ddd"
                thumbTintColor="#007AFF"
              />
              <Text style={styles.speedSliderLabel}>2.0x</Text>
            </View>

            <View style={styles.currentSpeedContainer}>
              <Text style={styles.currentSpeedText}>
                {tempTtsSpeed.toFixed(1)}x
              </Text>
              <Text style={styles.speedDescription}>
                {tempTtsSpeed === 1.0 
                  ? (language === 'english' ? 'Normal Speed' : 'Normal na Bilis')
                  : tempTtsSpeed < 1.0 
                  ? (language === 'english' ? 'Slower Pronunciation' : 'Mas Mabagal na Pagbigkas')
                  : (language === 'english' ? 'Faster Pronunciation' : 'Mas Mabilis na Pagbigkas')
                }
              </Text>
            </View>

            <TouchableOpacity 
              style={styles.okButton}
              onPress={() => {
                Vibration.vibrate(50);
                setTtsSpeed(tempTtsSpeed);
                setShowSpeedModal(false);
                
                // Update TTS with new speed using slower base rate
                const baseRate = 0.7;
                const calculatedRate = baseRate * tempTtsSpeed;
                Tts.setDefaultRate(calculatedRate);
                
                // If currently speaking, restart with new speed
                if (isReadAloudOnRef.current) {
                  Tts.stop();
                  // Small delay to ensure TTS stops completely
                  setTimeout(() => {
                    if (isReadAloudOnRef.current) {
                      speakNextWord();
                    }
                  }, 100);
                }
              }}
            >
              <LinearGradient
                colors={['#76E1D8','#7CBF00']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.okButtonGradient}
              >
                <Text style={styles.okButtonText}>
                  {language === 'english' ? 'OK' : 'Sige'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Font Size Modal */}
      <Modal
        visible={showFontSizeModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFontSizeModal(false)}
      >
        <View style={styles.fontSizeModalOverlay}>
          <View style={[styles.fontSizeModalContainer, isTablet && styles.fontSizeModalContainerTablet]}>
            <View style={styles.fontSizeHeader}>
              <Text style={[styles.fontSizeTitle, isTablet && styles.fontSizeTitleTablet]}>
                {language === 'english' ? 'Font Size' : 'Laki ng Font'}
              </Text>
              <TouchableOpacity 
                onPress={() => setShowFontSizeModal(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.sliderText, isTablet && styles.sliderTextTablet]}>
              {language === 'english' ? 'Slide to adjust font size' : 'I-slide para ayusin ang laki ng font'}
            </Text>
            
            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>100%</Text>
              <Slider
                style={styles.slider}
                minimumValue={100}
                maximumValue={200}
                step={10} // 10% increments
                value={tempFontSize}
                onValueChange={setTempFontSize}
                minimumTrackTintColor="#007AFF"
                maximumTrackTintColor="#ddd"
                thumbTintColor="#007AFF"
              />
              <Text style={styles.sliderLabel}>200%</Text>
            </View>

            <View style={styles.currentSizeContainer}>
              <Text style={styles.currentSizeText}>
                {tempFontSize}%
              </Text>
            </View>

            {/* Preview Text */}
            <View style={styles.previewContainer}>
              <Text style={[
                styles.previewText,
                { fontSize: 16 * (tempFontSize / 100) }
              ]}>
                {language === 'english' 
                  ? 'This is how your text will look'
                  : 'Ganito ang itsura ng iyong teksto'
                }
              </Text>
            </View>
            
            <TouchableOpacity 
              style={styles.okButton}
              onPress={() => {
                Vibration.vibrate(50);
                setFontSizePercentage(tempFontSize);
                setShowFontSizeModal(false);
              }}
            >
              <LinearGradient
                colors={['#76E1D8','#7CBF00']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.okButtonGradient}
              >
                <Text style={styles.okButtonText}>
                  {language === 'english' ? 'OK' : 'Sige'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Language Selection Modal */}
      <Modal
        visible={showLanguageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLanguageModal(false)}>
        <View style={styles.languageModalOverlay}>
          <View style={[styles.languageModalContainer, isTablet && styles.languageModalContainerTablet]}>
            <View style={styles.languageHeader}>
              <Text style={[styles.languageTitle, isTablet && styles.languageTitleTablet]}>Select Language</Text>
              <TouchableOpacity 
                onPress={() => setShowLanguageModal(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.languageOptions}>
              <TouchableOpacity 
                style={[
                  styles.languageOption,
                  tempLanguage === 'english' && styles.languageOptionSelected
                ]}
                onPress={() => setTempLanguage('english')}
              >
                <Text style={[
                  styles.languageOptionText,
                  tempLanguage === 'english' && styles.languageOptionTextSelected
                ]}>{language === 'english' ? 'English' : 'Ingles'}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.languageOption,
                  tempLanguage === 'tagalog' && styles.languageOptionSelected
                ]}
                onPress={() => setTempLanguage('tagalog')}
              >
                <Text style={[
                  styles.languageOptionText,
                  tempLanguage === 'tagalog' && styles.languageOptionTextSelected
                ]}>{language === 'english' ? 'Filipino' : 'Pilipino'}</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={styles.okButton}
              onPress={() => {
                Vibration.vibrate(50);
                setLanguage(tempLanguage);
                setShowLanguageModal(false);
              }}
            >
              <LinearGradient
                colors={['#76E1D8','#7CBF00']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.okButtonGradient}
              >
                <Text style={styles.okButtonText}>OK</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// Main component with SafeAreaProvider
const HomepageScreen: React.FC<Props> = (props) => {
  return (
    <SafeAreaProvider>
      <HomepageScreenContent {...props} />
    </SafeAreaProvider>
  );
};

export default HomepageScreen;
const styles = StyleSheet.create({

  logo: { 
    width: 40, 
    height: 40,
    tintColor: '#0086b3'
  },
  logoTablet: {
    width: 100,
    height: 100,
  },
  logoWrapper: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 35) : 45,
    left: 35,
    zIndex: 30,
  },
  logoWrapperTablet: {
    top: 80,
    left: 60,
  },

  translationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 0,
  },
  translationContainerLandscape: { 
    paddingHorizontal: 80, 
    paddingVertical: 20
  },
  translationContainerTablet: { 
    paddingHorizontal: 120, 
    paddingVertical: 30,
    paddingTop: 200,
  },
  translationContainerTabletLandscape: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 160,
    paddingVertical: 40,
    paddingBottom: 30
  },

  translationBox: {
    backgroundColor: '#f2f2f2',
    borderRadius: 12,
    paddingHorizontal: 25,
    paddingVertical: 30,
    marginBottom: 15,
    alignSelf: 'center',
    maxWidth: '90%',
    height: 510,
    overflow: 'hidden'
  },
  translationBoxLandscape: { 
    height: 255, 
    width: 600, 
    paddingHorizontal: 18
  },
  translationBoxTablet: {
    width: '70%',
    height: 780,
    paddingHorizontal: 50,
    paddingVertical: 50,
    maxWidth: 700,
  },
  translationBoxTabletLandscape: {
    width: '110%',
    height: 590,
    paddingHorizontal: 60,
    paddingVertical: 40,
    maxWidth: 900,
  },

  translationText: { 
    textAlign: 'center', 
    fontSize: 18, 
    color: '#333',
    lineHeight: 24,
  },
  translationTextLandscape: { 
    fontSize: 16 
  },
  translationTextTablet: { 
    fontSize: 29, 
    lineHeight: 30 
  },
  translationTextTabletLandscape: {
    fontSize: 29,
    lineHeight: 32,
    textAlign: 'center',
  },
  translationTextWrapper: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  highlightedWord: {
    backgroundColor: '#FFD700',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    color: '#000',
    fontWeight: 'bold',
  },
  normalWord: {
    backgroundColor: 'transparent',
  },

  sideMenu: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 20,
    elevation: 8,
    zIndex: 15,
  },
  sideMenuLandscape: { 
    paddingTop: 60 
  },
  sideMenuTablet: {
    paddingHorizontal: 40,
  },
  sideMenuTabletLandscape: {
    width: '30%',
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  menuHeaderTablet: {
    marginBottom: 40,
  },
  menuHeaderTabletLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 50,
  },
  menuLogo: { 
    width: 60, 
    height: 60 
  },
  menuLogoTablet: {
    width: 100,
    height: 100,
  },
  menuLogoTabletLandscape: {
    width: 110,
    height: 110,
    marginRight: 5,
  },
  logoContainer: { 
    marginRight: 2 
  },
  motionText: { 
    fontSize: 26, 
    fontWeight: 'bold', 
    color: '#0086b3', 
    marginTop: 13 
  },
  speakText: { 
    color: '#606060' 
  },
  motionTextTablet: {
    fontSize: 38,
  },
  menuButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 18 
  },
  menuButtonTablet: {
    paddingVertical: 26,
  },
  menuButtonTabletLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    justifyContent: 'flex-start',
  },
  menuIcon: { 
    width: 22, 
    height: 22, 
    tintColor: '#0086b3', 
    marginLeft: 22 
  },
  menuIconTablet: {
    width: 36,
    height: 36,
  },
  menuIconTabletLandscape: {
    width: 36,
    height: 36,
    marginLeft: 22,
  },
  menuText: { 
    fontSize: 16, 
    color: '#0086b3', 
    marginLeft: 15 
  },
  menuTextTablet: { 
    fontSize: 22, 
  },
  menuTextTabletLandscape: {
    fontSize: 24,
  },
  menuScrollContainer: { 
    paddingBottom: 60 
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 10,
  },
  overlayTouchable: { 
    flex: 1 
  },

  // Settings Modal Styles
  settingsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  settingsModalOverlayTouchable: {
    flex: 1,
  },
  settingsModalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    minHeight: 300,
  },
  settingsModalContainerTablet: {
    padding: 40,
    minHeight: 400,
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  settingsTitleTablet: {
    fontSize: 28,
  },
  settingsOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingsOptionText: {
    fontSize: 16,
    color: '#333',
  },
  settingsOptionTextTablet: {
    fontSize: 20,
  },
  comingSoonText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  languageValue: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },

  // Language Modal Styles
  languageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  languageModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 25,
    width: '90%',
    maxWidth: 400,
  },
  languageModalContainerTablet: {
    padding: 40,
    maxWidth: 500,
  },
  languageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
  },
  languageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  languageTitleTablet: {
    fontSize: 28,
  },
  languageOptions: {
    marginBottom: 25,
  },
  languageOption: {
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#f0f0f0',
  },
  languageOptionSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#f0f8ff',
  },
  languageOptionText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
  languageOptionTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  okButton: {
    borderRadius: 40,
    overflow: 'hidden',
  },
  okButtonGradient: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  okButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Common Styles
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
    fontWeight: '300',
  },

  // Font Size Modal Styles
fontSizeModalOverlay: {
  flex: 1,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  justifyContent: 'center',
  alignItems: 'center',
  paddingHorizontal: 20,
},
fontSizeModalContainer: {
  backgroundColor: '#fff',
  borderRadius: 20,
  padding: 25,
  width: '90%',
  maxWidth: 400,
},
fontSizeModalContainerTablet: {
  padding: 40,
  maxWidth: 500,
},
fontSizeHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 20,
},
fontSizeTitle: {
  fontSize: 20,
  fontWeight: '700',
  color: '#000',
},
fontSizeTitleTablet: {
  fontSize: 28,
},
sliderText: {
  fontSize: 16,
  color: '#333',
  textAlign: 'center',
  marginBottom: 25,
},
sliderTextTablet: {
  fontSize: 20,
},
sliderContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 15,
},
slider: {
  flex: 1,
  height: 40,
  marginHorizontal: 10,
},
sliderLabel: {
  fontSize: 12,
  color: '#666',
  width: 40,
  textAlign: 'center',
},
currentSizeContainer: {
  alignItems: 'center',
  marginBottom: 25,
},
currentSizeText: {
  fontSize: 18,
  fontWeight: 'bold',
  color: '#007AFF',
},
previewContainer: {
  backgroundColor: '#f2f2f2',
  padding: 20,
  borderRadius: 12,
  marginBottom: 25,
  alignItems: 'center',
},
previewText: {
  color: '#333',
  textAlign: 'center',
},
fontSizeValue: {
  fontSize: 14,
  color: '#007AFF',
  fontWeight: '500',
},

// TTS Speed Modal Styles
speedModalOverlay: {
  flex: 1,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  justifyContent: 'center',
  alignItems: 'center',
  paddingHorizontal: 20,
},
speedModalContainer: {
  backgroundColor: '#fff',
  borderRadius: 20,
  padding: 25,
  width: '90%',
  maxWidth: 400,
},
speedModalContainerTablet: {
  padding: 40,
  maxWidth: 500,
},
speedHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 20,
},
speedTitle: {
  fontSize: 20,
  fontWeight: '700',
  color: '#000',
},
speedTitleTablet: {
  fontSize: 28,
},
speedSliderContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 15,
},
speedSlider: {
  flex: 1,
  height: 40,
  marginHorizontal: 10,
},
speedSliderLabel: {
  fontSize: 12,
  color: '#666',
  width: 40,
  textAlign: 'center',
},
currentSpeedContainer: {
  alignItems: 'center',
  marginBottom: 25,
},
currentSpeedText: {
  fontSize: 24,
  fontWeight: 'bold',
  color: '#007AFF',
  marginBottom: 5,
},
speedDescription: {
  fontSize: 14,
  color: '#666',
  textAlign: 'center',
},
speedValue: {
  fontSize: 14,
  color: '#007AFF',
  fontWeight: '500',
},

//========================//

// Safe Area Container
safeContainer: {
  flex: 1,
  backgroundColor: '#fff',
},
container: { 
  flex: 1, 
  backgroundColor: '#fff' 
},
landscapeContainer: {
  justifyContent: 'center',
  alignItems: 'center',
  paddingHorizontal: 40,
},
tabletContainer: {
  justifyContent: 'center',
  alignItems: 'center',
  paddingHorizontal: 100,
},

// Translation Wrapper
translationWrapper: {
  flex: 1,
  justifyContent: 'center',
},

// Buttons Container Styles
buttonsContainer: {
  width: '100%',
  alignItems: 'center',
  paddingBottom: 20,
},
buttonsContainerLandscape: {
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  paddingBottom: 20,
},
buttonsContainerTablet: {
  paddingBottom: 40,
},
buttonsContainerTabletLandscape: {
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  paddingBottom: 20,
},

// READ ALOUD STYLES
readAloudContainer: {
  width: '100%',
  alignItems: 'center',
  marginBottom: 15,
},
readAloudContainerLandscape: {
  width: 'auto',
  marginRight: 15,
  marginBottom: 0,
},
readAloudContainerTablet: {
  marginBottom: 20,
},

gradientButton: {
  borderRadius: 50,
  alignSelf: 'center',
  overflow: 'hidden',
  height: 48,
  minWidth: 160,
},
gradientButtonLandscape: { 
  marginBottom: 0,
},
gradientButtonTablet: { 
  height: 60, 
  minWidth: 240, 
},

readAloudButtonOff: {
  borderRadius: 50,
  alignSelf: 'center',
  overflow: 'hidden',
  backgroundColor: '#cccccc',
  height: 48,
  minWidth: 160,
  justifyContent: 'center',
},

gradientFill: { 
  flex: 1, 
  borderRadius: 50, 
  justifyContent: 'center' 
},
readButtonTouchable: { 
  flex: 1, 
  justifyContent: 'center' 
},
readButton: { 
  flexDirection: 'row', 
  alignItems: 'center', 
  justifyContent: 'center', 
  paddingHorizontal: 40, 
},
readText: { 
  color: '#fff', 
  fontWeight: '600', 
  marginRight: 10, 
  fontSize: 16 
},
readTextOff: { 
  color: '#666', 
  fontWeight: '600', 
  marginRight: 10, 
  fontSize: 16 
},
readTextTablet: { 
  fontSize: 20 
},
speakIcon: { 
  width: 30, 
  height: 30, 
  tintColor: '#fff' 
},
speakIconOff: { 
  width: 30, 
  height: 30, 
  tintColor: '#666' 
},
speakIconTablet: { 
  width: 38, 
  height: 38 
},
buttonDisabled: {
  opacity: 0.6,
},
ttsNotReadyText: {
  fontSize: 12,
  color: '#666',
  textAlign: 'center',
  marginTop: 5,
},

// CLEAR MESSAGE BOARD STYLES
clearMessageContainer: {
  width: '100%',
  alignItems: 'center',
},
clearMessageContainerLandscape: {
  width: 'auto',
},
clearMessageContainerTablet: {
  // No additional styles needed
},
clearMessageButton: {
  borderRadius: 50,
  alignSelf: 'center',
  overflow: 'hidden',
  height: 48,
  minWidth: 200,
},
clearMessageButtonLandscape: {
  height: 45,
  minWidth: 180,
},
clearMessageButtonTablet: {
  height: 60,
  minWidth: 280,
},
clearMessageGradient: {
  flex: 1,
  borderRadius: 50,
  justifyContent: 'center',
},
clearMessageButtonContent: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 25,
},
clearMessageText: {
  color: '#fff',
  fontWeight: '600',
  fontSize: 16,
},
clearMessageTextTablet: {
  fontSize: 20,
},
emptyMessageText: {
  color: '#999',
  fontStyle: 'italic',
  textAlign: 'center',
},
});