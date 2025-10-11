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
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/StackNavigator';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TutorialScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [page, setPage] = useState<number>(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const blurAnim = useRef(new Animated.Value(0)).current;

  const pages = [
    {
      special: true,
      logo: require('../assets/logo_alt.png'),
      headerLines: {
        top: 'Welcome to',
        motion: 'Motion',
        speak: 'Speak',
      },
      body:
        'We turn gestures into words. Communicate faster, smarter, and hands-on with your gestures.',
    },
    {
      special: false,
      header: 'Gesture Recognition',
      body:
        'Your Movements, Understood\n\nWave, point, or sign, our AI reads your motions and translates them in real time.',
    },
    {
      special: false,
      header: 'Communication Made Easy',
      body:
        'Share Your Gestures\n\nTurn your gestures into clear text or audio so anyone can understand you, anywhere you go.',
    },
    {
      special: false,
      header: 'Ready to Translate',
      body:
        'Seamlessly connect gestures to meaning.\n\nLet MotionSpeak do the talking for you, anytime, anywhere.',
    },
  ];

  const slideToPage = (newPage: number, direction: 'left' | 'right') => {
    // Start motion blur effect
    Animated.timing(blurAnim, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();

    const slideOut = Animated.parallel([
      // Current content slides left and fades out
      Animated.timing(slideAnim, {
        toValue: direction === 'left' ? -SCREEN_WIDTH : SCREEN_WIDTH,
        duration: 150, // Much faster
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]);

    const slideIn = Animated.parallel([
      // New content slides in from opposite direction and fades in
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 180, // Faster "BOOM" effect
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]);

    // First: slide out current content
    slideOut.start(() => {
      // Update page
      setPage(newPage);
      // Set initial position for incoming content
      slideAnim.setValue(direction === 'left' ? SCREEN_WIDTH : -SCREEN_WIDTH);
      // Then: slide in new content with "BOOM" effect
      slideIn.start(() => {
        // Remove motion blur after animation completes
        Animated.timing(blurAnim, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }).start();
      });
    });
  };

  // Create panResponder after all function declarations
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
          // Swipe left - go to next page
          slideToPage(page + 1, 'left');
        } else if (dx > swipeThreshold && page > 0) {
          // Swipe right - go to previous page
          slideToPage(page - 1, 'right');
        }
      },
    })
  ).current;

  // Fade in first page on mount
  useEffect(() => {
    if (page === 0) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200, // Faster initial fade
        useNativeDriver: true,
      }).start();
    }
  }, []);

  const goNext = () => {
    if (page < pages.length - 1) {
      slideToPage(page + 1, 'left');
    } else {
      // navigation.navigate('Blank');
      navigation.navigate('Home'); // added for homepage
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
          <Text style={styles.bodyTextBold}>{parts[0]}</Text>
          <Text style={styles.bodyTextNormal}>{'\n\n' + parts[1]}</Text>
        </View>
      );
    }
    // For the first page (special page), use normal styling
    return <Text style={styles.bodyTextNormal}>{text}</Text>;
  };

  const isLast = page === pages.length - 1;

  return (
    <View style={styles.screen}>
      {/* page indicator */}
      <View style={styles.topBar}>
        <View style={styles.indicatorRow}>
          {pages.map((_, i) => {
            const activeColor = i === page ? (isLast ? '#00FFFF' : '#007AFF') : '#D3D3D3';
            return <View key={i} style={[styles.indicator, { backgroundColor: activeColor }]} />;
          })}
        </View>
      </View>

      {/* swipeable content */}
      <View style={styles.contentContainer} {...panResponder.panHandlers}>
        <Animated.View 
          style={[
            styles.contentWrap,
            {
              transform: [
                { translateX: slideAnim },
                {
                  // Motion blur effect using opacity and slight scale
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
            <View style={styles.firstPageContent}>
              <Image source={pages[page].logo} style={styles.logo} resizeMode="contain" />
              <View style={styles.headerBlock}>
                <Text style={styles.headerTop}>{pages[page].headerLines?.top}</Text>
                <Text style={styles.headerMain}>
                  <Text style={styles.motion}>{pages[page].headerLines?.motion}</Text>
                  <Text style={styles.speak}>{pages[page].headerLines?.speak}</Text>
                </Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.headerPlain}>{pages[page].header}</Text>
              {renderBodyText(pages[page].body)}
            </>
          )}

          {/* Body text for first page */}
          {pages[page].special && (
            <Text style={styles.bodyTextNormal}>{pages[page].body}</Text>
          )}
        </Animated.View>
      </View>

      {/* buttons pinned */}
      <View
        style={[
          styles.buttonsRow,
          page === 0 ? styles.singleButtonCenter : styles.dualButtonSpace,
        ]}>
        {page > 0 && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={goBack}
            style={styles.buttonWrapperSmall}>
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
          onPress={goNext}
          style={page === 0 ? styles.buttonWrapperLarge : styles.buttonWrapperSmall}>
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
  );
};

export default TutorialScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  topBar: {
    height: Platform.OS === 'ios' ? 96 : 80,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 28 : 10,
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
  contentContainer: {
    flex: 1,
    width: '100%',
  },
  contentWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    justifyContent: 'center',
    width: '100%',
  },
  firstPageContent: {
    alignItems: 'center',
    marginBottom: 30, // 👈 Added space between header and body
  },
  logo: {
    width: 220,
    height: 220,
    marginBottom: 10, // 👈 Reduced margin to move logo up
  },
  headerBlock: {
    alignItems: 'center',
    marginBottom: 8, // 👈 Reduced margin to move header up
  },
  headerTop: {
    fontSize: 20,
    color: '#000',
    fontWeight: '600',
    textAlign: 'center',
  },
  headerMain: {
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 40,
    marginTop: 4, // 👈 Reduced margin to move header up
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
  bodyTextBold: {
    fontSize: 19,
    color: '#222',
    textAlign: 'center',
    lineHeight: 26,
    marginTop: 8,
    fontWeight: '700',
  },
  bodyTextNormal: {
    fontSize: 19,
    color: '#222',
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '400',
  },
  buttonsRow: {
    width: '100%',
    paddingHorizontal: 20,
    paddingBottom: 36,
    alignItems: 'center',
  },
  dualButtonSpace: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  singleButtonCenter: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonWrapperSmall: {
    width: '42%',
    borderRadius: 40,
    overflow: 'hidden',
  },
  buttonWrapperLarge: {
    width: '78%',
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