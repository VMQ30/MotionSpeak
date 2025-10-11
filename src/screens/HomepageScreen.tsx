import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import LinearGradient from 'react-native-linear-gradient';


const { width } = Dimensions.get('window');

type Props = {
  navigation: any;
};

const HomepageScreen: React.FC<Props> = ({ navigation }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = useCallback(() => {
    setMenuOpen(v => !v);
  }, []);

  return (
    <View style={styles.container}>
      {/* Fixed logo button on the top-left */}
      <TouchableOpacity style={styles.logoWrapper} onPress={toggleMenu}>
        <Image
          source={require('../assets/logo_alt.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </TouchableOpacity>

      {/* Main content (centered) */}
      <View style={styles.translationContainer}>
        <View style={styles.translationBox}>
          <Text style={styles.translationText}>
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua. You’ve got a few ways 
            to make the box bigger depending on which direction you want it to grow. Here’s the breakdown.
            jjsjsjskkd jksksaja aksiidnjdd. That’ll make your button look exactly like your reference, with
            a pill-shaped gradient and rounded edges that flow cleanly into the background"
          </Text>
        </View>

        <LinearGradient
        colors={['#00c6a7', '#00bfff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientButton}
        >
        <TouchableOpacity style={styles.readButton}>
            <Text style={styles.readText}>Read Aloud</Text>
            <Icon name="volume-high-outline" size={20} color="#fff" />
        </TouchableOpacity>
        </LinearGradient>

      </View>

      {/* Side Menu */}
      {menuOpen && (
        <View style={styles.sideMenu}>
            <View style={styles.menuHeader}>
                <Text style={styles.motionText}>
                  Motion
                  <Text style={styles.speakText}>Speak</Text>
                </Text>
            </View>

          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => {
              setMenuOpen(false);
              navigation.replace('Tutorial');
            }}
          >
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

          <TouchableOpacity style={styles.menuButton}>
            <Image
              source={require('../assets/tutorial.png')}
              style={styles.menuIcon}
              resizeMode="contain"
            />
            <Text style={styles.menuText}>Tutorial</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export default HomepageScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },

  logoWrapper: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 20,
  },

  logo: {
    width: 60,
    height: 60,
  },

  translationContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  translationBox: {
    backgroundColor: '#f2f2f2',
    borderRadius: 10,
    padding: 40,
    paddingVertical: 100,
    marginBottom: 15,
    maxWidth: width - 48,
    alignSelf: 'center',
  },

  translationText: {
    textAlign: 'center',
    fontSize: 18,
    color: '#333',
  },

  gradientButton: {
  borderRadius: 50,
  alignSelf: 'center',
  marginTop: 10,
  overflow: 'hidden',
  },

  readButton: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: 12,
  paddingHorizontal: 40,
},

readText: {
  color: '#fff',
  fontWeight: '600',
  marginRight: 10,
  fontSize: 16,
},

  sideMenu: {
    position: 'absolute',
    left: 0,
    top: -50,
    bottom: 0,
    width: width * 0.7,
    backgroundColor: '#fff',
    paddingTop: 110,
    paddingHorizontal: 20,
    elevation: 8,
    zIndex: 15,
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
  },

  menuText: {
    fontSize: 16,
    color: '#00bfff',
    marginLeft: 15,
  },
  menuHeader: {
    alignItems: 'center',
    marginBottom: 30,
  },
  motionText: {
  fontSize: 26,
  fontWeight: 'bold',
  color: '#00bfff', // bright blue
  paddingLeft: 50,
},
speakText: {
  color: '#606060', // white fill
},
});
