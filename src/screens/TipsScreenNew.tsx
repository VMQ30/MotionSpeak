import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Image,
  Platform,
  Dimensions,
  Vibration,
  FlatList
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/StackNavigator';
import { useLanguage } from '../context/LanguageContext';
import { useFontSize } from '../context/FontSizeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Use state for dimensions instead of constants
const getScreenDimensions = () => Dimensions.get('window');

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
  
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [screenDimensions, setScreenDimensions] = useState(getScreenDimensions());
  const [isLandscape, setIsLandscape] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [shouldShowTips, setShouldShowTips] = useState<boolean | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isVibrationEnabled, setIsVibrationEnabled] = useState(true);
  
  const SCREEN_WIDTH = screenDimensions.width;
  const SCREEN_HEIGHT = screenDimensions.height;
  
  const flatListRef = useRef<FlatList>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const nextButtonAnim = useRef(new Animated.Value(1)).current;
  const backButtonAnim = useRef(new Animated.Value(1)).current;
  const skipButtonAnim = useRef(new Animated.Value(1)).current;

  const NEXT_BUTTON_COLOR = '#1BC4AB';
  const BACK_BUTTON_COLOR = '#430A6D';
  const SKIP_BUTTON_COLOR = '#8a8a8a';
  const BUTTON_PRESSED_OPACITY = 0.7;
  const rightArrow = require('../assets/next_arrow.png');
  const leftArrow = require('../assets/back_arrow.png');
  const skipIcon = require('../assets/skip.png');

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
    loadVibrationPreference();
    checkFirstTimeUser();
    
    const updateLayout = ({ window }: { window: { width: number; height: number } }) => {
      const newDimensions = getScreenDimensions();
      const wasLandscape = isLandscape;
      const newIsLandscape = newDimensions.width > newDimensions.height;
      
      setScreenDimensions(newDimensions);
      setIsLandscape(newIsLandscape);
      setIsTablet(Math.min(newDimensions.width, newDimensions.height) >= 600);
      
      // Only reset FlatList if orientation actually changed
      if (wasLandscape !== newIsLandscape) {
        setTimeout(() => {
          if (flatListRef.current) {
            flatListRef.current.scrollToIndex({
              index: activeIndex,
              animated: false,
            });
          }
        }, 50); // Reduced timeout for faster response
      }
    };

    const initialDimensions = getScreenDimensions();
    setScreenDimensions(initialDimensions);
    setIsLandscape(initialDimensions.width > initialDimensions.height);
    setIsTablet(Math.min(initialDimensions.width, initialDimensions.height) >= 600);

    const subscription = Dimensions.addEventListener('change', updateLayout);
    return () => subscription?.remove?.();
  }, []);

  // Improved useEffect for handling FlatList reset
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (flatListRef.current) {
        flatListRef.current.scrollToIndex({
          index: activeIndex,
          animated: false,
        });
      }
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [activeIndex, isLandscape, SCREEN_WIDTH]); // Added SCREEN_WIDTH as dependency

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

  const checkFirstTimeUser = async () => {
    try {
      const hasSeenTips = await AsyncStorage.getItem('hasSeenTips');
      
      if (hasSeenTips === null) {
        setShouldShowTips(true);
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

  const handleSkip = async () => {
    if (isVibrationEnabled) Vibration.vibrate(20);
    await markTipsAsSeen();
    navigation.navigate('Home');
  };

  const slideToPage = (newPage: number, direction: 'left' | 'right') => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    if (isVibrationEnabled) Vibration.vibrate(20);
  
    const slideOut = Animated.timing(slideAnim, {
      toValue: direction === 'left' ? -SCREEN_WIDTH : SCREEN_WIDTH,
      duration: 300,
      useNativeDriver: true
    });

    const slideIn = Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true
    });

    slideOut.start(() => {
      setActiveIndex(newPage);
      slideAnim.setValue(direction === 'left' ? SCREEN_WIDTH : -SCREEN_WIDTH);
      flatListRef.current?.scrollToIndex({
        index: newPage,
        animated: false
      });

      slideIn.start(() => {
        setIsAnimating(false);
      });
    });
  };

  const handlePressIn = (buttonAnim: Animated.Value) => {
    Animated.timing(buttonAnim, {
      toValue: BUTTON_PRESSED_OPACITY,
      duration: 150,
      useNativeDriver: true
    }).start();
  };

  const handlePressOut = (buttonAnim: Animated.Value) => {
    Animated.timing(buttonAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true
    }).start();
  };

  const goNext = async () => {
    if (activeIndex < pages.length - 1) {
      slideToPage(activeIndex + 1, 'left');
    } else {
      await markTipsAsSeen();
      navigation.navigate('Home');
    }
  };

  const goBack = () => {
    if (activeIndex > 0) {
      slideToPage(activeIndex - 1, 'right');
    } else {
      if (isVibrationEnabled) Vibration.vibrate(20);
      navigation.navigate('Home');
    }
  };

  const handleMomentumScrollEnd = (event: any) => {
    if (isAnimating) return;
    
    const contentOffset = event.nativeEvent.contentOffset;
    const viewSize = event.nativeEvent.layoutMeasurement;
    
    // More precise calculation of current page
    const pageNum = Math.round(contentOffset.x / viewSize.width);
    
    if (pageNum !== activeIndex && pageNum >= 0 && pageNum < pages.length) {
      setActiveIndex(pageNum);
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

  const isLast = activeIndex === pages.length - 1;

  const renderSlide = ({ item: page }: { item: any }) => (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      {/* Main content container - properly structured */}
      <View style={[
        styles.mainContentContainer,
        isLandscape && styles.mainContentContainerLandscape
      ]}>
        <Image 
          source={page.image} 
          style={[
            styles.tipsImage,
            isLandscape && styles.tipsImageLandscape,
            isTablet && styles.tipsImageTablet
          ]} 
          resizeMode="contain"
        />
        <View style={[
          styles.textContainer,
          isLandscape && styles.textContainerLandscape,
          isTablet && styles.textContainerTablet
        ]}>
          <Text style={[
            styles.headerText,
            isLandscape && styles.headerTextLandscape,
            isTablet && styles.headerTextTablet,
            {fontSize:30*(fontSizePercentage/100), color: isDarkMode ? '#fff' : '#000'}
          ]}>
            {page.header}
          </Text>
          {renderBodyText(page.body)}
        </View>
      </View>
    </View>
  );

  // Don't return early - render empty state instead
  if (shouldShowTips === null) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isDarkMode ? '#1a1a1a' : '#fff' }]}>
        {/* Loading state */}
      </View>
    );
  }

  if (shouldShowTips === false) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isDarkMode ? '#1a1a1a' : '#fff' }]}>
        {/* Already seen tips state */}
      </View>
    );
  }

  return (
    <View style={[
      styles.screen,
      isLandscape && styles.screenLandscape,
      {
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        backgroundColor: isDarkMode ? '#1a1a1a' : '#fff'
      }
    ]}>

      {/* Skip Button */}
      <TouchableOpacity
        style={[styles.skipButtonWrapper, isLandscape && styles.skipButtonWrapperLandscape]}
        onPressIn={() => handlePressIn(skipButtonAnim)}
        onPressOut={() => handlePressOut(skipButtonAnim)}
        onPress={handleSkip}
        activeOpacity={1}
        disabled={isAnimating}
      >
        <Animated.View 
          style={[
            styles.solidButton,
            { backgroundColor: SKIP_BUTTON_COLOR },
            { opacity: skipButtonAnim }
          ]}
        >
          <View style={styles.buttonContent}>
            <Text style={[
              styles.skipButtonText, 
              { fontSize: 16 * (fontSizePercentage / 100) }
            ]}>
              {language === 'english' ? 'Skip' : 'I-skip'}
            </Text>
            <Image source={skipIcon} style={[styles.arrowIcon, styles.skipIcon]} />
          </View>
        </Animated.View>
      </TouchableOpacity>

      {/* Top Bar with Indicators */}
      <View style={[styles.topBar, isLandscape && styles.topBarLandscape]}>
        <View style={styles.indicatorRow}>
          {pages.map((_, i) => {
            const activeColor = i === activeIndex ? (isLast ? '#00FFFF' : '#007AFF') : '#D3D3D3';
            return <View key={i} style={[styles.indicator, { backgroundColor: activeColor }]} />;
          })}
        </View>
      </View>

      {/* Main Content Area with Swiper */}
      <View style={[styles.contentContainer, isLandscape && styles.contentContainerLandscape]}>
        <Animated.View 
          style={[
            styles.animatedContainer,
            { transform: [{ translateX: slideAnim }] }
          ]}
        >
          <FlatList
            ref={flatListRef}
            data={pages}
            renderItem={renderSlide}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            keyExtractor={(_, index) => index.toString()}
            getItemLayout={(data, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            initialScrollIndex={activeIndex}
            scrollEnabled={!isAnimating}
            extraData={[SCREEN_WIDTH, isLandscape, activeIndex]}
            onScrollToIndexFailed={(info) => {
              const wait = new Promise<void>(resolve => setTimeout(resolve, 500));
              wait.then(() => {
                if (flatListRef.current) {
                  flatListRef.current.scrollToIndex({
                    index: info.index,
                    animated: false,
                  });
                }
              });
            }}
          />
        </Animated.View>
      </View>

      {/* Bottom Navigation Buttons */}
      <View style={[styles.buttonsContainer, isLandscape && styles.buttonsContainerLandscape, activeIndex === 0 ? styles.singleButtonCenter : styles.dualButtonSpace]}>
        {activeIndex > 0 && (
          <TouchableOpacity
            activeOpacity={1}
            onPressIn={() => handlePressIn(backButtonAnim)}
            onPressOut={() => handlePressOut(backButtonAnim)}
            onPress={goBack}
            style={[isLandscape ? [styles.buttonWrapperSmall, { width: 150 }] : styles.buttonWrapperSmall, isTablet && styles.buttonWrapperTablet]}
            disabled={isAnimating}
          >
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
        )}
        <TouchableOpacity
          activeOpacity={1}
          onPressIn={() => handlePressIn(nextButtonAnim)}
          onPressOut={() => handlePressOut(nextButtonAnim)}
          onPress={goNext}
          style={[isLandscape ? [styles.buttonWrapperSmall, { width: 150 }] : styles.buttonWrapperSmall, isTablet && styles.buttonWrapperTablet]}
          disabled={isAnimating}
        >
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
  );
};

export default TipsScreenNew;

const styles = StyleSheet.create({
  safeArea: {flex:1,backgroundColor:'#fff'},
  screen: {flex:1,backgroundColor:'#fff'},
  screenLandscape: {flexDirection:'column',alignItems:'center',justifyContent:'space-between',paddingHorizontal:40},
  
  skipButtonWrapper: {position:'absolute',top:80,right:20,zIndex:20,width:125,borderRadius:40,overflow:'hidden'},
  skipButtonWrapperLandscape: {top:30,right:40},
  skipButtonText: {color:'#fff',fontSize:16,fontWeight:'600'},
  skipIcon: {marginLeft:8,width:16,height:16,tintColor:'#fff'},

  topBar: {height:Platform.OS==='ios'?10:30,justifyContent:'center',alignItems:'center',paddingTop:Platform.OS==='ios'?28:10,position:'relative'},
  topBarLandscape: {height:60,paddingTop:30,position:'absolute', alignItems:'center',justifyContent:'center'},

  contentContainer: {flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center'},
  contentContainerLandscape: {flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 20,},
  animatedContainer: {flex:1, width:'100%'},

  slide: {justifyContent:'center',alignItems:'center',paddingHorizontal:28},

  // MAIN CONTENT CONTAINER - USED FOR BOTH WELCOME AND REGULAR PAGES
  mainContentContainer: {alignItems: 'center', justifyContent: 'center', width: '100%', flex: 1,},
  mainContentContainerLandscape: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 40, flex: 1, paddingHorizontal: 40, paddingTop: 0},

  // REGULAR PAGES IMAGE STYLES
  tipsImage: {width:200,height:200,marginBottom:20,borderRadius:20},
  tipsImageLandscape: {width: 180, height: 180, marginBottom: 0, borderRadius: 15, flex: 1, maxWidth: 250,},
  tipsImageTablet: {width:320,height:320,borderRadius:25},

  // TEXT CONTENT CONTAINERS - USED FOR BOTH PAGES
  textContainer: {alignItems:'center',maxWidth:400},
  textContainerLandscape: {alignItems: 'flex-start', justifyContent: 'center', maxWidth: 400, flex: 1, paddingLeft:0, flexShrink: 1},
  textContainerTablet: {maxWidth:600},

  // Buttons Container
  buttonsContainer: {width: '100%', paddingHorizontal: 20, paddingBottom:30, paddingTop: 30,},
  buttonsContainerLandscape: {paddingHorizontal: 40, paddingBottom: 5, paddingTop: 5,},
  dualButtonSpace: {flexDirection:'row',justifyContent:'center',gap:20},
  singleButtonCenter: {flexDirection:'row',justifyContent:'center'},

  // TYPOGRAPHY
  headerText: {fontSize:30,fontWeight:'700',textAlign:'center',color:'#000',marginBottom:8},
  headerTextLandscape: {fontSize:24,marginBottom:6,textAlign:'left', alignSelf: 'flex-start',},
  headerTextTablet: {fontSize:40,marginBottom:14},
  bodyTextBold: {fontSize:19,color:'#222',textAlign:'center',lineHeight:26,marginTop:0,fontWeight:'700'},
  bodyTextBoldLandscape: {fontSize:16,lineHeight:22,textAlign:'left'},
  bodyTextBoldTablet: {fontSize:26,lineHeight:34},
  bodyTextNormal: {fontSize:19,color:'#222',textAlign:'center',lineHeight:26,fontWeight:'400'},
  bodyTextNormalLandscape: {fontSize:16,lineHeight:22,textAlign:'left'},
  bodyTextNormalTablet: {fontSize:24,lineHeight:32},

  // BUTTON STYLES
  solidButton: {paddingVertical:14,alignItems:'center',justifyContent:'center',borderRadius:40},
  buttonContent: {flexDirection:'row',alignItems:'center',justifyContent:'center'},
  arrowIcon: {width:16,height:16,tintColor:'#fff'},
  leftArrow: {marginRight:8},
  rightArrow: {marginLeft:8},
  buttonWrapperSmall: {width:150,borderRadius:40,overflow:'hidden'},
  buttonWrapperTablet: {width:250,borderRadius:50},
  buttonLabel: {color:'#fff',fontSize:16,fontWeight:'700'},
  buttonLabelTablet: {fontSize:20},

  // INDICATOR/PAGINATION
  indicatorRow: {flexDirection:'row',alignItems:'center',justifyContent:'center',marginTop:Platform.OS==='ios'?10:5},
  indicator: {width:36,height:8,borderRadius:6,marginHorizontal:6},
  modalOverlay: {flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'center',alignItems:'center',paddingHorizontal:20},
  modalContainer: {backgroundColor:'#fff',borderRadius:20,padding:30,width:'90%',maxWidth:400,minHeight:280,alignItems:'center',shadowColor:'#000',shadowOffset:{width:0,height:2},shadowOpacity:0.25,shadowRadius:4,elevation:5},
  modalContainerTablet: {width:'70%',maxWidth:600,padding:40},
  modalButtons: {flexDirection:'column',justifyContent:'center',gap:15,width:'70%'},
  modalButtonWrapper: {width:'100%',borderRadius:40,overflow:'hidden'},
  modalHeader: {fontSize:24,fontWeight:'700',color:'#000',marginBottom:15,textAlign:'center'},
  modalBody: {fontSize:16,color:'#222',textAlign:'center',lineHeight:22,marginBottom:25},
  modalButtonText: {color:'#fff',fontSize:16,fontWeight:'700'},
  modalButtonTextTablet: {fontSize:18},
  yesText: {color:'#118472',fontWeight:'600'},
  noText: {color:'#430A6D',fontWeight:'600'},
  langModalHeader: {alignItems:'center',marginBottom:20},
  langModalLogo: {width:100,height:100,marginBottom:10},
  langModalTitleContainer: {alignItems:'center'},
  langModalTitleTop: {fontSize:16,color:'#000',fontWeight:'600',textAlign:'center'},
  langModalTitleMain: {fontSize:24,fontWeight:'800',textAlign:'center',lineHeight:28,marginTop:4},
  motion: {color:'#0086b3'},
  speak: {color:'#808080'},
});