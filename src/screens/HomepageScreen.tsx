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
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

type Props = { navigation: any };

const HomepageScreen: React.FC<Props> = ({ navigation }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isReadAloudOn, setIsReadAloudOn] = useState(false); // Default: OFF
  const slideAnim = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(1)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  // Toggle Read Aloud button
  const toggleReadAloud = () => {
    setIsReadAloudOn(prev => !prev);
  };

  //opening menu tab
  const toggleMenu = () => {
    const toValue = menuOpen ? 0 : 1;
    const logoToValue = menuOpen ? 1 : 0;
    const overlayToValue = menuOpen ? 0 : 0.5;

    setMenuOpen(prev => !prev);

    // Animate menu slide, logo opacity, and overlay
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: logoToValue,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: overlayToValue,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };
  //closing menu tab
  const closeMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  useEffect(() => {
    const handleChange = ({ window }: { window: { width: number; height: number } }) => {
      setIsLandscape(window.width > window.height);
    };

    const subscription = Dimensions.addEventListener('change', handleChange);
    const { width, height } = Dimensions.get('window');
    setIsLandscape(width > height);

    return () => subscription?.remove?.();
  }, []);

  const { width } = Dimensions.get('window');
  const menuWidth = isLandscape ? width * 0.35 : width * 0.7;

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

  const logoStyle = {
    opacity: logoOpacity,
  };

  const overlayStyle = {
    opacity: overlayOpacity,
  };

  // Determine button styles based on state
  const getButtonStyles = () => {
    if (isReadAloudOn) {
      return {
        container: [
          styles.gradientButton,
          isLandscape && styles.gradientButtonLandscape,
        ],
        text: styles.readText,
        icon: styles.speakIcon,
        gradient: true
      };
    } else {
      return {
        container: [
          styles.readAloudButtonOff,
          isLandscape && styles.gradientButtonLandscape,
        ],
        text: styles.readTextOff,
        icon: styles.speakIconOff,
        gradient: false
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
    <View style={[styles.container, isLandscape && styles.landscapeContainer]}>
      {/* Static Logo - Hidden when menu is open */}
      <Animated.View style={[styles.logoWrapper, logoStyle]}>
        <TouchableOpacity onPress={toggleMenu}>
          <Image
            source={require('../assets/logo_alt.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </Animated.View>

      {/* Main Content */}
      <View
        style={[
          styles.translationContainer,
          isLandscape && styles.translationContainerLandscape,
        ]}
      >
        <View
          style={[
            styles.translationBox,
            isLandscape && styles.translationBoxLandscape,
          ]}
        >
          <Text
            style={[
              styles.translationText,
              isLandscape && styles.translationTextLandscape,
            ]}
          >
            "According to all known laws of aviation, there is no way a bee should be able to fly.
            Its wings are too small to get its fat little body off the ground. The bee, of course,
            flies anyway because bees don't care what humans think is impossible. Yellow, black.
            Yellow, black. Yellow, black. Yellow, black. Ooh, black and yellow! Let's shake it up a
            little. Barry! Breakfast is ready! Coming! Hang on a second. Hello? Barry? Adam? Can you
            believe this is happening?"
          </Text>
        </View>

        {/* Read Aloud Button - Now Toggleable */}
        {buttonStyles.gradient ? (
          // Gradient button when ON
          <View style={buttonStyles.container}>
            <LinearGradient
              colors={['#00c6a7', '#00bfff']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradientFill}
            >
              <TouchableOpacity style={styles.readButtonTouchable} onPress={toggleReadAloud}>
                <ReadAloudButtonContent />
              </TouchableOpacity>
            </LinearGradient>
          </View>
        ) : (
          // Gray button when OFF
          <TouchableOpacity 
            style={buttonStyles.container}
            onPress={toggleReadAloud}
          >
            <ReadAloudButtonContent />
          </TouchableOpacity>
        )}
      </View>

      {/* Touchable Overlay - Only covers the area to the right of the menu */}
      <Animated.View 
        style={[
          styles.overlay, 
          overlayStyle,
        ]}
        pointerEvents={menuOpen ? 'auto' : 'none'}
      >
        <TouchableOpacity 
          style={styles.overlayTouchable}
          onPress={closeMenu}
          activeOpacity={1}
        />
      </Animated.View>

      {/* Animated Side Menu */}
      <Animated.View
        style={[
          styles.sideMenu,
          isLandscape && styles.sideMenuLandscape,
          { width: menuWidth },
          slideStyle,
        ]}
        pointerEvents={menuOpen ? 'auto' : 'none'}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.menuScrollContainer}
        >
          <View style={styles.menuHeader}>
            <View style={styles.logoContainer}>
              <Image
                source={require('../assets/logo-slanted.png')}
                style={styles.menuLogo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.motionText}>
              Motion<Text style={styles.speakText}>Speak</Text>
            </Text>
          </View>

          <TouchableOpacity style={styles.menuButton}
            onPress={() => { closeMenu(); navigation.replace('Home'); }}>
            <Image
              source={require('../assets/home.png')}
              style={styles.menuIcon}
              resizeMode="contain" 
              />
            <Text style={styles.menuText}>Back to Home</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuButton}>
            <Image
              source={require('../assets/settings.png')}
              style={styles.menuIcon}
              resizeMode="contain"
            />
            <Text style={styles.menuText}>Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuButton}>
            <Image
              source={require('../assets/moon.png')}
              style={styles.menuIcon}
              resizeMode="contain"
            />
            <Text style={styles.menuText}>Dark Mode</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuButton}>
            <Image
              source={require('../assets/notification.png')}
              style={styles.menuIcon}
              resizeMode="contain"
            />
            <Text style={styles.menuText}>Notifications</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuButton}
            onPress={() => { closeMenu(); navigation.replace('Tutorial'); }}>
            <Image
              source={require('../assets/tutorial.png')}
              style={styles.menuIcon}
              resizeMode="contain"
            />
            <Text style={styles.menuText}>Tutorial</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </View>
  );
};

