import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Image,
  Platform,
  PanResponder,
  Dimensions,
  Vibration,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/StackNavigator';
import { useLanguage } from '../context/LanguageContext';
import { useFontSize } from '../context/FontSizeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type TipsScreenNewProps = {
  route?: {
    params?: {
      fromHomepage?: boolean;
    };
  };
};

const TipsScreenNew: React.FC<TipsScreenNewProps> = ({ route }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { language, setLanguage } = useLanguage();
  const { fontSizePercentage } = useFontSize();
  const insets = useSafeAreaInsets();
  
  const [page, setPage] = useState<number>(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);
  const [shouldShowTips, setShouldShowTips] = useState<boolean | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current; // CHANGED FROM 0 TO 1
  const blurAnim = useRef(new Animated.Value(0)).current;
  const langModalScale = useRef(new Animated.Value(0)).current;

  const nextButtonAnim = useRef(new Animated.Value(1)).current;
  const backButtonAnim = useRef(new Animated.Value(1)).current;
  const langYesButtonAnim = useRef(new Animated.Value(1)).current;
  const langNoButtonAnim = useRef(new Animated.Value(1)).current;

  const NEXT_BUTTON_COLOR = '#1BC4AB';
  const BACK_BUTTON_COLOR = '#430A6D';
  const BUTTON_PRESSED_OPACITY = 0.7;
  const rightArrow = require('../assets/next_arrow.png');
  const leftArrow = require('../assets/back_arrow.png');

  const fromHomepage = route?.params?.fromHomepage || false;

  const pages = useMemo(() => [
    {
      header: language === 'tagalog' ? 'Pagkilala ng Galaw' : 'Gesture Recognition',
      body: language === 'tagalog'
        ? 'Nauunawaan ang iyong mga galaw.\n\nIwagayway, ituro, o mag-sign, binabasa ng aming AI ang iyong mga kilos sa totoong oras.'
        : 'Your Movements, Understood\n\nWave, point, or sign, our AI reads your motions and translates them in real time.',
      image: require('../assets/tip_slide_1.png'),
    },
    {
      header: language === 'tagalog' ? 'Madaling Komunikasyon' : 'Communication Made Easy',
      body: language === 'tagalog'
        ? 'Ibahagi ang Iyong Mga Galaw\n\nGinagawang malinaw na teksto o audio ang iyong mga kilos upang maunawaan ka ng lahat saan ka man pumunta.'
        : 'Share Your Gestures\n\nTurn your gestures into clear text or audio so anyone can understand you, anywhere you go.',
      image: require('../assets/tip_slide_2.png'),
    },
    {
      header: language === 'tagalog' ? 'Handa Nang Isalin' : 'Ready to Translate',
      body: language === 'tagalog'
        ? 'Konektado ang kilos sa kahulugan.\n\nHayaan ang MotionSpeak na magsalita para sa iyo, anumang oras, kahit saan.'
        : 'Seamlessly connect gestures to meaning.\n\nLet MotionSpeak do the talking for you, anytime, anywhere.',
      image: require('../assets/tip_slide_3.png'),
    },
  ], [language]);

  useEffect(() => {
    loadDarkModePreference();
    checkFirstTimeUser();
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

  const checkFirstTimeUser = async () => {
    try {
      const hasSeenTips = await AsyncStorage.getItem('hasSeenTips');
      const hasSeenLangPrompt = await AsyncStorage.getItem('hasSeenLangPrompt');
      
      if (hasSeenTips === null) {
        setShouldShowTips(true);
        
        if (hasSeenLangPrompt === null && !fromHomepage) {
          setTimeout(() => {
            setShowLangModal(true);
            Animated.timing(langModalScale, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }).start();
          }, 1000);
        }
      } else {
        if (fromHomepage) {
          setShouldShowTips(true);
        } else {
          setShouldShowTips(false);
          navigation.navigate('Home');
        }
      }
    } catch (error) {
      setShouldShowTips(true);
    }
  };

  const markTipsAsSeen = async () => {
    try {
      await AsyncStorage.setItem('hasSeenTips', 'true');
    } catch (error) {
      console.error('Error saving tips status:', error);
    }
  };

  const markLanguagePromptAsSeen = async () => {
    try {
      await AsyncStorage.setItem('hasSeenLangPrompt', 'true');
    } catch (error) {
      console.error('Error saving language prompt status:', error);
    }
  };

  useEffect(() => {
    const updateLayout = ({ window }: { window: { width: number; height: number } }) => {
      const { width, height } = window;
      setIsLandscape(width > height);
      setIsTablet(Math.min(width, height) >= 600);
    };

    const { width, height } = Dimensions.get('window');
    setIsLandscape(width > height);
    setIsTablet(Math.min(width, height) >= 600);

    const subscription = Dimensions.addEventListener('change', updateLayout);
    return () => subscription?.remove?.();
  }, []);

  const closeLangModal = () => {
    Animated.timing(langModalScale, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowLangModal(false);
    });
  };

  const handleLangYes = async () => {
    Vibration.vibrate(20);
    setLanguage('tagalog');
    await markLanguagePromptAsSeen();
    closeLangModal();
  };

  const handleLangNo = async () => {
    Vibration.vibrate(20);
    setLanguage('english');
    await markLanguagePromptAsSeen();
    closeLangModal();
  };

  const slideToPage = (newPage: number, direction: 'left' | 'right') => {
    Animated.timing(blurAnim, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();

    const slideOut = Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: direction === 'left' ? -SCREEN_WIDTH : SCREEN_WIDTH,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]);

    const slideIn = Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]);

    slideOut.start(() => {
      setPage(newPage);
      slideAnim.setValue(direction === 'left' ? SCREEN_WIDTH : -SCREEN_WIDTH);
      slideIn.start(() => {
        Animated.timing(blurAnim, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }).start();
      });
    });
  };

  const handlePressIn = (buttonAnim: Animated.Value) => {
    Animated.timing(buttonAnim, {
      toValue: BUTTON_PRESSED_OPACITY,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = (buttonAnim: Animated.Value) => {
    Animated.timing(buttonAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy * 2);
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx } = gestureState;
        const swipeThreshold = 50;

        if (dx < -swipeThreshold && page < pages.length - 1) {
          slideToPage(page + 1, 'left');
        } else if (dx > swipeThreshold && page > 0) {
          slideToPage(page - 1, 'right');
        }
      },
    })
  ).current;

  const goNext = () => {
    if (page < pages.length - 1) {
      slideToPage(page + 1, 'left');
    } else {
      markTipsAsSeen();
      navigation.navigate('Home');
    }
  };

  const goBack = () => {
    if (page > 0) {
      slideToPage(page - 1, 'right');
    } else {
      Vibration.vibrate(20);
      navigation.navigate('Home');
    }
  };

  const renderBodyText = (text: string) => {
    const parts = text.split('\n\n');
    if (parts.length > 1) {
      return (
        <View>
          <Text style={[
            styles.bodyTextBold, 
            isLandscape && styles.bodyTextBoldLandscape, 
            isTablet && styles.bodyTextBoldTablet,
            { fontSize: 19 * (fontSizePercentage / 100), color: isDarkMode ? '#fff' : '#222' }
          ]}>{parts[0]}</Text>
          <Text style={[
            styles.bodyTextNormal, 
            isLandscape && styles.bodyTextNormalLandscape, 
            isTablet && styles.bodyTextNormalTablet,
            { fontSize: 19 * (fontSizePercentage / 100), color: isDarkMode ? '#fff' : '#222' }
          ]}>{'\n\n' + parts[1]}</Text>
        </View>
      );
    }
    return <Text style={[
      styles.bodyTextNormal, 
      isLandscape && styles.bodyTextNormalLandscape, 
      isTablet && styles.bodyTextNormalTablet,
      { fontSize: 19 * (fontSizePercentage / 100), color: isDarkMode ? '#fff' : '#222' }
    ]}>{text}</Text>;
  };

  const isLast = page === pages.length - 1;

  if (shouldShowTips === null) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isDarkMode ? '#1a1a1a' : '#fff' }]}>
      </View>
    );
  }

  if (shouldShowTips === false) {
    return null;
  }

  const MainContent = () => (
    <View style={[
      styles.screen, 
      isLandscape && styles.screenLandscape, 
      isTablet && styles.screenTablet,
      { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isDarkMode ? '#1a1a1a' : '#fff' }
    ]}>
      <View style={[styles.topBar, isLandscape && styles.topBarLandscape]}>
        <View style={styles.indicatorRow}>
          {pages.map((_, i) => {
            const activeColor = i === page ? (isLast ? '#00FFFF' : '#007AFF') : '#D3D3D3';
            return <View key={i} style={[styles.indicator, { backgroundColor: activeColor }]} />;
          })}
        </View>
      </View>

      <View style={[styles.contentContainer, isLandscape && styles.contentContainerLandscape]} {...panResponder.panHandlers}>
        <Animated.View 
          style={[
            styles.contentWrap,
            isLandscape && styles.contentWrapLandscape,
            {
              transform: [
                { translateX: slideAnim },
                {
                  scale: blurAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0.98],
                  }),
                },
              ],
              opacity: fadeAnim,
            }
          ]}
        >
          <View style={[styles.middleContent, isLandscape && styles.middleContentLandscape]}>
            <View style={[styles.landscapeContentContainer, isLandscape && styles.landscapeContentContainerLandscape]}>
              <Image source={pages[page].image} style={[styles.tipsImage, isLandscape && styles.tipsImageLandscape, isTablet && styles.tipsImageTablet]} resizeMode="contain" />
              <View style={[styles.textContent, isLandscape && styles.textContentLandscape ]}>
                <Text style={[
                  styles.headerPlain, 
                  isLandscape && styles.headerPlainLandscape, 
                  isTablet && styles.headerPlainTablet,
                  { fontSize: 30 * (fontSizePercentage / 100), color: isDarkMode ? '#fff' : '#000' }
                ]}>{pages[page].header}</Text>
                {renderBodyText(pages[page].body)}
              </View>
            </View>
          </View>
        </Animated.View>
      </View>

      <View style={[styles.bottomBar, isLandscape && styles.bottomBarLandscape]}>
        <View style={[styles.buttonsContainer, styles.dualButtonSpace]}>
          <TouchableOpacity
            activeOpacity={1}
            onPressIn={() => handlePressIn(backButtonAnim)}
            onPressOut={() => handlePressOut(backButtonAnim)}
            onPress={goBack}
            style={[isLandscape ? [styles.buttonWrapperSmall, { width: 150 }] : styles.buttonWrapperSmall, isTablet && styles.buttonWrapperTablet]}>
            <Animated.View 
              style={[
                styles.solidButton,
                { backgroundColor: BACK_BUTTON_COLOR },
                { opacity: backButtonAnim }
              ]}
            >
              <View style={styles.buttonContent}>
                <Image source={leftArrow} style={[styles.arrowIcon, styles.leftArrow]} />
                <Text style={[
                  styles.buttonLabel, 
                  isTablet && styles.buttonLabelTablet,
                  { fontSize: 16 * (fontSizePercentage / 100) }
                ]}>
                  {language === 'english' ? 'Back' : 'Bumalik'}
                </Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={1}
            onPressIn={() => handlePressIn(nextButtonAnim)}
            onPressOut={() => handlePressOut(nextButtonAnim)}
            onPress={() => {
              Vibration.vibrate(20);
              goNext();
            }}
            style={[isLandscape ? [styles.buttonWrapperSmall, { width: 150 }] : styles.buttonWrapperSmall, isTablet && styles.buttonWrapperTablet]}>
            <Animated.View 
              style={[
                styles.solidButton,
                { backgroundColor: NEXT_BUTTON_COLOR },
                { opacity: nextButtonAnim }
              ]}
            >
              <View style={styles.buttonContent}>
                <Text style={[
                  styles.buttonLabel, 
                  isTablet && styles.buttonLabelTablet,
                  { fontSize: 16 * (fontSizePercentage / 100) }
                ]}>
                  {isLast 
                    ? (language === 'english' ? 'Start' : 'Magsimula')
                    : (language === 'english' ? 'Next' : 'Susunod')
                  }
                </Text>
                <Image source={rightArrow} style={[styles.arrowIcon, styles.rightArrow]} />
              </View>
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showLangModal} transparent={true} animationType="none" onRequestClose={closeLangModal}>
        <View style={[styles.modalOverlay, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)' }]}>
          <Animated.View style={[styles.modalContainer, isTablet && styles.modalContainerTablet, { transform: [{ scale: langModalScale }], backgroundColor: isDarkMode ? '#2a2a2a' : '#fff' }]}>
            <View style={styles.langModalHeader}>
              <Image source={require('../assets/logo_alt.png')} style={styles.langModalLogo} resizeMode="contain" />
              <View style={styles.langModalTitleContainer}>
                <Text style={[styles.langModalTitleTop, { color: isDarkMode ? '#fff' : '#000' }]}>
                  {language === 'tagalog' ? 'Maligayang pagdating sa' : 'Welcome to'}
                </Text>
                <Text style={styles.langModalTitleMain}>
                  <Text style={[styles.motion, { color: isDarkMode ? '#00bfff' : '#0086b3' }]}>Motion</Text>
                  <Text style={[styles.speak, { color: isDarkMode ? '#ccc' : '#808080' }]}>Speak</Text>
                </Text>
              </View>
            </View>

            <Text style={[styles.modalHeader, { fontSize: 24 * (fontSizePercentage / 100), color: isDarkMode ? '#fff' : '#000' }]}>
              {language === 'english' ? 'Change Language' : 'Palitan ang Wika'}
            </Text>
            <Text style={[styles.modalBody, { fontSize: 16 * (fontSizePercentage / 100), color: isDarkMode ? '#fff' : '#222' }]}>
              {language === 'english' 
                ? 'Would you like to change the app language to Tagalog?'
                : 'Gusto mo bang palitan ang wika ng app sa Tagalog?'
              }
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonWrapper}
                onPressIn={() => handlePressIn(langYesButtonAnim)}
                onPressOut={() => handlePressOut(langYesButtonAnim)}
                onPress={handleLangYes}
                activeOpacity={1}
              >
                <Animated.View 
                  style={[
                    styles.solidButton,
                    { backgroundColor: NEXT_BUTTON_COLOR },
                    { opacity: langYesButtonAnim }
                  ]}
                >
                  <Text style={[styles.modalButtonText, { fontSize: 16 * (fontSizePercentage / 100) }]}>
                    {language === 'english' ? 'Yes' : 'Oo'}
                  </Text>
                </Animated.View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalButtonWrapper}
                onPressIn={() => handlePressIn(langNoButtonAnim)}
                onPressOut={() => handlePressOut(langNoButtonAnim)}
                onPress={handleLangNo}
                activeOpacity={1}
              >
                <Animated.View 
                  style={[
                    styles.solidButton,
                    { backgroundColor: BACK_BUTTON_COLOR },
                    { opacity: langNoButtonAnim }
                  ]}
                >
                  <Text style={[styles.modalButtonText, { fontSize: 16 * (fontSizePercentage / 100) }]}>
                    {language === 'english' ? 'No' : 'Hindi'}
                  </Text>
                </Animated.View>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );

  return <MainContent />;
};

