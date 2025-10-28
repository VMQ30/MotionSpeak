import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ScrollView, Animated, Modal, Vibration } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFontSize } from '../context/FontSizeContext';

type CustomizeSidebarProps = {
  customizeModalVisible: boolean;
  showCustomizeModal: boolean;
  setShowCustomizeModal: (show: boolean) => void;
  customizeSlideStyle: any;
  customizeOverlayStyle: any;
  isDarkMode: boolean;
  isTablet: boolean;
  isLandscape: boolean;
  menuWidth: number;
  language: "english" | "tagalog";
  getTextStyle: (baseSize: number) => any;
  fontSizePercentage: number;
  setFontSizePercentage: (fontSize: number) => void;
  ttsSpeed: number;
  setTtsSpeed: (speed: number) => void;
  setLanguage: (language: "english" | "tagalog") => void;
  closeCustomizeModal: () => void;
  setIsDarkMode: (darkMode: boolean) => void;
};

const CustomizeSidebar: React.FC<CustomizeSidebarProps> = ({
  customizeModalVisible,
  showCustomizeModal,
  setShowCustomizeModal,
  customizeSlideStyle,
  customizeOverlayStyle,
  isDarkMode,
  isTablet,
  isLandscape,
  menuWidth,
  language,
  getTextStyle,
  fontSizePercentage,
  setFontSizePercentage,
  ttsSpeed,
  setTtsSpeed,
  setLanguage,
  closeCustomizeModal,
  setIsDarkMode,
}) => {
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showFontSizeModal, setShowFontSizeModal] = useState(false);
  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [tempTtsSpeed, setTempTtsSpeed] = useState(ttsSpeed);
  const [tempFontSize, setTempFontSize] = useState(fontSizePercentage);
  const [tempLanguage, setTempLanguage] = useState(language);

  const getTempTextStyle = (baseSize: number) => ({ fontSize: baseSize * (tempFontSize / 100) });

  const handleLanguagePress = () => {
    setTempLanguage(language);
    setShowCustomizeModal(false);
    setShowLanguageModal(true);
  };

  const handleFontSizePress = () => {
    setTempFontSize(fontSizePercentage);
    setShowCustomizeModal(false);
    setShowFontSizeModal(true);
  };

  const handleSpeedPress = () => {
    setTempTtsSpeed(ttsSpeed);
    setShowCustomizeModal(false);
    setShowSpeedModal(true);
  };

  const handleDarkModePress = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    try {
      AsyncStorage.setItem('darkMode', JSON.stringify(newDarkMode));
    } catch (error) {
      console.log('Error saving dark mode preference:', error);
    }
  };

  const customizeOptions = [
    {
      key: 'language',
      icon: require('../assets/language.png'),
      text: language === 'english' ? 'Language' : 'Wika',
      onPress: handleLanguagePress
    },
    {
      key: 'fontsize',
      icon: require('../assets/font_size.png'),
      text: language === 'english' ? 'Font Size' : 'Laki ng Font',
      onPress: handleFontSizePress
    },
    {
      key: 'speed',
      icon: require('../assets/tts_speed.png'),
      text: language === 'english' ? 'TTS Speed' : 'Bilis ng TTS',
      onPress: handleSpeedPress
    },
    {
      key: 'darkmode',
      icon: require('../assets/dark_mode.png'),
      text: language === 'english' ? 'Dark Mode' : 'Dark Mode',
      onPress: handleDarkModePress
    },
  ];

  return (
    <>
      <Animated.View style={[styles.overlay, customizeOverlayStyle]} pointerEvents={customizeModalVisible ? 'auto' : 'none'}>
        <TouchableOpacity style={styles.overlayTouchable} onPress={closeCustomizeModal} activeOpacity={1} />
      </Animated.View>

      <Animated.View style={[styles.customizeSidebar, isLandscape && styles.customizeSidebarLandscape, isTablet && styles.customizeSidebarTablet, { width: menuWidth, backgroundColor: isDarkMode ? '#1a1a1a' : '#fff' }, customizeSlideStyle]} pointerEvents={showCustomizeModal ? 'auto' : 'none'}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.customizeScrollContainer}>
          <View style={[styles.customizeHeader, isTablet && styles.customizeHeaderTablet]}>
            <Text style={[styles.customizeTitle, isTablet && styles.customizeTitleTablet, getTextStyle(20), { color: isDarkMode ? '#fff' : '#0086b3' }]}>
              {language === 'english' ? 'Customize' : 'I-customize'}
            </Text>
          </View>

          {customizeOptions.map((item) => (
            <TouchableOpacity key={item.key} style={[styles.customizeButton, isTablet && styles.customizeButtonTablet]} onPress={item.onPress}>
              <Image source={item.icon} style={[styles.customizeIcon, isTablet && styles.customizeIconTablet, { tintColor: isDarkMode ? '#fff' : '#0086b3' }]} resizeMode="contain" />
              <Text style={[styles.customizeText, isTablet && styles.customizeTextTablet, getTextStyle(16), { color: isDarkMode ? '#fff' : '#0086b3' }]}>{item.text}</Text>
              {item.key === 'darkmode' && (
                <View style={[styles.toggleIndicator, isDarkMode ? styles.toggleOn : styles.toggleOff]}>
                  <View style={[styles.toggleCircle, isDarkMode ? styles.toggleCircleOn : styles.toggleCircleOff]} />
                </View>
              )}
            </TouchableOpacity>
          ))}

          <View style={[styles.quickSettings, { backgroundColor: isDarkMode ? '#2a2a2a' : '#f5f5f5' }]}>
            <Text style={[styles.quickSettingsTitle, getTextStyle(14), { color: isDarkMode ? '#ccc' : '#666' }]}>
              {language === 'english' ? 'Current Settings' : 'Kasalukuyang Settings'}
            </Text>
            
            <View style={styles.settingItem}>
              <Text style={[styles.settingLabel, getTextStyle(12), { color: isDarkMode ? '#ccc' : '#666' }]}>
                {language === 'english' ? 'Language' : 'Wika'}:
              </Text>
              <Text style={[styles.settingValue, getTextStyle(12), { color: isDarkMode ? '#fff' : '#333' }]}>
                {language === 'english' ? 'English' : 'Filipino'}
              </Text>
            </View>

            <View style={styles.settingItem}>
              <Text style={[styles.settingLabel, getTextStyle(12), { color: isDarkMode ? '#ccc' : '#666' }]}>
                {language === 'english' ? 'Font Size' : 'Laki ng Font'}:
              </Text>
              <Text style={[styles.settingValue, getTextStyle(12), { color: isDarkMode ? '#fff' : '#333' }]}>
                {fontSizePercentage}%
              </Text>
            </View>

            <View style={styles.settingItem}>
              <Text style={[styles.settingLabel, getTextStyle(12), { color: isDarkMode ? '#ccc' : '#666' }]}>
                {language === 'english' ? 'TTS Speed' : 'Bilis ng TTS'}:
              </Text>
              <Text style={[styles.settingValue, getTextStyle(12), { color: isDarkMode ? '#fff' : '#333' }]}>
                {ttsSpeed.toFixed(1)}x
              </Text>
            </View>

            <View style={styles.settingItem}>
              <Text style={[styles.settingLabel, getTextStyle(12), { color: isDarkMode ? '#ccc' : '#666' }]}>
                {language === 'english' ? 'Dark Mode' : 'Dark Mode'}:
              </Text>
              <Text style={[styles.settingValue, getTextStyle(12), { color: isDarkMode ? '#fff' : '#333' }]}>
                {isDarkMode ? (language === 'english' ? 'On' : 'Naka-on') : (language === 'english' ? 'Off' : 'Naka-off')}
              </Text>
            </View>
          </View>
        </ScrollView>
      </Animated.View>

      {/* LANGUAGE MODAL */}
      <Modal visible={showLanguageModal} transparent={true} animationType="fade" onRequestClose={() => setShowLanguageModal(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContainer, isTablet && styles.modalContainerTablet, { backgroundColor: isDarkMode ? '#2a2a2a' : '#fff' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, getTextStyle(20), { color: isDarkMode ? '#fff' : '#000' }]}>
                {language === 'english' ? 'Select Language' : 'Pumili ng Wika'}
              </Text>
              <TouchableOpacity onPress={() => setShowLanguageModal(false)}>
                <Text style={[styles.closeButtonText, getTextStyle(24), { color: isDarkMode ? '#fff' : '#666' }]}>×</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalOptions}>
              {(['english', 'tagalog'] as const).map((lang) => (
                <TouchableOpacity 
                  key={lang} 
                  style={[
                    styles.option, 
                    tempLanguage === lang && styles.optionSelected,
                    { backgroundColor: isDarkMode ? '#3a3a3a' : '#fff', borderColor: isDarkMode ? '#555' : '#f0f0f0' }
                  ]} 
                  onPress={() => setTempLanguage(lang)}
                >
                  <Text style={[
                    styles.optionText, 
                    tempLanguage === lang && styles.optionTextSelected, 
                    getTextStyle(16),
                    { color: isDarkMode ? '#fff' : '#333' }
                  ]}>
                    {lang === 'english' ? 'English' : 'Filipino'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <TouchableOpacity style={styles.okButton} onPress={() => {
              Vibration.vibrate(50);
              setLanguage(tempLanguage);
              setShowLanguageModal(false);
            }}>
              <LinearGradient colors={['#76E1D8', '#7CBF00']} style={styles.okButtonGradient}>
                <Text style={[styles.okButtonText, getTextStyle(16)]}>OK</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FONT SIZE MODAL */}
      <Modal visible={showFontSizeModal} transparent={true} animationType="fade" onRequestClose={() => setShowFontSizeModal(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContainer, isTablet && styles.modalContainerTablet, { backgroundColor: isDarkMode ? '#2a2a2a' : '#fff' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, getTextStyle(20), { color: isDarkMode ? '#fff' : '#000' }]}>
                {language === 'english' ? 'Font Size' : 'Laki ng Font'}
              </Text>
              <TouchableOpacity onPress={() => setShowFontSizeModal(false)}>
                <Text style={[styles.closeButtonText, getTextStyle(24), { color: isDarkMode ? '#fff' : '#666' }]}>×</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.modalText, getTextStyle(16), { color: isDarkMode ? '#fff' : '#333' }]}>
              {language === 'english' ? 'Slide to adjust font size' : 'I-slide para ayusin ang laki ng font'}
            </Text>
            
            <View style={styles.sliderContainer}>
              <Text style={[styles.sliderLabel, getTextStyle(14), { color: isDarkMode ? '#fff' : '#666' }]}>100%</Text>
              <Slider 
                style={styles.slider} 
                minimumValue={100} 
                maximumValue={200} 
                step={10} 
                value={tempFontSize} 
                onValueChange={setTempFontSize} 
                minimumTrackTintColor="#007AFF" 
                maximumTrackTintColor={isDarkMode ? '#555' : '#ddd'} 
                thumbTintColor="#007AFF"
              />
              <Text style={[styles.sliderLabel, getTextStyle(14), { color: isDarkMode ? '#fff' : '#666' }]}>200%</Text>
            </View>

            <View style={styles.valueContainer}>
              <Text style={[styles.valueText, getTextStyle(18), { color: '#007AFF' }]}>{tempFontSize}%</Text>
            </View>

            <View style={[styles.previewContainer, { backgroundColor: isDarkMode ? '#3a3a3a' : '#f2f2f2' }]}>
              <Text style={[styles.previewText, getTempTextStyle(16), { color: isDarkMode ? '#fff' : '#333' }]}>
                {language === 'english' ? 'This is how your text will look' : 'Ganito ang itsura ng iyong teksto'}
              </Text>
            </View>
            
            <TouchableOpacity style={styles.okButton} onPress={() => {
              Vibration.vibrate(50);
              setFontSizePercentage(tempFontSize);
              setShowFontSizeModal(false);
            }}>
              <LinearGradient colors={['#76E1D8', '#7CBF00']} style={styles.okButtonGradient}>
                <Text style={[styles.okButtonText, getTextStyle(16)]}>{language === 'english' ? 'OK' : 'Sige'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SPEED MODAL */}
      <Modal visible={showSpeedModal} transparent={true} animationType="fade" onRequestClose={() => setShowSpeedModal(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContainer, isTablet && styles.modalContainerTablet, { backgroundColor: isDarkMode ? '#2a2a2a' : '#fff' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, getTextStyle(20), { color: isDarkMode ? '#fff' : '#000' }]}>
                {language === 'english' ? 'TTS Speed' : 'Bilis ng TTS'}
              </Text>
              <TouchableOpacity onPress={() => setShowSpeedModal(false)}>
                <Text style={[styles.closeButtonText, getTextStyle(24), { color: isDarkMode ? '#fff' : '#666' }]}>×</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.modalText, getTextStyle(16), { color: isDarkMode ? '#fff' : '#333' }]}>
              {language === 'english' ? 'Adjust text-to-speech speed' : 'Ayusin ang bilis ng text-to-speech'}
            </Text>
            
            <View style={styles.sliderContainer}>
              <Text style={[styles.sliderLabel, getTextStyle(14), { color: isDarkMode ? '#fff' : '#666' }]}>0.5x</Text>
              <Slider 
                style={styles.slider} 
                minimumValue={0.5} 
                maximumValue={2.0} 
                step={0.1} 
                value={tempTtsSpeed} 
                onValueChange={setTempTtsSpeed} 
                minimumTrackTintColor="#007AFF" 
                maximumTrackTintColor={isDarkMode ? '#555' : '#ddd'} 
                thumbTintColor="#007AFF"
              />
              <Text style={[styles.sliderLabel, getTextStyle(14), { color: isDarkMode ? '#fff' : '#666' }]}>2.0x</Text>
            </View>

            <View style={styles.valueContainer}>
              <Text style={[styles.valueText, getTextStyle(18), { color: '#007AFF' }]}>{tempTtsSpeed.toFixed(1)}x</Text>
              <Text style={[styles.descriptionText, getTextStyle(14), { color: isDarkMode ? '#ccc' : '#666' }]}>
                {tempTtsSpeed === 1.0 ? (language === 'english' ? 'Normal Speed' : 'Normal na Bilis')
                  : tempTtsSpeed < 1.0 ? (language === 'english' ? 'Slower Pronunciation' : 'Mas Mabagal na Pagbigkas')
                  : (language === 'english' ? 'Faster Pronunciation' : 'Mas Mabilis na Pagbigkas')}
              </Text>
            </View>

            <TouchableOpacity style={styles.okButton} onPress={() => {
              Vibration.vibrate(50);
              setTtsSpeed(tempTtsSpeed);
              setShowSpeedModal(false);
            }}>
              <LinearGradient colors={['#76E1D8', '#7CBF00']} style={styles.okButtonGradient}>
                <Text style={[styles.okButtonText, getTextStyle(16)]}>{language === 'english' ? 'OK' : 'Sige'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 30 },
  overlayTouchable: { flex: 1 },
  customizeSidebar: { position: 'absolute', left: 0, top: 0, bottom: 0, paddingTop: 80, paddingHorizontal: 20, elevation: 10, zIndex: 35 },
  customizeSidebarLandscape: { paddingTop: 60 },
  customizeSidebarTablet: { paddingHorizontal: 40, paddingTop: 100 },
  customizeScrollContainer: { paddingBottom: 40 },
  customizeHeader: { alignItems: 'center', marginBottom: 30, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  customizeHeaderTablet: { marginBottom: 40 },
  customizeTitle: { fontSize: 22, fontWeight: 'bold' },
  customizeTitleTablet: { fontSize: 28 },
  customizeButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20, paddingHorizontal: 15, borderRadius: 10, marginBottom: 10, backgroundColor: 'transparent' },
  customizeButtonTablet: { paddingVertical: 25, paddingHorizontal: 20 },
  customizeIcon: { width: 24, height: 24, marginRight: 15 },
  customizeIconTablet: { width: 30, height: 30, marginRight: 20 },
  customizeText: { fontSize: 16, fontWeight: '600', flex: 1 },
  customizeTextTablet: { fontSize: 20 },
  toggleIndicator: { width: 50, height: 24, borderRadius: 12, padding: 2, marginLeft: 10 },
  toggleOn: { backgroundColor: '#007AFF', alignItems: 'flex-end' },
  toggleOff: { backgroundColor: '#ccc', alignItems: 'flex-start' },
  toggleCircle: { width: 20, height: 20, borderRadius: 10 },
  toggleCircleOn: { backgroundColor: '#fff' },
  toggleCircleOff: { backgroundColor: '#fff' },
  quickSettings: { marginTop: 30, padding: 15, borderRadius: 10 },
  quickSettingsTitle: { fontWeight: '600', marginBottom: 10, textAlign: 'center' },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  settingLabel: { fontWeight: '500' },
  settingValue: { fontWeight: '600' },

  // Modal Styles
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  modalContainer: { borderRadius: 20, padding: 25, width: '90%', maxWidth: 400 },
  modalContainerTablet: { padding: 40, maxWidth: 500 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  modalOptions: { marginBottom: 25 },
  option: { padding: 15, borderRadius: 10, marginBottom: 10, borderWidth: 2 },
  optionSelected: { borderColor: '#007AFF', backgroundColor: '#f0f8ff' },
  optionText: { fontSize: 16, textAlign: 'center' },
  optionTextSelected: { fontWeight: '600' },
  modalText: { textAlign: 'center', marginBottom: 25 },
  sliderContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  slider: { flex: 1, height: 40, marginHorizontal: 10 },
  sliderLabel: { fontSize: 12, width: 40, textAlign: 'center' },
  valueContainer: { alignItems: 'center', marginBottom: 25 },
  valueText: { fontSize: 18, fontWeight: 'bold' },
  descriptionText: { textAlign: 'center' },
  previewContainer: { padding: 20, borderRadius: 12, marginBottom: 25, alignItems: 'center' },
  previewText: { textAlign: 'center' },
  okButton: { borderRadius: 40, overflow: 'hidden' },
  okButtonGradient: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  okButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  closeButtonText: { fontSize: 24, fontWeight: '300' },
});

export default CustomizeSidebar;