export default HomepageScreen;

const styles = StyleSheet.create({
// home portrait
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },

  logo: {
    width: 60,
    height: 60,
  },

  logoWrapper: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 35) : 45,
    left: 35,
    zIndex: 30,
  },
  
  translationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 40) : 60,
    paddingBottom: 40,
  },

  translationBox: {
    backgroundColor: '#f2f2f2',
    borderRadius: 12,
    paddingHorizontal: 25,
    paddingVertical: 60,
    marginBottom: 15,
    alignSelf: 'center',
    maxWidth: '90%',
  },

  translationText: {
    textAlign: 'center',
    fontSize: 18,
    color: '#333',
  },

  // Read Aloud Button Styles - Fixed sizing
  gradientButton: {
    borderRadius: 50,
    alignSelf: 'center',
    marginTop: 8,
    overflow: 'hidden',
    height: 48, // Fixed height
    minWidth: 160, // Fixed min width
  },
  readAloudButtonOff: {
    borderRadius: 50,
    alignSelf: 'center',
    marginTop: 8,
    overflow: 'hidden',
    backgroundColor: '#cccccc', // Gray when OFF
    height: 48, // Fixed height
    minWidth: 160, // Fixed min width
    justifyContent: 'center', // Center content vertically
  },
  gradientFill: {
    flex: 1,
    borderRadius: 50,
    justifyContent: 'center',
  },
  readButtonTouchable: {
    flex: 1,
    justifyContent: 'center',
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
    fontSize: 16,
  },
  readTextOff: {
    color: '#666666', // Dark gray text when OFF
    fontWeight: '600',
    marginRight: 10,
    fontSize: 16,
  },

  speakIcon: {
    width: 30,
    height: 30,
    tintColor: '#fff', // White icon when ON
  },
  speakIconOff: {
    width: 30,
    height: 30,
    tintColor: '#666666', // Dark gray icon when OFF
  },

  
// side menu potrait
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
  
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  
  menuLogo: {
    width: 60,
    height: 60,
  },
  
  logoContainer: {
    marginRight: 2, // Horizontal spacing from text
    marginTop: 1,   // Move logo up (negative) or down (positive)
  },
  
  motionText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#00bfff',
    marginTop: 13, // Move text up or down
  },
  speakText: {
    color: '#606060',
  },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
  },
  menuIcon: {
    width: 22,
    height: 22,
    tintColor: '#00bfff',
    marginLeft: 22,
  },
  menuText: {
    fontSize: 16,
    color: '#00bfff',
    marginLeft: 15,
  },
  
//home landscape  
  landscapeContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  
  translationContainerLandscape: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 80,
    paddingVertical: 40,
  },
  
  translationBoxLandscape: {
    marginHorizontal: 8,
    paddingHorizontal: 18,
    paddingVertical: 60,
    marginBottom: 15,
  },
  
  translationTextLandscape: {
    fontSize: 16,
  },
  
  gradientButtonLandscape: {
    marginTop: 0,
    marginBottom: -15,
  },
  
// side menu landscape
  sideMenuLandscape: {
    paddingTop: 60,
  },
  
// other functions
  menuScrollContainer: {
    paddingBottom: 60,
  },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 10,
  },

  overlayTouchable: {
    flex: 1,
  },
});