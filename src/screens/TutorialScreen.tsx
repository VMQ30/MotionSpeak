import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/StackNavigator';
import { useLanguage } from '../context/LanguageContext';
import { useFontSize } from '../context/FontSizeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Use state for dimensions instead of constants
const getScreenDimensions = () => Dimensions.get('window');

type RouteParams = { fromHomepage?: boolean; fromTips?: boolean; };

const TutorialScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { language } = useLanguage();
  const { fontSizePercentage } = useFontSize();
  const insets = useSafeAreaInsets();
  
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [screenDimensions, setScreenDimensions] = useState(getScreenDimensions());
  const [isLandscape, setIsLandscape] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [showBackArrow, setShowBackArrow] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isVibrationEnabled, setIsVibrationEnabled] = useState(true);

  const SCREEN_WIDTH = screenDimensions.width;
  const SCREEN_HEIGHT = screenDimensions.height;
  
  const flatListRef = useRef<FlatList>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const backButtonAnim = useRef(new Animated.Value(1)).current;
  const nextButtonAnim = useRef(new Animated.Value(1)).current;
  const navBackButtonAnim = useRef(new Animated.Value(1)).current;
  const skipButtonAnim = useRef(new Animated.Value(1)).current;

  const NEXT_BUTTON_COLOR = '#1BC4AB';
  const BACK_BUTTON_COLOR = '#430A6D';
  const SKIP_BUTTON_COLOR = '#8a8a8a';
  const BUTTON_PRESSED_OPACITY = 0.7;
  const rightArrow = require('../assets/next_arrow.png');
  const leftArrow = require('../assets/back_arrow.png');
  const skipIcon = require('../assets/skip.png');

  const pages = useMemo(() => [
    {
      special: false,
      header: language === 'tagalog' ? 'Kumonekta Muna' : 'Let\'s Get Connected',
      body: language === 'tagalog' 
        ? 'Tiyaking naka-ON ang Bluetooth ng iyong device upang makita ng MotionSpeak ang iyong mga gloves.' 
        : 'Make sure your device\'s Bluetooth is ON so MotionSpeak can detect your gloves.',
      image: require('../assets/tut_slide_1.png'),
    },
    {
      header: language === 'tagalog' ? 'Buksan ang Gloves' : 'Turn on Gloves',
      body: language === 'tagalog' 
        ? 'I-on ang iyong gesture gloves at maghanda para sa pagsasalin ng mga galaw.' 
        : 'Switch on your gesture gloves and get ready to translate movements.',
      image: require('../assets/tut_slide_2.png'),
    },
    {
      header: language === 'tagalog' ? 'Simulan ang Paggalaw' : 'Start Gesturing',
      body: language === 'tagalog' 
        ? 'Iwagayway, ituro, o mag-sign at panoorin kung paano isinasalin ng app ang iyong mga kilos sa totoong oras.' 
        : 'Wave, point, or sign, and see your gestures translated in real time.',
      image: require('../assets/tut_slide_3.png'),
    },
  ], [language]);

  useEffect(() => {
    loadDarkModePreference();
    loadVibrationPreference();
    
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

  const slideToPage = (newPage: number, direction: 'left' | 'right') => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    if (isVibrationEnabled) Vibration.vibrate(20);
    
    // Simple slide animation
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

    // Execute animation sequence
    slideOut.start(() => {
      // Update the page and reset slide position
      setActiveIndex(newPage);
      slideAnim.setValue(direction === 'left' ? SCREEN_WIDTH : -SCREEN_WIDTH);
      
      // Scroll FlatList to new page
      flatListRef.current?.scrollToIndex({
        index: newPage,
        animated: false
      });

      // Slide in new content
      slideIn.start(() => {
        setIsAnimating(false);
      });
    });
  };

  const markTutorialAsSeen = async () => {
    try {
      await AsyncStorage.setItem('hasSeenTutorial', 'true');
    } catch (error) {
      console.error('Error saving tutorial status:', error);
    }
  };

  const handleSkip = async () => {
    if (isVibrationEnabled) Vibration.vibrate(20);
    await markTutorialAsSeen();
    navigation.navigate('Home');
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

  const handleBackToHome = () => {
    if (isVibrationEnabled) Vibration.vibrate(20);
    navigation.navigate('Home');
  };

  const goNext = async () => {
    if (activeIndex < pages.length - 1) {
      slideToPage(activeIndex + 1, 'left');
    } else {
      await markTutorialAsSeen();
      navigation.navigate('Home');
    }
  };

  const goBack = () => {
    if (activeIndex > 0) {
      slideToPage(activeIndex - 1, 'right');
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
            styles.tutorialImage,
            isLandscape && styles.tutorialImageLandscape,
            isTablet && styles.tutorialImageTablet
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

  const MainContent = () => (
    <View style={[
      styles.screen,
      isLandscape && styles.screenLandscape,
      {
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        backgroundColor: isDarkMode ? '#1a1a1a' : '#fff'
      }
    ]}>
    
      {/* Skip Button - MATCHING TIPSCREEN LAYOUT */}
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

      {/* Top Bar with Indicators - MATCHING TIPSCREEN LAYOUT */}
      <View style={[styles.topBar, isLandscape && styles.topBarLandscape]}>
        <View style={styles.indicatorRow}>
          {pages.map((_, i) => {
            const activeColor = i === activeIndex ? (isLast ? '#00FFFF' : '#007AFF') : '#D3D3D3';
            return <View key={i} style={[styles.indicator, { backgroundColor: activeColor }]} />;
          })}
        </View>
      </View>

      {/* Main Content Area with FlatList */}
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
            extraData={[SCREEN_WIDTH, isLandscape, activeIndex]} // Added more dependencies
            onScrollToIndexFailed={(info) => {
              // Fallback if scroll fails
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

      {/* Bottom Navigation Buttons - MATCHING TIPSCREEN LAYOUT */}
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

  if (isLandscape) return <MainContent />;
  else return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isDarkMode ? '#1a1a1a' : '#fff' }]}>
      <MainContent />
    </SafeAreaView>
  );
};

export default TutorialScreen;

const styles = StyleSheet.create({
  safeArea: {flex:1,backgroundColor:'#fff'},
  screen: {flex:1,backgroundColor:'#fff'},
  screenLandscape: {flexDirection:'column',alignItems:'center',justifyContent:'space-between',paddingHorizontal:40},
  
  // Skip Button - MATCHING TIPSCREEN STYLES
  skipButtonWrapper: {position:'absolute',top:80,right:20,zIndex:20,width:125,borderRadius:40,overflow:'hidden'},
  skipButtonWrapperLandscape: {top:30,right:40},
  skipButtonText: {color:'#fff',fontSize:16,fontWeight:'600'},
  skipIcon: {marginLeft:8,width:16,height:16,tintColor:'#fff'},

  // Top Bar - MATCHING TIPSCREEN STYLES
  topBar: {height:Platform.OS==='ios'?10:30,justifyContent:'center',alignItems:'center',paddingTop:Platform.OS==='ios'?28:10,position:'relative'},
  topBarLandscape: {height:60,paddingTop:30,position:'absolute', alignItems:'center',justifyContent:'center'},

  // Content Container - MATCHING TIPSCREEN STYLES
  contentContainer: {flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center'},
  contentContainerLandscape: {flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 20,},
  animatedContainer: {flex:1, width:'100%'},

  // Slide - MATCHING TIPSCREEN STYLES
  slide: {justifyContent:'center',alignItems:'center',paddingHorizontal:28},

  // MAIN CONTENT CONTAINER - MATCHING TIPSCREEN STYLES
  mainContentContainer: {alignItems: 'center', justifyContent: 'center', width: '100%', flex: 1,},
  mainContentContainerLandscape: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 40, flex: 1, paddingHorizontal: 40, paddingTop: 0},

  // TUTORIAL IMAGE - MATCHING TIPSCREEN STYLES
  tutorialImage: {width:200,height:200,marginBottom:20,borderRadius:20},
  tutorialImageLandscape: {width: 180, height: 180, marginBottom: 0, borderRadius: 15, flex: 1, maxWidth: 250,},
  tutorialImageTablet: {width:320,height:320,borderRadius:25},

  // TEXT CONTENT CONTAINERS - MATCHING TIPSCREEN STYLES
  textContainer: {alignItems:'center',maxWidth:400},
  textContainerLandscape: {alignItems: 'flex-start', justifyContent: 'center', maxWidth: 400, flex: 1, paddingLeft:0, flexShrink: 1},
  textContainerTablet: {maxWidth:600},

  // Buttons Container - MATCHING TIPSCREEN STYLES
  buttonsContainer: {width: '100%', paddingHorizontal: 20, paddingBottom:30, paddingTop: 30,},
  buttonsContainerLandscape: {paddingHorizontal: 40, paddingBottom: 5, paddingTop: 5,},
  dualButtonSpace: {flexDirection:'row',justifyContent:'center',gap:20},
  singleButtonCenter: {flexDirection:'row',justifyContent:'center'},

  // TYPOGRAPHY - MATCHING TIPSCREEN STYLES
  headerText: {fontSize:30,fontWeight:'700',textAlign:'center',color:'#000',marginBottom:8},
  headerTextLandscape: {fontSize:24,marginBottom:6,textAlign:'left', alignSelf: 'flex-start',},
  headerTextTablet: {fontSize:40,marginBottom:14},
  bodyTextBold: {fontSize:19,color:'#222',textAlign:'center',lineHeight:26,marginTop:0,fontWeight:'700'},
  bodyTextBoldLandscape: {fontSize:16,lineHeight:22,textAlign:'left'},
  bodyTextBoldTablet: {fontSize:26,lineHeight:34},
  bodyTextNormal: {fontSize:19,color:'#222',textAlign:'center',lineHeight:26,fontWeight:'400'},
  bodyTextNormalLandscape: {fontSize:16,lineHeight:22,textAlign:'left'},
  bodyTextNormalTablet: {fontSize:24,lineHeight:32},

  // BUTTON STYLES - MATCHING TIPSCREEN STYLES
  solidButton: {paddingVertical:14,alignItems:'center',justifyContent:'center',borderRadius:40},
  buttonContent: {flexDirection:'row',alignItems:'center',justifyContent:'center'},
  arrowIcon: {width:16,height:16,tintColor:'#fff'},
  leftArrow: {marginRight:8},
  rightArrow: {marginLeft:8},
  buttonWrapperSmall: {width:150,borderRadius:40,overflow:'hidden'},
  buttonWrapperTablet: {width:250,borderRadius:50},
  buttonLabel: {color:'#fff',fontSize:16,fontWeight:'700'},
  buttonLabelTablet: {fontSize:20},

  // INDICATOR/PAGINATION - MATCHING TIPSCREEN STYLES
  indicatorRow: {flexDirection:'row',alignItems:'center',justifyContent:'center',marginTop:Platform.OS==='ios'?10:5},
  indicator: {width:36,height:8,borderRadius:6,marginHorizontal:6},
});