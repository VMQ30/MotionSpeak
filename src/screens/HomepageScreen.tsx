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
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

type Props = { navigation: any };

const HomepageScreen: React.FC<Props> = ({ navigation }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isReadAloudOn, setIsReadAloudOn] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(1)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  // Detect orientation + tablet
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

  const { width } = Dimensions.get('window');
  const menuWidth = isLandscape ? width * 0.35 : width * 0.7;
  const isTabletLandscape = isTablet && isLandscape;

  // Menu toggling
  const toggleMenu = () => {
    const toValue = menuOpen ? 0 : 1;
    const logoToValue = menuOpen ? 1 : 0;
    const overlayToValue = menuOpen ? 0 : 0.5;
    setMenuOpen(prev => !prev);

    Animated.parallel([
      Animated.timing(slideAnim, { toValue, duration: 300, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: logoToValue, duration: 150, useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: overlayToValue, duration: 300, useNativeDriver: true }),
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

  const toggleReadAloud = () => setIsReadAloudOn(prev => !prev);

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

  const ReadAloudButtonContent = () => (
    <View style={styles.readButton}>
      <Text style={buttonStyles.text}>Read Aloud</Text>
      <Image
        source={require('../assets/speak.png')}
        style={buttonStyles.icon}
        resizeMode="contain"
      />
    </View>
  );

  return (
    <View style={[styles.container, isLandscape && styles.landscapeContainer, isTablet && styles.tabletContainer]}>
      {/* Logo Button */}
      <Animated.View style={[styles.logoWrapper, isTablet && styles.logoWrapperTablet, ,logoStyle]}>
        <TouchableOpacity
          onPress={() => {
            Vibration.vibrate(50);
            toggleMenu();
          }}
        >
          <Image
            source={require('../assets/logo_alt.png')}
            style={[styles.logo, isTablet && styles.logoTablet]}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </Animated.View>

      {/* Translation Box */}
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
              ]}
            >
              "Pat-a-cake, pat-a-cake, baker’s man.
              Bake me a cake as fast as you can.
              Roll it, and pat it, and mark it with a “C”.
              Put it in the oven for Carlos and me!
              Pat-a-cake, pat-a-cake, baker’s man.
              Bake me a cake as fast as you can.
              Roll it, and pat it, and mark it with an “A”.
              Put it in the oven for Amy and me!"
            </Text>
          </ScrollView>
        </View>
        </View>

        {/* Read Aloud Button */}
        <View style={[styles.readAloudContainer, isLandscape && styles.readAloudContainerLandscape,
          isTablet && styles.readAloudContainerTablet,
          isTabletLandscape && styles.readAloudContainerTabletLandscape]}>
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
                onPress={() => {
                  Vibration.vibrate(50);
                  toggleReadAloud();
                }}
              >
                <ReadAloudButtonContent />
              </TouchableOpacity>
            </LinearGradient>
          </View>
        ) : (
          <TouchableOpacity
            style={buttonStyles.container}
            onPress={() => {
              Vibration.vibrate(50);
              toggleReadAloud();
            }}
          >
            <ReadAloudButtonContent />
          </TouchableOpacity>
        )}
      </View>

      {/* Overlay */}
      <Animated.View
        style={[styles.overlay, overlayStyle]}
        pointerEvents={menuOpen ? 'auto' : 'none'}
      >
        <TouchableOpacity
          style={styles.overlayTouchable}
          onPress={() => {
            Vibration.vibrate(50);
            closeMenu();
          }}
          activeOpacity={1}
        />
      </Animated.View>

      {/* Side Menu (full) */}
      <Animated.View
        style={[
          styles.sideMenu,
          isLandscape && styles.sideMenuLandscape, isTablet && styles.sideMenuTablet, isTabletLandscape && styles.sideMenuTabletLandscape,
          { width: menuWidth },
          slideStyle,
        ]}
        pointerEvents={menuOpen ? 'auto' : 'none'}
      >
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
              Vibration.vibrate(50);
              closeMenu();
              navigation.replace('Home');
            }}
          >
            <Image source={require('../assets/home.png')} style={[styles.menuIcon, , isTablet && styles.menuIconTablet, isTabletLandscape && styles.menuButtonTabletLandscape]} resizeMode="contain" />
            <Text style={[styles.menuText, isTablet && styles.menuTextTablet]}>Back to Home</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuButton, isTablet && styles.menuButtonTablet, isTabletLandscape && styles.menuButtonTabletLandscape]}>
            <Image source={require('../assets/settings.png')} style={[styles.menuIcon, isTablet && styles.menuIconTablet, isTabletLandscape && styles.menuButtonTabletLandscape]} resizeMode="contain" />
            <Text style={[styles.menuText, isTablet && styles.menuTextTablet, isTabletLandscape && styles.menuButtonTabletLandscape]}>Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuButton, isTablet && styles.menuButtonTablet, isTabletLandscape && styles.menuButtonTabletLandscape]}>
            <Image source={require('../assets/moon.png')} style={[styles.menuIcon, isTablet && styles.menuIconTablet, isTabletLandscape && styles.menuButtonTabletLandscape]} resizeMode="contain" />
            <Text style={[styles.menuText, isTablet && styles.menuTextTablet, isTabletLandscape && styles.menuButtonTabletLandscape]}>Dark Mode</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuButton, isTablet && styles.menuButtonTablet, isTabletLandscape && styles.menuButtonTabletLandscape]}>
            <Image source={require('../assets/notification.png')} style={[styles.menuIcon, isTablet && styles.menuIconTablet, isTabletLandscape && styles.menuButtonTabletLandscape]} resizeMode="contain" />
            <Text style={[styles.menuText, isTablet && styles.menuTextTablet, isTabletLandscape && styles.menuButtonTabletLandscape]}>Notifications</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuButton, isTablet && styles.menuButtonTablet, isTabletLandscape && styles.menuButtonTabletLandscape]}
            onPress={() => {
              Vibration.vibrate(50);
              closeMenu();
              navigation.replace('Tutorial');
            }}
          >
            <Image source={require('../assets/tutorial.png')} style={[styles.menuIcon, isTablet && styles.menuIconTablet, isTabletLandscape && styles.menuButtonTabletLandscape]} resizeMode="contain" />
            <Text style={[styles.menuText, isTablet && styles.menuTextTablet, isTabletLandscape && styles.menuButtonTabletLandscape]}>Tutorial</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </View>
  );
};