export default TipsScreenNew;

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: '#fff'},
  screen: {flex: 1, backgroundColor: '#fff'},
  screenLandscape: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20},
  screenTablet: {paddingHorizontal: 80, justifyContent: 'center'},
  topBar: {height: Platform.OS === 'ios' ? 96 : 80, justifyContent: 'flex-end', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 28 : 10},
  topBarLandscape: {height: 60, paddingTop: 0, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, alignItems: 'center', justifyContent: 'center'},
  contentContainer: {flex: 1, width: '100%'},
  contentContainerLandscape: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  contentWrap: {flex: 1, alignItems: 'center', paddingHorizontal: 28, justifyContent: 'center', width: '100%'},
  contentWrapLandscape: {paddingHorizontal: 40, justifyContent: 'center', alignItems: 'center', flex: 1},
  middleContent: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  middleContentLandscape: {position: 'absolute', top: '50%', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: -100 }]},
  landscapeContentContainer: {alignItems: 'center'},
  landscapeContentContainerLandscape: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 40},
  bottomBar: {paddingBottom: 36, alignItems: 'center'},
  bottomBarLandscape: {position: 'absolute', bottom: '2%', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: '2%'},
  buttonsContainer: {width: '100%', paddingHorizontal: 20},
  dualButtonSpace: {flexDirection: 'row', justifyContent: 'center', gap: 20},
  singleButtonCenter: {flexDirection: 'row', justifyContent: 'center'},
  tipsImage: {width: 200, height: 200, marginBottom: 20, borderRadius: 20},
  tipsImageLandscape: {width: 180, height: 180, borderRadius: 15, alignSelf: 'center'},
  tipsImageTablet: {width: 320, height: 320, marginBottom: 30},
  textContent: {alignItems: 'center'},
  textContentLandscape: {alignItems: 'flex-start', justifyContent: 'center', maxWidth: 300},
  headerPlain: {fontSize: 30, fontWeight: '700', textAlign: 'center', color: '#000', marginBottom: 8},
  headerPlainLandscape: {fontSize: 24, marginBottom: 6, textAlign: 'left'},
  headerPlainTablet: {fontSize: 40, marginBottom: 10},
  bodyTextBold: {fontSize: 19, color: '#222', textAlign: 'center', lineHeight: 26, marginTop: 0, fontWeight: '700'},
  bodyTextBoldLandscape: {fontSize: 16, lineHeight: 22, textAlign: 'left'},
  bodyTextBoldTablet: {fontSize: 26, lineHeight: 34},
  bodyTextNormal: {fontSize: 19, color: '#222', textAlign: 'center', lineHeight: 26, fontWeight: '400'},
  bodyTextNormalLandscape: {fontSize: 16, lineHeight: 22, textAlign: 'left'},
  bodyTextNormalTablet: {fontSize: 22, lineHeight: 32},
  solidButton: {paddingVertical: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 40},
  buttonContent: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  arrowIcon: {width: 16, height: 16, tintColor: '#fff'},
  leftArrow: {marginRight: 8},
  rightArrow: {marginLeft: 8},
  buttonWrapperSmall: {width: 150, borderRadius: 40, overflow: 'hidden'},
  buttonWrapperLarge: {width: 150, borderRadius: 40, overflow: 'hidden'},
  buttonWrapperTablet: {width: 250},
  buttonLabel: {color: '#fff', fontSize: 16, fontWeight: '700'},
  buttonLabelTablet: {fontSize: 20},
  indicatorRow: {flexDirection: 'row', alignItems: 'center'},
  indicator: {width: 36, height: 8, borderRadius: 6, marginHorizontal: 6},
  modalOverlay: {flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20},
  modalContainer: {backgroundColor: '#fff', borderRadius: 20, padding: 30, width: '90%', maxWidth: 400, minHeight: 280, alignItems: 'center', shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5},
  modalContainerTablet: {width: '70%', maxWidth: 600, padding: 40},
  modalButtons: {flexDirection: 'column', justifyContent: 'center', gap: 15, width: '70%'},
  modalButtonWrapper: {width: '100%', borderRadius: 40, overflow: 'hidden'},
  modalHeader: {fontSize: 24, fontWeight: '700', color: '#000', marginBottom: 15, textAlign: 'center'},
  modalBody: {fontSize: 16, color: '#222', textAlign: 'center', lineHeight: 22, marginBottom: 25},
  modalButtonText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  modalButtonTextTablet: {fontSize: 18},
  yesText: {color: '#118472', fontWeight: '600'},
  noText: {color: '#430A6D', fontWeight: '600'},
  langModalHeader: {alignItems: 'center', marginBottom: 20},
  langModalLogo: {width: 100, height: 100, marginBottom: 10},
  langModalTitleContainer: {alignItems: 'center'},
  langModalTitleTop: {fontSize: 16, color: '#000', fontWeight: '600', textAlign: 'center'},
  langModalTitleMain: {fontSize: 24, fontWeight: '800', textAlign: 'center', lineHeight: 28, marginTop: 4},
  motion: {color: '#0086b3'},
  speak: {color: '#808080'},
});