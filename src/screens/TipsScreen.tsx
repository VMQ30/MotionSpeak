import React, { useState, useRef, useEffect } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/StackNavigator';
import { useLanguage } from '../context/LanguageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TipsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { language, setLanguage } = useLanguage();
  const [page, setPage] = useState<number>(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showLangModal, setShowLangModal] = useState(true);
  const [shouldShowTips, setShouldShowTips] = useState<boolean | null>(null);
  
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const blurAnim = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0)).current;
  const langModalScale = useRef(new Animated.Value(0)).current;

  // Button press animations
  const nextButtonAnim = useRef(new Animated.Value(1)).current;
  const backButtonAnim = useRef(new Animated.Value(1)).current;
  const modalYesButtonAnim = useRef(new Animated.Value(1)).current;
  const modalNoButtonAnim = useRef(new Animated.Value(1)).current;
  const langYesButtonAnim = useRef(new Animated.Value(1)).current;
  const langNoButtonAnim = useRef(new Animated.Value(1)).current;

  // Button colors
  const NEXT_BUTTON_COLOR = '#1BC4AB'; // Teal green
  const BACK_BUTTON_COLOR = '#430A6D'; // Deep purple
  const BUTTON_PRESSED_OPACITY = 0.7; // Lighter when pressed

  // Arrow images
  const rightArrow = require('../assets/next_arrow.png');
  const leftArrow = require('../assets/back_arrow.png');

  // Check if first time user
  useEffect(() => {
    checkFirstTimeUser();
  }, []);

  const checkFirstTimeUser = async () => {
    try {
      const hasSeenTips = await AsyncStorage.getItem('hasSeenTips');
      if (hasSeenTips === null) {
        // First time user - show tips
        setShouldShowTips(true);
      } else {
        // Returning user - skip tips and go to home
        setShouldShowTips(false);
        navigation.navigate('Home');
      }
    } catch (error) {
      console.error('Error checking first time user:', error);
      // If error, show tips to be safe
      setShouldShowTips(true);
    }
  };

  // Mark tips as seen
  const markTipsAsSeen = async () => {
    try {
      await AsyncStorage.setItem('hasSeenTips', 'true');
    } catch (error) {
      console.error('Error saving tips status:', error);
    }
  };

  useEffect(() => {
  const updateLayout = ({ window }: { window: { width: number; height: number } }) => {
    const { width, height } = window;
    setIsLandscape(width > height);
    setIsTablet(Math.min(width, height) >= 600);
  };

  // Initial layout setup
  const { width, height } = Dimensions.get('window');
  setIsLandscape(width > height);
  setIsTablet(Math.min(width, height) >= 600);

  const subscription = Dimensions.addEventListener('change', updateLayout);

  return () => subscription?.remove?.();
}, []);

  useEffect(() => {
  Animated.timing(langModalScale, {
    toValue: 1,
    duration: 300,
    useNativeDriver: true,
  }).start();
}, []);

// Close language modal
const closeLangModal = () => {
  Animated.timing(langModalScale, {
    toValue: 0,
    duration: 200,
    useNativeDriver: true,
  }).start(() => {
    setShowLangModal(false);
  });
};

// Handle Yes / No for language change
const handleLangYes = async () => {
  Vibration.vibrate(20);
  setLanguage('tagalog');
  await markTipsAsSeen();
  closeLangModal();
};

