import React,{useState, useEffect} from 'react';
import {View,Text,TouchableOpacity,Image,StyleSheet,ScrollView,Animated,Modal,Vibration} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useFontSize} from '../context/FontSizeContext';

type CustomizeSidebarProps = {
  customizeModalVisible:boolean;
  showCustomizeModal:boolean;
  setShowCustomizeModal:(show:boolean)=>void;
  customizeSlideStyle:any;
  isDarkMode:boolean;
  isTablet:boolean;
  isLandscape:boolean;
  menuWidth:number;
  language:"english"|"tagalog";
  getTextStyle:(baseSize:number)=>any;
  fontSizePercentage:number;
  setFontSizePercentage:(fontSize:number)=>void;
  ttsSpeed:number;
  setTtsSpeed:(speed:number)=>void;
  setLanguage:(language:"english"|"tagalog")=>void;
  closeCustomizeModal:()=>void;
  setIsDarkMode:(darkMode:boolean)=>void;
  isVibrationEnabled:boolean;
  setIsVibrationEnabled:(enabled:boolean)=>void;
  ttsPitch:number;
  setTtsPitch:(pitch:number)=>void;
};

const CustomizeSidebar:React.FC<CustomizeSidebarProps>=({
  customizeModalVisible,showCustomizeModal,setShowCustomizeModal,customizeSlideStyle,isDarkMode,isTablet,isLandscape,menuWidth,language,getTextStyle,fontSizePercentage,setFontSizePercentage,ttsSpeed,setTtsSpeed,setLanguage,closeCustomizeModal,setIsDarkMode,isVibrationEnabled,setIsVibrationEnabled,ttsPitch,setTtsPitch,
})=>{
  const[showLanguageModal,setShowLanguageModal]=useState(false);
  const[showFontSizeModal,setShowFontSizeModal]=useState(false);
  const[showSpeedModal,setShowSpeedModal]=useState(false);
  const[showPitchModal,setShowPitchModal]=useState(false);
  const[tempTtsSpeed,setTempTtsSpeed]=useState(ttsSpeed);
  const[tempFontSize,setTempFontSize]=useState(fontSizePercentage);
  const[tempLanguage,setTempLanguage]=useState(language);
  const[tempTtsPitch,setTempTtsPitch]=useState(ttsPitch);
  
  // TTS Preview states
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [previewTimeout, setPreviewTimeout] = useState<number | null>(null);

  const getTempTextStyle=(baseSize:number)=>({fontSize:baseSize*(tempFontSize/100)});

  const handleLanguagePress=()=>{setTempLanguage(language);setShowLanguageModal(true);};
  const handleFontSizePress=()=>{setTempFontSize(fontSizePercentage);setShowFontSizeModal(true);};
  const handleSpeedPress=()=>{setTempTtsSpeed(ttsSpeed);setShowSpeedModal(true);};
  const handlePitchPress=()=>{setTempTtsPitch(ttsPitch);setShowPitchModal(true);};
  const handleDarkModePress=()=>{
    const newDarkMode=!isDarkMode;
    setIsDarkMode(newDarkMode);
    try{AsyncStorage.setItem('darkMode',JSON.stringify(newDarkMode));}catch(error){}
  };
  const handleVibrationPress=()=>{
    const newVibrationEnabled=!isVibrationEnabled;
    setIsVibrationEnabled(newVibrationEnabled);
    try{AsyncStorage.setItem('vibrationEnabled',JSON.stringify(newVibrationEnabled));}catch(error){}
  };

  // TTS Preview functions
  const startTTSPreview = () => {
    if (isPreviewPlaying) {
      stopTTSPreview();
      return;
    }

    setIsPreviewPlaying(true);
    setCurrentWordIndex(0);
    
    const previewText = language === 'english' 
      ? "This is a preview of the text to speech speed"
      : "Ito ay preview ng bilis ng text to speech";
    
    const words = previewText.split(' ');
    let currentIndex = 0;

    const speakWord = () => {
      if (currentIndex >= words.length) {
        stopTTSPreview();
        return;
      }

      setCurrentWordIndex(currentIndex);
      
      // Calculate delay based on speed (faster speed = shorter delay)
      const baseDelay = 500; // base delay in ms for normal speed
      const delay = baseDelay / tempTtsSpeed;
      
      const timeout = setTimeout(() => {
        currentIndex++;
        speakWord();
      }, delay);

      setPreviewTimeout(timeout);
    };

    speakWord();
  };

  const stopTTSPreview = () => {
    if (previewTimeout) {
      clearTimeout(previewTimeout);
      setPreviewTimeout(null);
    }
    setIsPreviewPlaying(false);
    setCurrentWordIndex(-1);
  };

  // Cleanup on unmount or modal close
  useEffect(() => {
    return () => {
      if (previewTimeout) {
        clearTimeout(previewTimeout);
      }
    };
  }, [previewTimeout]);

  // Stop preview when modal closes
  useEffect(() => {
    if (!showSpeedModal) {
      stopTTSPreview();
    }
  }, [showSpeedModal]);

  const customizeOptions=[
    {key:'language',icon:require('../assets/language.png'),text:language==='english'?'Language':'Wika',onPress:handleLanguagePress},
    {key:'fontsize',icon:require('../assets/font_size.png'),text:language==='english'?'Font Size':'Laki ng Font',onPress:handleFontSizePress},
    {key:'speed',icon:require('../assets/tts_speed.png'),text:language==='english'?'TTS Speed':'Bilis ng TTS',onPress:handleSpeedPress},
    {key:'pitch',icon:require('../assets/pitch.png'),text:language==='english'?'TTS Pitch':'Tono ng TTS',onPress:handlePitchPress},
    {key:'vibration',icon:require('../assets/vibration.png'),text:language==='english'?'Vibration':'Vibration',onPress:handleVibrationPress},
    {key:'darkmode',icon:require('../assets/dark_mode.png'),text:language==='english'?'Dark Mode':'Dark Mode',onPress:handleDarkModePress},
  ];

  return(
    <>
      <Animated.View style={[styles.customizeSidebar,isLandscape&&styles.customizeSidebarLandscape,isTablet&&styles.customizeSidebarTablet,{width:menuWidth,backgroundColor:isDarkMode?'#1a1a1a':'#fff'},customizeSlideStyle]} pointerEvents={showCustomizeModal?'auto':'none'}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.customizeScrollContainer}>
          <View style={[styles.customizeHeader,isTablet&&styles.customizeHeaderTablet]}>
            <TouchableOpacity style={styles.backButton} onPress={closeCustomizeModal}>
              <Image source={require('../assets/back_arrow.png')} style={[styles.backIcon,isTablet&&styles.backIconTablet,{tintColor:isDarkMode?'#fff':'#0086b3'}]} resizeMode="contain"/>
            </TouchableOpacity>
            <Text style={[styles.customizeTitle,isTablet&&styles.customizeTitleTablet,getTextStyle(20),{color:isDarkMode?'#fff':'#0086b3'}]}>
              {language==='english'?'Customize':'I-customize'}
            </Text>
          </View>

          {customizeOptions.map((item)=>(
            <TouchableOpacity key={item.key} style={[styles.customizeButton,isTablet&&styles.customizeButtonTablet]} onPress={item.onPress}>
              <Image source={item.icon} style={[styles.customizeIcon,isTablet&&styles.customizeIconTablet,{tintColor:isDarkMode?'#fff':'#0086b3'}]} resizeMode="contain"/>
              <Text style={[styles.customizeText,isTablet&&styles.customizeTextTablet,getTextStyle(16),{color:isDarkMode?'#fff':'#0086b3'}]}>{item.text}</Text>
              {(item.key==='darkmode'||item.key==='vibration')&&(
                <View style={[styles.toggleIndicator,(item.key==='darkmode'?isDarkMode:isVibrationEnabled)?styles.toggleOn:styles.toggleOff]}>
                  <View style={[styles.toggleCircle,(item.key==='darkmode'?isDarkMode:isVibrationEnabled)?styles.toggleCircleOn:styles.toggleCircleOff]}/>
                </View>
              )}
            </TouchableOpacity>
          ))}

          <View style={[styles.quickSettings,{backgroundColor:isDarkMode?'#2a2a2a':'#f5f5f5'}]}>
            <Text style={[styles.quickSettingsTitle,getTextStyle(14),{color:isDarkMode?'#ccc':'#666'}]}>
              {language==='english'?'Current Settings':'Kasalukuyang Settings'}
            </Text>
            
            <View style={styles.settingItem}>
              <Text style={[styles.settingLabel,getTextStyle(12),{color:isDarkMode?'#ccc':'#666'}]}>
                {language==='english'?'Language':'Wika'}:
              </Text>
              <Text style={[styles.settingValue,getTextStyle(12),{color:isDarkMode?'#fff':'#333'}]}>
                {language==='english'?'English':'Filipino'}
              </Text>
            </View>

            <View style={styles.settingItem}>
              <Text style={[styles.settingLabel,getTextStyle(12),{color:isDarkMode?'#ccc':'#666'}]}>
                {language==='english'?'Font Size':'Laki ng Font'}:
              </Text>
              <Text style={[styles.settingValue,getTextStyle(12),{color:isDarkMode?'#fff':'#333'}]}>
                {fontSizePercentage}%
              </Text>
            </View>

            <View style={styles.settingItem}>
              <Text style={[styles.settingLabel,getTextStyle(12),{color:isDarkMode?'#ccc':'#666'}]}>
                {language==='english'?'TTS Speed':'Bilis ng TTS'}:
              </Text>
              <Text style={[styles.settingValue,getTextStyle(12),{color:isDarkMode?'#fff':'#333'}]}>
                {ttsSpeed.toFixed(1)}x
              </Text>
            </View>

            <View style={styles.settingItem}>
              <Text style={[styles.settingLabel,getTextStyle(12),{color:isDarkMode?'#ccc':'#666'}]}>
                {language==='english'?'TTS Pitch':'Tono ng TTS'}:
              </Text>
              <Text style={[styles.settingValue,getTextStyle(12),{color:isDarkMode?'#fff':'#333'}]}>
                {ttsPitch.toFixed(1)}
              </Text>
            </View>

            <View style={styles.settingItem}>
              <Text style={[styles.settingLabel,getTextStyle(12),{color:isDarkMode?'#ccc':'#666'}]}>
                {language==='english'?'Vibration':'Vibration'}:
              </Text>
              <Text style={[styles.settingValue,getTextStyle(12),{color:isDarkMode?'#fff':'#333'}]}>
                {isVibrationEnabled?(language==='english'?'On':'Naka-on'):(language==='english'?'Off':'Naka-off')}
              </Text>
            </View>

            <View style={styles.settingItem}>
              <Text style={[styles.settingLabel,getTextStyle(12),{color:isDarkMode?'#ccc':'#666'}]}>
                {language==='english'?'Dark Mode':'Dark Mode'}:
              </Text>
              <Text style={[styles.settingValue,getTextStyle(12),{color:isDarkMode?'#fff':'#333'}]}>
                {isDarkMode?(language==='english'?'On':'Naka-on'):(language==='english'?'Off':'Naka-off')}
              </Text>
            </View>
          </View>
        </ScrollView>
      </Animated.View>

      {/* MODALS WITHOUT OVERLAYS */}
      <Modal visible={showLanguageModal} transparent animationType="fade" onRequestClose={()=>setShowLanguageModal(false)}>
        <View style={[styles.modalContainer,isTablet&&styles.modalContainerTablet,{backgroundColor:isDarkMode?'#2a2a2a':'#fff'}]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle,getTextStyle(20),{color:isDarkMode?'#fff':'#000'}]}>
              {language==='english'?'Select Language':'Pumili ng Wika'}
            </Text>
            <TouchableOpacity onPress={()=>setShowLanguageModal(false)}>
              <Text style={[styles.closeButtonText,getTextStyle(24),{color:isDarkMode?'#fff':'#666'}]}>×</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalOptions}>
            {(['english','tagalog'] as const).map((lang)=>(
              <TouchableOpacity key={lang} style={[styles.option,tempLanguage===lang&&styles.optionSelected,{backgroundColor:isDarkMode?'#3a3a3a':'#fff',borderColor:isDarkMode?'#555':'#f0f0f0'}]} onPress={()=>setTempLanguage(lang)}>
                <Text style={[styles.optionText,tempLanguage===lang&&styles.optionTextSelected,getTextStyle(16),{color:isDarkMode?'#fff':'#333'}]}>
                  {lang==='english'?'English':'Filipino'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          
          <TouchableOpacity style={styles.okButton} onPress={()=>{
            if (isVibrationEnabled) Vibration.vibrate(50);
            setLanguage(tempLanguage);
            setShowLanguageModal(false);
          }}>
            <LinearGradient colors={['#00E59D','#00E59D']} style={styles.okButtonGradient}>
              <Text style={[styles.okButtonText,getTextStyle(16)]}>{language==='english'?'OK':'Sige'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={showFontSizeModal} transparent animationType="fade" onRequestClose={()=>setShowFontSizeModal(false)}>
        <View style={[styles.modalContainer,isTablet&&styles.modalContainerTablet,isLandscape&&styles.modalContainerLandscape,{backgroundColor:isDarkMode?'#2a2a2a':'#fff'}]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle,getTextStyle(20),{color:isDarkMode?'#fff':'#000'}]}>
              {language==='english'?'Font Size':'Laki ng Font'}
            </Text>
            <TouchableOpacity onPress={()=>setShowFontSizeModal(false)}>
              <Text style={[styles.closeButtonText,getTextStyle(24),{color:isDarkMode?'#fff':'#666'}]}>×</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView 
            style={isLandscape ? styles.scrollableModalContent : null}
            contentContainerStyle={isLandscape ? styles.scrollableModalContentContainer : null}
            showsVerticalScrollIndicator={isLandscape}
          >
            <Text style={[styles.modalText,getTextStyle(16),{color:isDarkMode?'#fff':'#333'}]}>
              {language==='english'?'Slide to adjust font size':'I-slide para ayusin ang laki ng font'}
            </Text>
            
            <View style={styles.sliderContainer}>
              <Text style={[styles.sliderLabel,getTextStyle(14),{color:isDarkMode?'#fff':'#666'}]}>100%</Text>
              <Slider style={styles.slider} minimumValue={100} maximumValue={120} step={1} value={tempFontSize} onValueChange={setTempFontSize} minimumTrackTintColor="#007AFF" maximumTrackTintColor={isDarkMode?'#555':'#ddd'} thumbTintColor="#007AFF"/>
              <Text style={[styles.sliderLabel,getTextStyle(14),{color:isDarkMode?'#fff':'#666'}]}>120%</Text>
            </View>

            <View style={styles.valueContainer}>
              <Text style={[styles.valueText,getTextStyle(18),{color:'#007AFF'}]}>{tempFontSize}%</Text>
            </View>

            <View style={[styles.previewContainer,{backgroundColor:isDarkMode?'#3a3a3a':'#f2f2f2'}]}>
              <Text style={[styles.previewText,getTempTextStyle(16),{color:isDarkMode?'#fff':'#333'}]}>
                {language==='english'?'This is how your text will look':'Ganito ang itsura ng iyong teksto'}
              </Text>
            </View>
            
            <TouchableOpacity style={styles.okButton} onPress={()=>{
              if (isVibrationEnabled) Vibration.vibrate(50);
              setFontSizePercentage(tempFontSize);
              setShowFontSizeModal(false);
            }}>
              <LinearGradient colors={['#00E59D','#00E59D']} style={styles.okButtonGradient}>
                <Text style={[styles.okButtonText,getTextStyle(16)]}>{language==='english'?'OK':'Sige'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showSpeedModal} transparent animationType="fade" onRequestClose={()=>setShowSpeedModal(false)}>
        <View style={[styles.modalContainer,isTablet&&styles.modalContainerTablet,isLandscape&&styles.modalContainerLandscape,{backgroundColor:isDarkMode?'#2a2a2a':'#fff'}]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle,getTextStyle(20),{color:isDarkMode?'#fff':'#000'}]}>
              {language==='english'?'TTS Speed':'Bilis ng TTS'}
            </Text>
            <TouchableOpacity onPress={()=>setShowSpeedModal(false)}>
              <Text style={[styles.closeButtonText,getTextStyle(24),{color:isDarkMode?'#fff':'#666'}]}>×</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView 
            style={isLandscape ? styles.scrollableModalContent : null}
            contentContainerStyle={isLandscape ? styles.scrollableModalContentContainer : null}
            showsVerticalScrollIndicator={isLandscape}
          >
            <Text style={[styles.modalText,getTextStyle(16),{color:isDarkMode?'#fff':'#333'}]}>
              {language==='english'?'Adjust text-to-speech speed':'Ayusin ang bilis ng text-to-speech'}
            </Text>
            
            <View style={styles.sliderContainer}>
              <Text style={[styles.sliderLabel,getTextStyle(14),{color:isDarkMode?'#fff':'#666'}]}>0.5x</Text>
              <Slider style={styles.slider} minimumValue={0.5} maximumValue={2.0} step={0.1} value={tempTtsSpeed} onValueChange={setTempTtsSpeed} minimumTrackTintColor="#007AFF" maximumTrackTintColor={isDarkMode?'#555':'#ddd'} thumbTintColor="#007AFF"/>
              <Text style={[styles.sliderLabel,getTextStyle(14),{color:isDarkMode?'#fff':'#666'}]}>2.0x</Text>
            </View>

            <View style={styles.valueContainer}>
              <Text style={[styles.valueText,getTextStyle(18),{color:'#007AFF'}]}>{tempTtsSpeed.toFixed(1)}x</Text>
              <Text style={[styles.descriptionText,getTextStyle(14),{color:isDarkMode?'#ccc':'#666'}]}>
                {tempTtsSpeed===1.0?(language==='english'?'Normal Speed':'Normal na Bilis'):tempTtsSpeed<1.0?(language==='english'?'Slower Pronunciation':'Mas Mabagal na Pagbigkas'):(language==='english'?'Faster Pronunciation':'Mas Mabilis na Pagbigkas')}
              </Text>
            </View>

            {/* TTS Speed Preview Section */}
            <View style={[styles.previewContainer,{backgroundColor:isDarkMode?'#3a3a3a':'#f2f2f2'}]}>
              <Text style={[styles.previewTitle,getTextStyle(14),{color:isDarkMode?'#ccc':'#666',marginBottom:10}]}>
                {language==='english'?'Preview TTS Speed':'I-preview ang Bilis ng TTS'}
              </Text>
              
              {/* Preview Text Box */}
              <View style={styles.previewTextContainer}>
                <Text style={[styles.previewText,getTextStyle(16),{color:isDarkMode?'#fff':'#333'}]}>
                  {(language === 'english' 
                    ? "This is a preview of the text to speech speed" 
                    : "Ito ay preview ng bilis ng text to speech"
                  ).split(' ').map((word, index) => (
                    <Text 
                      key={index} 
                      style={[
                        currentWordIndex === index ? styles.highlightedWord : {},
                        {color: isDarkMode ? '#fff' : '#333'}
                      ]}
                    >
                      {word}{' '}
                    </Text>
                  ))}
                </Text>
              </View>

              {/* Play/Stop Preview Button - Moved below the preview text */}
              <TouchableOpacity 
                style={[styles.previewButton, isPreviewPlaying ? styles.previewButtonStop : styles.previewButtonPlay]} 
                onPress={startTTSPreview}
              >
                <Text style={[styles.previewButtonText,getTextStyle(14),{color:'#fff'}]}>
                  {isPreviewPlaying 
                    ? (language==='english'?'Stop Preview':'Itigil ang Preview') 
                    : (language==='english'?'Play Preview':'I-play ang Preview')}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.okButton} onPress={()=>{
              if (isVibrationEnabled) Vibration.vibrate(50);
              setTtsSpeed(tempTtsSpeed);
              setShowSpeedModal(false);
            }}>
              <LinearGradient colors={['#00E59D','#00E59D']} style={styles.okButtonGradient}>
                <Text style={[styles.okButtonText,getTextStyle(16)]}>{language==='english'?'OK':'Sige'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showPitchModal} transparent animationType="fade" onRequestClose={()=>setShowPitchModal(false)}>
        <View style={[styles.modalContainer,isTablet&&styles.modalContainerTablet,{backgroundColor:isDarkMode?'#2a2a2a':'#fff'}]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle,getTextStyle(20),{color:isDarkMode?'#fff':'#000'}]}>
              {language==='english'?'TTS Pitch':'Tono ng TTS'}
            </Text>
            <TouchableOpacity onPress={()=>setShowPitchModal(false)}>
              <Text style={[styles.closeButtonText,getTextStyle(24),{color:isDarkMode?'#fff':'#666'}]}>×</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.modalText,getTextStyle(16),{color:isDarkMode?'#fff':'#333'}]}>
            {language==='english'?'Adjust text-to-speech pitch':'Ayusin ang tono ng text-to-speech'}
          </Text>
          <View style={styles.sliderContainer}>
            <Text style={[styles.sliderLabel,getTextStyle(14),{color:isDarkMode?'#fff':'#666'}]}>0.5</Text>
            <Slider style={styles.slider} minimumValue={0.5} maximumValue={2.0} step={0.1} value={tempTtsPitch} onValueChange={setTempTtsPitch} minimumTrackTintColor="#007AFF" maximumTrackTintColor={isDarkMode?'#555':'#ddd'} thumbTintColor="#007AFF"/>
            <Text style={[styles.sliderLabel,getTextStyle(14),{color:isDarkMode?'#fff':'#666'}]}>2.0</Text>
          </View>
          <View style={styles.valueContainer}>
            <Text style={[styles.valueText,getTextStyle(18),{color:'#007AFF'}]}>{tempTtsPitch.toFixed(1)}</Text>
            <Text style={[styles.descriptionText,getTextStyle(14),{color:isDarkMode?'#ccc':'#666'}]}>
              {tempTtsPitch===1.0?(language==='english'?'Normal Pitch':'Normal na Tono'):tempTtsPitch<1.0?(language==='english'?'Lower Pitch':'Mas Mababang Tono'):(language==='english'?'Higher Pitch':'Mas Mataas na Tono')}
            </Text>
          </View>
          <TouchableOpacity style={styles.okButton} onPress={()=>{
            if (isVibrationEnabled) Vibration.vibrate(50);
            setTtsPitch(tempTtsPitch);
            setShowPitchModal(false);
          }}>
            <LinearGradient colors={['#00E59D','#00E59D']} style={styles.okButtonGradient}>
              <Text style={[styles.okButtonText,getTextStyle(16)]}>{language==='english'?'OK':'Sige'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
};