export default HomepageScreen;

const styles = StyleSheet.create({
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

  logo: { 
    width: 60, 
    height: 60 
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
    paddingBottom: 40,
  },
  translationContainerLandscape: { 
    paddingHorizontal: 80, 
    paddingVertical: 40 
  },
  translationContainerTablet: { 
    paddingHorizontal: 120, 
    paddingVertical: 50,
    paddingTop: 200,
  },
  translationContainerTabletLandscape: {
  flexDirection: 'row',
  justifyContent: 'space-around',
  alignItems: 'center',
  paddingHorizontal: 160,
  paddingVertical: 60,
  paddingBottom: 50
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
    color: '#333' 
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

  gradientButton: {
    borderRadius: 50,
    alignSelf: 'center',
    marginTop: -100,
    marginBottom: 125,
    overflow: 'hidden',
    height: 48,
    minWidth: 160,
  },
  gradientButtonLandscape: { 
    marginBottom: 5,
    marginTop: -30 
  },
  gradientButtonTablet: { 
    height: 60, 
    minWidth: 240, 
    marginTop: -100,
    //marginBottom: 50
  },
  gradientButtonTabletLandscape: {
    height: 60, 
    minWidth: 240,
    marginTop: 50, // Remove extra margin for tablet landscape
  },
  readAloudButtonOff: {
    borderRadius: 50,
    alignSelf: 'center',
    marginTop: -100,
    marginBottom: 125,
    overflow: 'hidden',
    backgroundColor: '#cccccc',
    height: 48,
    minWidth: 160,
    justifyContent: 'center',
  },
  readAloudContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 10
  },
  readAloudContainerLandscape:{
    marginTop: 10 ,
    marginBottom: 20,
  },
  readAloudContainerTablet: {
    marginTop: 70, // Bring button closer for tablet portrait
    marginBottom: 60,
  },
  readAloudContainerTabletLandscape: {
    marginTop: 195, // Bring button closer for tablet landscape
    marginBottom: -10
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
    color: '#00bfff', 
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
    tintColor: '#00bfff', 
    marginLeft: 22 
  },
  menuIconTablet: {
    width: 36,
    height: 36,
  },
  menuText: { 
    fontSize: 16, 
    color: '#00bfff', 
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
});
