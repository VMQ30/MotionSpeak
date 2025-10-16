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
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/StackNavigator';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TutorialScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [page, setPage] = useState<number>(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const blurAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const handleChange = ({ window }: { window: { width: number; height: number } }) => {
      setIsLandscape(window.width > window.height);
    };

    const subscription = Dimensions.addEventListener('change', handleChange);
    const { width, height } = Dimensions.get('window');
    setIsLandscape(width > height);

    return () => subscription?.remove?.();
  }, []);

  const pages = [
    {
      special: false,
      header: 'Lets Get Connected',
      body:
        'Make sure your device’s Bluetooth is ON so MotionSpeak can detect your gloves.',
      image: require('../assets/tut_slide_1.png'),
    },
    {
      special: false,
      header: 'Turn on Gloves',
      body:
        'Switch on your gesture gloves and get ready to translate movements.',
      image: require('../assets/tut_slide_2.png'),
    },
    {
      special: false,
      header: 'Start Gesturing',
      body:
        'Wave, point, or sign, and see your gestures translated in real time.',
      image: require('../assets/tut_slide_3.png'),
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
      navigation.navigate('Home');
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
          <Text style={[styles.bodyTextBold, isLandscape && styles.bodyTextBoldLandscape]}>{parts[0]}</Text>
          <Text style={[styles.bodyTextNormal, isLandscape && styles.bodyTextNormalLandscape]}>{'\n\n' + parts[1]}</Text>
        </View>
      );
    }
    return <Text style={[styles.bodyTextNormal, isLandscape && styles.bodyTextNormalLandscape]}>{text}</Text>;
  };

  const isLast = page === pages.length - 1;

  const getButtonWrapperStyle = () => {
    if (page === 0) {
      return isLandscape ? [styles.buttonWrapperLarge, { width: 150 }] : styles.buttonWrapperLarge;
    } else {
      return isLandscape ? [styles.buttonWrapperSmall, { width: 150 }] : styles.buttonWrapperSmall;
    }
  };

  const MainContent = () => (
    <View style={[styles.screen, isLandscape && styles.screenLandscape]}>
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
          {(
            <View style={[styles.middleContent, isLandscape && styles.middleContentLandscape]}>
              <View style={[styles.landscapeContentContainer, isLandscape && styles.landscapeContentContainerLandscape]}>
                <Image source={pages[page].image} style={[styles.tutorialImage, isLandscape && styles.tutorialImageLandscape]} resizeMode="contain" />
                <View style={[styles.textContent, isLandscape && styles.textContentLandscape]}>
                  <Text style={[styles.headerPlain, isLandscape && styles.headerPlainLandscape]}>{pages[page].header}</Text>
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
            activeOpacity={0.85}
            onPress={() => {
              Vibration.vibrate(50);
              goBack();
            }}
            style={isLandscape ? [styles.buttonWrapperSmall, { width: 150 }] : styles.buttonWrapperSmall}>
            <LinearGradient
              colors={['#4A006A', '#3661B0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}>
              <Text style={styles.buttonLabel}>Back</Text>
            </LinearGradient>
          </TouchableOpacity>
          )}

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              Vibration.vibrate(50);
              goNext();
            }}
            style={getButtonWrapperStyle()}>
            <LinearGradient
              colors={isLast ? ['#7CBF00', '#76E1D8'] : ['#70D2FF', '#00CC96']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}>
              <Text style={styles.buttonLabel}>{isLast ? 'Start' : 'Next'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
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

export default TutorialScreen;

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
    transform: [{ translateY: -100 }], // Adjust based on content height
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
  
  tutorialImage: {
    width: 200,
    height: 200,
    marginBottom: 20,
    borderRadius: 20,
  },
  tutorialImageLandscape: {
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
    color: '#007AFF',
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
  buttonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});