const handleLangNo = async () => {
  Vibration.vibrate(20);
  setLanguage('english');
  await markTipsAsSeen();
  closeLangModal();
};

  const pages = [
  {
    special: true,
    logo: require('../assets/logo_alt.png'),
    headerLines: {
      top: language === 'tagalog' ? 'Maligayang pagdating sa' : 'Welcome to',
      motion: 'Motion',
      speak: 'Speak',
    },
    body:
      language === 'tagalog'
        ? 'Ginagawang salita ang iyong mga galaw para sa mabilis na komunikasyon'
        : 'We turn gestures into words. Communicate faster, smarter, and hands-on with your gestures.',
  },
  {
    special: false,
    header: language === 'tagalog' ? 'Pagkilala ng Galaw' : 'Gesture Recognition',
    body:
      language === 'tagalog'
        ? 'Nauunawaan ang iyong mga galaw.\n\nIwagayway, ituro, o mag-sign, binabasa ng aming AI ang iyong mga kilos sa totoong oras.'
        : 'Your Movements, Understood\n\nWave, point, or sign, our AI reads your motions and translates them in real time.',
    image: require('../assets/tip_slide_1.png'),
  },
  {
    special: false,
    header: language === 'tagalog' ? 'Madaling Komunikasyon' : 'Communication Made Easy',
    body:
      language === 'tagalog'
        ? 'Ibahagi ang Iyong Mga Galaw\n\nGinagawang malinaw na teksto o audio ang iyong mga kilos upang maunawaan ka ng lahat saan ka man pumunta.'
        : 'Share Your Gestures\n\nTurn your gestures into clear text or audio so anyone can understand you, anywhere you go.',
    image: require('../assets/tip_slide_2.png'),
  },
  {
    special: false,
    header: language === 'tagalog' ? 'Handa Nang Isalin' : 'Ready to Translate',
    body:
      language === 'tagalog'
        ? 'Konektado ang kilos sa kahulugan.\n\nHayaan ang MotionSpeak na magsalita para sa iyo, anumang oras, kahit saan.'
        : 'Seamlessly connect gestures to meaning.\n\nLet MotionSpeak do the talking for you, anytime, anywhere.',
    image: require('../assets/tip_slide_3.png'),
  },
];


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

  const showQuickGuideModal = () => {
    setShowModal(true);
    Animated.timing(modalScale, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const hideQuickGuideModal = () => {
    Animated.timing(modalScale, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowModal(false);
    });
  };

  const handleYes = async () => {
    await markTipsAsSeen();
    hideQuickGuideModal();
    navigation.navigate('Tutorial', { fromTips: true });
  };

  const handleNo = async () => {
    await markTipsAsSeen();
    hideQuickGuideModal();
    navigation.navigate('Home');
  };

  // Button press handlers with animation
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

  useEffect(() => {
    if (page === 0) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, []);

  const goNext = () => {
    if (page < pages.length - 1) {
      slideToPage(page + 1, 'left');
    } else {
      showQuickGuideModal();
    }
  };

  const goBack = () => {
    if (page > 0) {
      slideToPage(page - 1, 'right');
    }
  };

  const renderBodyText = (text: string) => {
    const parts = text.split('\n\n');
    if (parts.length > 1) {
      return (
        <View>
          <Text style={[styles.bodyTextBold, isLandscape && styles.bodyTextBoldLandscape, isTablet && styles.bodyTextBoldTablet]}>{parts[0]}</Text>
          <Text style={[styles.bodyTextNormal, isLandscape && styles.bodyTextNormalLandscape, isTablet && styles.bodyTextNormalTablet]}>{'\n\n' + parts[1]}</Text>
        </View>
      );
    }
    return <Text style={[styles.bodyTextNormal, isLandscape && styles.bodyTextNormalLandscape, isTablet && styles.bodyTextNormalTablet]}>{text}</Text>;
  };

  const isLast = page === pages.length - 1;

  const getButtonWrapperStyle = () => {
    if (page === 0) {
      return isLandscape ? [styles.buttonWrapperLarge, { width: 150 }] : styles.buttonWrapperLarge;
    } else {
      return isLandscape ? [styles.buttonWrapperSmall, { width: 150 }] : styles.buttonWrapperSmall;
    }
  };

  // Don't show anything while checking
  if (shouldShowTips === null) {
    return (
      <View style={styles.screen}>
        {/* You can add a loading spinner here if needed */}
      </View>
    );
  }

  // Don't show tips screen for returning users
  if (shouldShowTips === false) {
    return null;
  }

  const MainContent = () => (
    <View style={[styles.screen, isLandscape && styles.screenLandscape, isTablet && styles.screenTablet]}>
      {/* page indicator - TOP */}
      <View style={[styles.topBar, isLandscape && styles.topBarLandscape]}>
        <View style={styles.indicatorRow}>
          {pages.map((_, i) => {
            const activeColor = i === page ? (isLast ? '#00FFFF' : '#007AFF') : '#D3D3D3';
            return <View key={i} style={[styles.indicator, { backgroundColor: activeColor }]} />;
          })}
        </View>
      </View>

      {/* swipeable content - MIDDLE */}
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
          {pages[page].special && pages[page].logo ? (
            <View style={[styles.firstPageContent, isLandscape && styles.firstPageContentLandscape]}>
              <Image source={pages[page].logo} style={[styles.logo, isLandscape && styles.logoLandscape]} resizeMode="contain" />
              <View style={[styles.headerBlock, isLandscape && styles.headerBlockLandscape]}>
                <Text style={[styles.headerTop, isLandscape && styles.headerTopLandscape]}>{pages[page].headerLines?.top}</Text>
                <Text style={[styles.headerMain, isLandscape && styles.headerMainLandscape]}>
                  <Text style={styles.motion}>{pages[page].headerLines?.motion}</Text>
                  <Text style={styles.speak}>{pages[page].headerLines?.speak}</Text>
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.middleContent, isLandscape && styles.middleContentLandscape]}>
              <View style={[styles.landscapeContentContainer, isLandscape && styles.landscapeContentContainerLandscape]}>
                <Image source={pages[page].image} style={[styles.tipsImage, isLandscape && styles.tipsImageLandscape, isTablet && styles.tipsImageTablet]} resizeMode="contain" />
                <View style={[styles.textContent, isLandscape && styles.textContentLandscape ]}>
                  <Text style={[styles.headerPlain, isLandscape && styles.headerPlainLandscape, isTablet && styles.headerPlainTablet]}>{pages[page].header}</Text>
                  {renderBodyText(pages[page].body)}
                </View>
              </View>
            </View>
          )}

          {/* Body text for first page */}
          {pages[page].special && (
            <Text style={[styles.bodyTextNormal, isLandscape && styles.bodyTextNormalLandscape]}>{pages[page].body}</Text>
          )}
        </Animated.View>
      </View>

      {/* buttons - BOTTOM */}
      <View style={[styles.bottomBar, isLandscape && styles.bottomBarLandscape]}>
        <View
          style={[
            styles.buttonsContainer,
            page === 0 ? styles.singleButtonCenter : styles.dualButtonSpace,
          ]}>
          {page > 0 && (
            <TouchableOpacity
              activeOpacity={1}
              onPressIn={() => handlePressIn(backButtonAnim)}
              onPressOut={() => handlePressOut(backButtonAnim)}
              onPress={() => {
                Vibration.vibrate(20);
                goBack();
              }}
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
                  <Text style={[styles.buttonLabel, isTablet && styles.buttonLabelTablet]}>Back</Text>
                </View>
              </Animated.View>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            activeOpacity={1}
            onPressIn={() => handlePressIn(nextButtonAnim)}
            onPressOut={() => handlePressOut(nextButtonAnim)}
            onPress={() => {
              Vibration.vibrate(20);
              goNext();
            }}
            style={[getButtonWrapperStyle(), isTablet && styles.buttonWrapperTablet]}>
            <Animated.View 
              style={[
                styles.solidButton,
                { backgroundColor: NEXT_BUTTON_COLOR },
                { opacity: nextButtonAnim }
              ]}
            >
              <View style={styles.buttonContent}>
                <Text style={[styles.buttonLabel, isTablet && styles.buttonLabelTablet]}>{isLast ? 'Start' : 'Next'}</Text>
                <Image source={rightArrow} style={[styles.arrowIcon, styles.rightArrow]} />
              </View>
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Language Change Modal */}
      <Modal
        visible={showLangModal}
        transparent={true}
        animationType="none"
        onRequestClose={closeLangModal}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.modalContainer,
              isTablet && styles.modalContainerTablet,
              { transform: [{ scale: langModalScale }] },
            ]}
          >
            <Text style={styles.modalHeader}>Change Language</Text>
            <Text style={styles.modalBody}>
              Would you like to change the app language to{' '}
              <Text style={styles.yesText}>Tagalog</Text>?
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
                  <Text style={styles.modalButtonText}>Yes</Text>
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
                  <Text style={styles.modalButtonText}>No</Text>
                </Animated.View>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Quick Guide Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="none"
        onRequestClose={hideQuickGuideModal}
      >
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalContainer, isTablet && styles.modalContainerTablet, { transform: [{ scale: modalScale }] }]}>
            <Text style={styles.modalHeader}>
              {language === 'tagalog' ? 'Mabilis na Gabay' : 'Quick Guide'}
            </Text>

            <Text style={styles.modalBody}>
              {language === 'tagalog' ? (
                <>
                  Ginagamit mo ba ang MotionSpeak sa unang pagkakataon? Pindutin ang{' '}
                  <Text style={styles.yesText}>"Yes"</Text> para sa mabilis na gabay, o{' '}
                  <Text style={styles.noText}>"No"</Text> upang magsimula kaagad.
                </>
              ) : (
                <>
                  Are you using MotionSpeak for the first time? Tap{' '}
                  <Text style={styles.yesText}>"Yes"</Text> for a quick guide, or{' '}
                  <Text style={styles.noText}>"No"</Text> to jump straight in.
                </>
              )}
            </Text>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalButtonWrapper}
                  onPressIn={() => handlePressIn(modalYesButtonAnim)}
                  onPressOut={() => handlePressOut(modalYesButtonAnim)}
                  onPress={() => {
                    Vibration.vibrate(20);
                    handleYes();
                  }}
                  activeOpacity={1}
                >
                  <Animated.View 
                    style={[
                      styles.solidButton,
                      { backgroundColor: NEXT_BUTTON_COLOR },
                      { opacity: modalYesButtonAnim }
                    ]}
                  >
                    <Text style={styles.modalButtonText}>Yes</Text>
                  </Animated.View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButtonWrapper}
                  onPressIn={() => handlePressIn(modalNoButtonAnim)}
                  onPressOut={() => handlePressOut(modalNoButtonAnim)}
                  onPress={() => {
                    Vibration.vibrate(20);
                    handleNo();
                  }}
                  activeOpacity={1}
                >
                  <Animated.View 
                    style={[
                      styles.solidButton,
                      { backgroundColor: BACK_BUTTON_COLOR },
                      { opacity: modalNoButtonAnim }
                    ]}
                  >
                    <Text style={styles.modalButtonText}>No</Text>
                  </Animated.View>
                </TouchableOpacity>
              </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );

  if (isLandscape) {
    return <MainContent />;
  } else {
    return (
      <SafeAreaView style={styles.safeArea}>
        <MainContent />
      </SafeAreaView>
    );
  }
};

