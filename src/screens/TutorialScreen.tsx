import React, { useState, useEffect, useRef } from 'react';
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type RouteParams = { fromHomepage?: boolean; fromTips?: boolean; };

const TutorialScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { language } = useLanguage();
  const { fontSizePercentage } = useFontSize();
  const insets = useSafeAreaInsets();
  
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [showBackArrow, setShowBackArrow] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isVibrationEnabled, setIsVibrationEnabled] = useState(true);

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

  useEffect(() => {
    loadDarkModePreference();
    loadVibrationPreference();
    const handleChange = ({ window }: { window: { width: number; height: number } }) => {
      setIsLandscape(window.width > window.height);
      setIsTablet(Math.min(window.width, window.height) >= 600);
    };
    const subscription = Dimensions.addEventListener('change', handleChange);
    const { width, height } = Dimensions.get('window');
    setIsLandscape(width > height);
    setIsTablet(Math.min(width, height) >= 600);
    return () => subscription?.remove?.();
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

  const pages = [
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
  ];

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
    const pageNum = Math.floor(contentOffset.x / viewSize.width);
    
    if (pageNum !== activeIndex) {
      setActiveIndex(pageNum);
    }
  };

  const renderBodyText = (text: string) => {
    const parts = text.split('\n\n');
    if (parts.length > 1) {
      return (
        <View>
          <Text style={[styles.bodyTextBold,isLandscape&&styles.bodyTextBoldLandscape,isTablet&&styles.bodyTextBoldTablet,{fontSize:19*(fontSizePercentage/100), color: isDarkMode ? '#fff' : '#222'}]}>{parts[0]}</Text>
          <Text style={[styles.bodyTextNormal,isLandscape&&styles.bodyTextNormalLandscape,isTablet&&styles.bodyTextNormalTablet,{fontSize:19*(fontSizePercentage/100), color: isDarkMode ? '#fff' : '#222'}]}>{'\n\n'+parts[1]}</Text>
        </View>
      );
    }
    return<Text style={[styles.bodyTextNormal,isLandscape&&styles.bodyTextNormalLandscape,isTablet&&styles.bodyTextNormalTablet,{fontSize:19*(fontSizePercentage/100), color: isDarkMode ? '#fff' : '#222'}]}>{text}</Text>;
  };

  const isLast = activeIndex === pages.length - 1;

  const getButtonWrapperStyle = () => {
    if (activeIndex === 0) return isLandscape?[styles.buttonWrapperLarge,{width:150}]:styles.buttonWrapperLarge;
    else return isLandscape?[styles.buttonWrapperSmall,{width:150}]:styles.buttonWrapperSmall;
  };

  const renderSlide = ({ item: page }: { item: any }) => (
    <View style={styles.slide}>
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
              { fontSize: 20 * (fontSizePercentage / 100) }
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
        {showBackArrow && (
          <View style={[styles.backArrowContainer, isLandscape && styles.backArrowContainerLandscape]}>
            <TouchableOpacity 
              activeOpacity={1} 
              onPressIn={() => handlePressIn(navBackButtonAnim)} 
              onPressOut={() => handlePressOut(navBackButtonAnim)} 
              onPress={handleBackToHome} 
              style={[styles.backArrowButton, isTablet && styles.backArrowButtonTablet]}
              disabled={isAnimating}
            >
              <Animated.View 
                style={[
                  styles.solidButton,
                  styles.backArrowCircle,
                  {
                    opacity: navBackButtonAnim,
                    backgroundColor: isDarkMode ? '#333' : BACK_BUTTON_COLOR
                  }
                ]}
              >
                <Image 
                  source={require('../assets/back_arrow.png')} 
                  style={[styles.backArrowIcon, isTablet && styles.backArrowIconTablet]} 
                  resizeMode="contain"
                />
              </Animated.View>
            </TouchableOpacity>
          </View>
        )}
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
          />
        </Animated.View>
      </View>

      {/* Bottom Navigation Buttons */}
      <View style={[styles.bottomBar, isLandscape && styles.bottomBarLandscape]}>
        <View style={[
          styles.buttonsContainer, 
          activeIndex === 0 ? styles.singleButtonCenter : styles.dualButtonSpace
        ]}>
          {activeIndex > 0 && (
            <TouchableOpacity 
              activeOpacity={1} 
              onPressIn={() => handlePressIn(backButtonAnim)} 
              onPressOut={() => handlePressOut(backButtonAnim)} 
              onPress={goBack} 
              style={[
                isLandscape ? [styles.buttonWrapperSmall, { width: 150 }] : styles.buttonWrapperSmall,
                isTablet && styles.buttonWrapperTablet
              ]}
              disabled={isAnimating}
            >
              <Animated.View style={[
                styles.solidButton,
                { backgroundColor: BACK_BUTTON_COLOR },
                { opacity: backButtonAnim }
              ]}>
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
            style={[getButtonWrapperStyle(), isTablet && styles.buttonWrapperTablet]}
            disabled={isAnimating}
          >
            <Animated.View style={[
              styles.solidButton,
              { backgroundColor: NEXT_BUTTON_COLOR },
              { opacity: nextButtonAnim }
            ]}>
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
  screenLandscape: {flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20},
  
  skipButtonWrapper: {position:'absolute',top:40,right:20,zIndex:20,width:120,borderRadius:40,overflow:'hidden'},
  skipButtonWrapperLandscape: {top:20,right:20},
  skipButtonText: {color:'#fff',fontSize:16,fontWeight:'700'},
  skipIcon: {marginLeft:8,width:16,height:16,tintColor:'#fff'},

  topBar: {height:Platform.OS==='ios'?96:80,justifyContent:'flex-end',alignItems:'center',paddingTop:Platform.OS==='ios'?28:10,position:'relative'},
  topBarLandscape: {height:60,paddingTop:0,position:'absolute',top:0,left:0,right:0,zIndex:10,alignItems:'center',justifyContent:'flex-start'},
  
  backArrowContainer: {position:'absolute',left:20,top:Platform.OS==='ios'?80:60,zIndex:20,alignItems:'flex-start'},
  backArrowContainerLandscape: {left:40,top:50},
  backArrowButton: {borderRadius:25,overflow:'hidden'},
  backArrowButtonTablet: {borderRadius:30},
  backArrowIcon: {width:32,height:32},
  backArrowIconTablet: {width:32,height:32},
  backArrowCircle: {width:50,height:50,borderRadius:25,backgroundColor:'#430A6D',alignItems:'center',justifyContent:'center',...Platform.select({ios:{shadowColor:'#000',shadowOffset:{width:0,height:2},shadowOpacity:0.1,shadowRadius:3},android:{elevation:3},})},

  solidButton: {paddingVertical:14,alignItems:'center',justifyContent:'center',borderRadius:40},
  buttonContent: {flexDirection:'row',alignItems:'center',justifyContent:'center'},
  arrowIcon: {width:16,height:16,tintColor:'#fff'},
  leftArrow: {marginRight:8},
  rightArrow: {marginLeft:8},
  buttonWrapperSmall: {width:150,borderRadius:40,overflow:'hidden'},
  buttonWrapperLarge: {width:150,borderRadius:40,overflow:'hidden'},
  buttonWrapperTablet: {width:250,borderRadius:50},
  buttonLabel: {color:'#fff',fontSize:16,fontWeight:'700'},
  buttonLabelTablet: {fontSize:20},

  indicatorRow: {flexDirection:'row',alignItems:'center',justifyContent:'center',marginTop:Platform.OS==='ios'?10:5},
  indicator: {width:36,height:8,borderRadius:6,marginHorizontal:6},

  contentContainer: {flex:1,width:'100%',justifyContent:'center',alignItems:'center'},
  contentContainerLandscape: {flex:1,justifyContent:'center',alignItems:'center'},
  animatedContainer: {flex:1,width:'100%'},

  slide: {width:SCREEN_WIDTH,flex:1,justifyContent:'center',alignItems:'center',paddingHorizontal:28},

  mainContentContainer: {alignItems:'center',justifyContent:'center',width:'100%'},
  mainContentContainerLandscape: {flexDirection:'row',alignItems:'center',justifyContent:'center',gap:40},

  tutorialImage: {width:200,height:200,marginBottom:20,borderRadius:20},
  tutorialImageLandscape: {width:180,height:180,marginBottom:0,borderRadius:15},
  tutorialImageTablet: {width:320,height:320,borderRadius:25},

  textContainer: {alignItems:'center',maxWidth:400},
  textContainerLandscape: {alignItems:'flex-start',justifyContent:'center',maxWidth:300},
  textContainerTablet: {maxWidth:600},

  bottomBar: {paddingBottom:36,alignItems:'center'},
  bottomBarLandscape: {position:'absolute',bottom:'2%',left:0,right:0,alignItems:'center',justifyContent:'center',paddingBottom:'2%'},

  buttonsContainer: {width:'100%',paddingHorizontal:20},
  dualButtonSpace: {flexDirection:'row',justifyContent:'center',gap:20},
  singleButtonCenter: {flexDirection:'row',justifyContent:'center'},

  headerText: {fontSize:30,fontWeight:'700',textAlign:'center',color:'#000',marginBottom:8},
  headerTextLandscape: {fontSize:24,marginBottom:6,textAlign:'left'},
  headerTextTablet: {fontSize:40,marginBottom:14},
  bodyTextBold: {fontSize:19,color:'#222',textAlign:'center',lineHeight:26,marginTop:0,fontWeight:'700'},
  bodyTextBoldLandscape: {fontSize:16,lineHeight:22,textAlign:'left'},
  bodyTextBoldTablet: {fontSize:26,lineHeight:34},
  bodyTextNormal: {fontSize:19,color:'#222',textAlign:'center',lineHeight:26,fontWeight:'400'},
  bodyTextNormalLandscape: {fontSize:16,lineHeight:22,textAlign:'left'},
  bodyTextNormalTablet: {fontSize:24,lineHeight:32},
});