const styles=StyleSheet.create({
  customizeSidebar:{position:'absolute',left:0,top:0,bottom:0,paddingTop:80,paddingHorizontal:20,elevation:10,zIndex:35},
  customizeSidebarLandscape:{paddingTop:60},
  customizeSidebarTablet:{paddingHorizontal:40,paddingTop:100},
  customizeScrollContainer:{paddingBottom:40},
  customizeHeader:{flexDirection:'row',alignItems:'center',marginBottom:30,paddingBottom:15,borderBottomWidth:1,borderBottomColor:'#f0f0f0'},
  customizeHeaderTablet:{marginBottom:40},
  backButton:{marginRight:15},
  backIcon:{width:24,height:24},
  backIconTablet:{width:30,height:30},
  customizeTitle:{fontSize:22,fontWeight:'bold',flex:1},
  customizeTitleTablet:{fontSize:28},
  customizeButton:{flexDirection:'row',alignItems:'center',paddingVertical:20,paddingHorizontal:15,borderRadius:10,marginBottom:10,backgroundColor:'transparent'},
  customizeButtonTablet:{paddingVertical:25,paddingHorizontal:20},
  customizeIcon:{width:24,height:24,marginRight:15},
  customizeIconTablet:{width:30,height:30,marginRight:20},
  customizeText:{fontSize:16,fontWeight:'600',flex:1},
  customizeTextTablet:{fontSize:20},
  toggleIndicator:{width:50,height:24,borderRadius:12,padding:2,marginLeft:10},
  toggleOn:{backgroundColor:'#007AFF',alignItems:'flex-end'},
  toggleOff:{backgroundColor:'#ccc',alignItems:'flex-start'},
  toggleCircle:{width:20,height:20,borderRadius:10},
  toggleCircleOn:{backgroundColor:'#fff'},
  toggleCircleOff:{backgroundColor:'#fff'},
  quickSettings:{marginTop:30,padding:15,borderRadius:10},
  quickSettingsTitle:{fontWeight:'600',marginBottom:10,textAlign:'center'},
  settingItem:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:5},
  settingLabel:{fontWeight:'500'},
  settingValue:{fontWeight:'600'},
  modalContainer:{borderRadius:20,padding:25,width:'90%',maxWidth:400,marginHorizontal:20,alignSelf:'center',marginTop:'auto',marginBottom:'auto', shadowColor:'#000',shadowOffset:{width:0, height:2,}, shadowOpacity:0.25, shadowRadius:3.84, elevation:5,},
  modalContainerTablet:{padding:40,maxWidth:500},
  modalContainerLandscape:{height:325,marginTop:20,marginBottom:20},
  modalHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20},
  modalTitle:{fontSize:20,fontWeight:'700'},
  modalOptions:{marginBottom:25},
  option:{padding:15,borderRadius:10,marginBottom:10,borderWidth:2},
  optionSelected:{borderColor:'#007AFF',backgroundColor:'#f0f8ff'},
  optionText:{fontSize:16,textAlign:'center'},
  optionTextSelected:{fontWeight:'600'},
  modalText:{textAlign:'center',marginBottom:25},
  sliderContainer:{flexDirection:'row',alignItems:'center',marginBottom:15},
  slider:{flex:1,height:40,marginHorizontal:10},
  sliderLabel:{fontSize:12,width:40,textAlign:'center'},
  valueContainer:{alignItems:'center',marginBottom:25},
  valueText:{fontSize:18,fontWeight:'bold'},
  descriptionText:{textAlign:'center'},
  previewContainer:{padding:20,borderRadius:12,marginBottom:25,alignItems:'center'},
  previewText:{textAlign:'center'},
  okButton:{borderRadius:40,overflow:'hidden'},
  okButtonGradient:{paddingVertical:15,alignItems:'center',justifyContent:'center'},
  okButtonText:{color:'#fff',fontSize:16,fontWeight:'700'},
  closeButtonText:{fontSize:24,fontWeight:'300'},
  // New styles for TTS Preview
  previewTitle:{textAlign:'center',marginBottom:10},
  previewButton:{paddingVertical:12,paddingHorizontal:20,borderRadius:25,marginTop:15,alignItems:'center'},
  previewButtonPlay:{backgroundColor:'#007AFF'},
  previewButtonStop:{backgroundColor:'#FF3B30'},
  previewButtonText:{fontWeight:'600'},
  previewTextContainer:{padding:15,borderRadius:8,backgroundColor:'rgba(0,0,0,0.1)',minHeight:60,justifyContent:'center'},
  highlightedWord:{backgroundColor:'#4aa0fcff',color:'#fff',paddingHorizontal:4,borderRadius:4,fontWeight:'bold'},
  // New styles for scrollable modals in landscape
  scrollableModalContent:{flex:1},
  scrollableModalContentContainer:{paddingBottom:20},
});

export default CustomizeSidebar;