export default TipsScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  screenLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  
  topBar: {
    height: Platform.OS === 'ios' ? 96 : 80,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 28 : 10,
  },
  topBarLandscape: {
    height: 60,
    paddingTop: 0,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Middle content - same structure as bottom buttons but centered
  middleContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  middleContentLandscape: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -100 }],
  },
  
  landscapeContentContainer: {
    alignItems: 'center',
  },
  landscapeContentContainerLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  
  bottomBar: {
    paddingBottom: 36,
    alignItems: 'center',
  },
  bottomBarLandscape: {
    position: 'absolute',
    bottom: '2%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: '2%',
  },
  
  tipsImage: {
    width: 200,
    height: 200,
    marginBottom: 20,
    borderRadius: 20,
  },
  tipsImageLandscape: {
    width: 180,
    height: 180,
    borderRadius: 15,
    alignSelf: 'center',
  },
  textContent: {
    alignItems: 'center',
  },
  textContentLandscape: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    maxWidth: 300,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    width: '90%',
    maxWidth: 400,
    minHeight: 280, // Add minHeight
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalButtons: {
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 15,
    width: '70%',
  },
  modalButtonWrapper: {
    width: '100%', // Change from flex: 1 to full width
    borderRadius: 40,
    overflow: 'hidden',
  },
  modalHeader: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 16,
    color: '#222',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 25,
  },
  yesText: {
    color: '#118472',
    fontWeight: '600',
  },
  noText: {
    color: '#430A6D',
    fontWeight: '600',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Solid button style
  solidButton: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 40,
  },

  // Button content with arrow
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowIcon: {
    width: 16,
    height: 16,
    tintColor: '#fff',
  },
  leftArrow: {
    marginRight: 8,
  },
  rightArrow: {
    marginLeft: 8,
  },

  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicator: {
    width: 36,
    height: 8,
    borderRadius: 6,
    marginHorizontal: 6,
  },
  buttonsContainer: {
    width: '100%',
    paddingHorizontal: 20,
  },
  
  contentContainer: {
    flex: 1,
    width: '100%',
  },
  contentContainerLandscape: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    justifyContent: 'center',
    width: '100%',
  },
  contentWrapLandscape: {
    paddingHorizontal: 40,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  firstPageContent: {
    alignItems: 'center',
    marginBottom: 30,
  },
  firstPageContentLandscape: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 220,
    height: 220,
    marginBottom: 10,
  },
  logoLandscape: {
    width: 120,
    height: 120,
    marginBottom: 5,
  },
  headerBlock: {
    alignItems: 'center',
    marginBottom: 8,
  },
  headerBlockLandscape: {
    alignItems: 'center',
    marginBottom: 5,
  },
  headerTop: {
    fontSize: 20,
    color: '#000',
    fontWeight: '600',
    textAlign: 'center',
  },
  headerTopLandscape: {
    fontSize: 18,
  },
  headerMain: {
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 40,
    marginTop: 4,
  },
  headerMainLandscape: {
    fontSize: 28,
    lineHeight: 32,
    marginTop: 2,
  },
  motion: {
    color: '#0086b3',
  },
  speak: {
    color: '#808080',
  },
  headerPlain: {
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
    color: '#000',
    marginBottom: 8,
  },
  headerPlainLandscape: {
    fontSize: 24,
    marginBottom: 6,
    textAlign: 'left',
  },
  bodyTextBold: {
    fontSize: 19,
    color: '#222',
    textAlign: 'center',
    lineHeight: 26,
    marginTop: 0,
    fontWeight: '700',
  },
  bodyTextBoldLandscape: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'left',
  },
  bodyTextNormal: {
    fontSize: 19,
    color: '#222',
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '400',
  },
  bodyTextNormalLandscape: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'left',
  },
  dualButtonSpace: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  singleButtonCenter: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonWrapperSmall: {
    width: 150,
    borderRadius: 40,
    overflow: 'hidden',
  },
  buttonWrapperLarge: {
    width: 150,
    borderRadius: 40,
    overflow: 'hidden',
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
// tablet
  screenTablet: {
    paddingHorizontal: 80,
    justifyContent: 'center',
  },
  tipsImageTablet: {
    width: 320,
    height: 320,
    marginBottom: 30,
  },
  headerPlainTablet: {
    fontSize: 40,
    marginBottom: 10,
  },
  bodyTextBoldTablet: {
    fontSize: 26,
    lineHeight: 34,
  },
  bodyTextNormalTablet: {
    fontSize: 22,
    lineHeight: 32,
  },
  buttonWrapperTablet: {
    width: 250,
  },
  buttonLabelTablet: {
    fontSize: 20,
  },
  modalContainerTablet: {
    width: '70%',
    maxWidth: 600,
    padding: 40,
  },
  modalButtonTextTablet: {
    fontSize: 18,
  },
});