import React,{useState,useRef,useEffect} from 'react';
import {View,Text,TouchableOpacity,StyleSheet,Animated,Image,Platform,PanResponder,Dimensions,Vibration} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type{NativeStackNavigationProp} from '@react-navigation/native-stack';
import type{RootStackParamList} from '../navigation/StackNavigator';
import {useLanguage} from '../context/LanguageContext';
import {useFontSize} from '../context/FontSizeContext';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const{width:SCREEN_WIDTH,height:SCREEN_HEIGHT}=Dimensions.get('window');

type RouteParams={fromHomepage?:boolean;fromTips?:boolean;};

const TutorialScreen:React.FC=()=>{
  const navigation=useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const{language}=useLanguage();
  const{fontSizePercentage}=useFontSize();
  const insets=useSafeAreaInsets();
  
  const[page,setPage]=useState<number>(0);
  const[isLandscape,setIsLandscape]=useState(false);
  const[isTablet,setIsTablet]=useState(false);
  const[showBackArrow,setShowBackArrow]=useState(false);
  const[isDarkMode,setIsDarkMode]=useState(false);

  const slideAnim=useRef(new Animated.Value(0)).current;
  const fadeAnim=useRef(new Animated.Value(0)).current;
  const blurAnim=useRef(new Animated.Value(0)).current;
  const backButtonAnim=useRef(new Animated.Value(1)).current;
  const nextButtonAnim=useRef(new Animated.Value(1)).current;
  const navBackButtonAnim=useRef(new Animated.Value(1)).current;

  const NEXT_BUTTON_COLOR='#1BC4AB';
  const BACK_BUTTON_COLOR='#430A6D';
  const BUTTON_PRESSED_OPACITY=0.7;
  const rightArrow=require('../assets/next_arrow.png');
  const leftArrow=require('../assets/back_arrow.png');

  useEffect(()=>{
    loadDarkModePreference();
    const handleChange=({window}:{window:{width:number;height:number}})=>{
      setIsLandscape(window.width>window.height);
      setIsTablet(Math.min(window.width,window.height)>=600);
    };
    const subscription=Dimensions.addEventListener('change',handleChange);
    const{width,height}=Dimensions.get('window');
    setIsLandscape(width>height);
    setIsTablet(Math.min(width,height)>=600);
    return()=>subscription?.remove?.();
  },[]);

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

  const pages=[
    {special:false,header:language==='tagalog'?'Kumonekta Muna':'Let\'s Get Connected',body:language==='tagalog'?'Tiyaking naka-ON ang Bluetooth ng iyong device upang makita ng MotionSpeak ang iyong mga gloves.':'Make sure your device\'s Bluetooth is ON so MotionSpeak can detect your gloves.',image:require('../assets/tut_slide_1.png'),},
    {header:language==='tagalog'?'Buksan ang Gloves':'Turn on Gloves',body:language==='tagalog'?'I-on ang iyong gesture gloves at maghanda para sa pagsasalin ng mga galaw.':'Switch on your gesture gloves and get ready to translate movements.',image:require('../assets/tut_slide_2.png'),},
    {header:language==='tagalog'?'Simulan ang Paggalaw':'Start Gesturing',body:language==='tagalog'?'Iwagayway, ituro, o mag-sign at panoorin kung paano isinasalin ng app ang iyong mga kilos sa totoong oras.':'Wave, point, or sign, and see your gestures translated in real time.',image:require('../assets/tut_slide_3.png'),},
  ];

  const slideToPage=(newPage:number,direction:'left'|'right')=>{
    Animated.timing(blurAnim,{toValue:1,duration:100,useNativeDriver:true}).start();
    const slideOut=Animated.parallel([
      Animated.timing(slideAnim,{toValue:direction==='left'?-SCREEN_WIDTH:SCREEN_WIDTH,duration:150,useNativeDriver:true}),
      Animated.timing(fadeAnim,{toValue:0,duration:150,useNativeDriver:true}),
    ]);
    const slideIn=Animated.parallel([
      Animated.timing(slideAnim,{toValue:0,duration:180,useNativeDriver:true}),
      Animated.timing(fadeAnim,{toValue:1,duration:180,useNativeDriver:true}),
    ]);
    slideOut.start(()=>{
      setPage(newPage);
      slideAnim.setValue(direction==='left'?SCREEN_WIDTH:-SCREEN_WIDTH);
      slideIn.start(()=>{
        Animated.timing(blurAnim,{toValue:0,duration:100,useNativeDriver:true}).start();
      });
    });
  };

  const handlePressIn=(buttonAnim:Animated.Value)=>{
    Animated.timing(buttonAnim,{toValue:BUTTON_PRESSED_OPACITY,duration:150,useNativeDriver:true}).start();
  };

  const handlePressOut=(buttonAnim:Animated.Value)=>{
    Animated.timing(buttonAnim,{toValue:1,duration:150,useNativeDriver:true}).start();
  };

  const handleBackToHome=()=>{
    Vibration.vibrate(20);
    navigation.navigate('Home');
  };

  const panResponder=useRef(PanResponder.create({
    onStartShouldSetPanResponder:()=>true,
    onMoveShouldSetPanResponder:(_,gestureState)=>Math.abs(gestureState.dx)>Math.abs(gestureState.dy*2),
    onPanResponderRelease:(_,gestureState)=>{
      const{dx}=gestureState;
      const swipeThreshold=50;
      if(dx<-swipeThreshold&&page<pages.length-1)slideToPage(page+1,'left');
      else if(dx>swipeThreshold&&page>0)slideToPage(page-1,'right');
    },
  })).current;

  useEffect(()=>{
    if(page===0){
      Animated.timing(fadeAnim,{toValue:1,duration:200,useNativeDriver:true}).start();
    }
  },[]);

  const goNext=()=>{
    if(page<pages.length-1)slideToPage(page+1,'left');
    else navigation.navigate('Home');
  };

  const goBack=()=>{
    if(page>0)slideToPage(page-1,'right');
  };

  const renderBodyText=(text:string)=>{
    const parts=text.split('\n\n');
    if(parts.length>1){
      return(
        <View>
          <Text style={[styles.bodyTextBold,isLandscape&&styles.bodyTextBoldLandscape,isTablet&&styles.bodyTextBoldTablet,{fontSize:19*(fontSizePercentage/100), color: isDarkMode ? '#fff' : '#222'}]}>{parts[0]}</Text>
          <Text style={[styles.bodyTextNormal,isLandscape&&styles.bodyTextNormalLandscape,isTablet&&styles.bodyTextNormalTablet,{fontSize:19*(fontSizePercentage/100), color: isDarkMode ? '#fff' : '#222'}]}>{'\n\n'+parts[1]}</Text>
        </View>
      );
    }
    return<Text style={[styles.bodyTextNormal,isLandscape&&styles.bodyTextNormalLandscape,isTablet&&styles.bodyTextNormalTablet,{fontSize:19*(fontSizePercentage/100), color: isDarkMode ? '#fff' : '#222'}]}>{text}</Text>;
  };

  const isLast=page===pages.length-1;

  const getButtonWrapperStyle=()=>{
    if(page===0)return isLandscape?[styles.buttonWrapperLarge,{width:150}]:styles.buttonWrapperLarge;
    else return isLandscape?[styles.buttonWrapperSmall,{width:150}]:styles.buttonWrapperSmall;
  };

  const MainContent=()=>(
    <View style={[styles.screen,isLandscape&&styles.screenLandscape,{paddingTop:insets.top,paddingBottom:insets.bottom, backgroundColor: isDarkMode ? '#1a1a1a' : '#fff'}]}>
      <View style={[styles.topBar,isLandscape&&styles.topBarLandscape]}>
        <View style={styles.indicatorRow}>
          {pages.map((_,i)=>{
            const activeColor=i===page?(isLast?'#00FFFF':'#007AFF'):'#D3D3D3';
            return<View key={i} style={[styles.indicator,{backgroundColor:activeColor}]}/>;
          })}
        </View>
        {showBackArrow&&(
          <View style={[styles.backArrowContainer,isLandscape&&styles.backArrowContainerLandscape]}>
            <TouchableOpacity activeOpacity={1} onPressIn={()=>handlePressIn(navBackButtonAnim)} onPressOut={()=>handlePressOut(navBackButtonAnim)} onPress={handleBackToHome} style={[styles.backArrowButton,isTablet&&styles.backArrowButtonTablet]}>
              <Animated.View style={[styles.solidButton,styles.backArrowCircle,{opacity:navBackButtonAnim, backgroundColor: isDarkMode ? '#333' : BACK_BUTTON_COLOR}]}>
                <Image source={require('../assets/back_arrow.png')} style={[styles.backArrowIcon,isTablet&&styles.backArrowIconTablet]} resizeMode="contain"/>
              </Animated.View>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={[styles.contentContainer,isLandscape&&styles.contentContainerLandscape]} {...panResponder.panHandlers}>
        <Animated.View style={[styles.contentWrap,isLandscape&&styles.contentWrapLandscape,{transform:[{translateX:slideAnim},{scale:blurAnim.interpolate({inputRange:[0,1],outputRange:[1,0.98]})}],opacity:fadeAnim}]}>
          {(
            <View style={[styles.middleContent,isLandscape&&styles.middleContentLandscape]}>
              <View style={[styles.landscapeContentContainer,isLandscape&&styles.landscapeContentContainerLandscape]}>
                <Image source={pages[page].image} style={[styles.tutorialImage,isLandscape&&styles.tutorialImageLandscape,isTablet&&styles.tutorialImageTablet]} resizeMode="contain"/>
                <View style={[styles.textContent,isLandscape&&styles.textContentLandscape,isTablet&&styles.textContentTablet]}>
                  <Text style={[styles.headerPlain,isLandscape&&styles.headerPlainLandscape,isTablet&&styles.headerPlainTablet,{fontSize:30*(fontSizePercentage/100), color: isDarkMode ? '#fff' : '#000'}]}>{pages[page].header}</Text>
                  {renderBodyText(pages[page].body)}
                </View>
              </View>
            </View>
          )}
          {pages[page].special&&(
            <Text style={[styles.bodyTextNormal,isLandscape&&styles.bodyTextNormalLandscape,{fontSize:19*(fontSizePercentage/100), color: isDarkMode ? '#fff' : '#222'}]}>{pages[page].body}</Text>
          )}
        </Animated.View>
      </View>

      <View style={[styles.bottomBar,isLandscape&&styles.bottomBarLandscape]}>
        <View style={[styles.buttonsContainer,page===0?styles.singleButtonCenter:styles.dualButtonSpace]}>
          {page>0&&(
            <TouchableOpacity activeOpacity={1} onPressIn={()=>handlePressIn(backButtonAnim)} onPressOut={()=>handlePressOut(backButtonAnim)} onPress={()=>{Vibration.vibrate(20);goBack();}} style={[isLandscape?[styles.buttonWrapperSmall,{width:150}]:styles.buttonWrapperSmall,isTablet&&styles.buttonWrapperTablet]}>
              <Animated.View style={[styles.solidButton,{backgroundColor:BACK_BUTTON_COLOR},{opacity:backButtonAnim}]}>
                <View style={styles.buttonContent}>
                  <Image source={leftArrow} style={[styles.arrowIcon,styles.leftArrow]}/>
                  <Text style={[styles.buttonLabel,isTablet&&styles.buttonLabelTablet,{fontSize:16*(fontSizePercentage/100)}]}>{language==='english'?'Back':'Bumalik'}</Text>
                </View>
              </Animated.View>
            </TouchableOpacity>
          )}
          <TouchableOpacity activeOpacity={1} onPressIn={()=>handlePressIn(nextButtonAnim)} onPressOut={()=>handlePressOut(nextButtonAnim)} onPress={()=>{Vibration.vibrate(20);goNext();}} style={[getButtonWrapperStyle(),isTablet&&styles.buttonWrapperTablet]}>
            <Animated.View style={[styles.solidButton,{backgroundColor:NEXT_BUTTON_COLOR},{opacity:nextButtonAnim}]}>
              <View style={styles.buttonContent}>
                <Text style={[styles.buttonLabel,isTablet&&styles.buttonLabelTablet,{fontSize:16*(fontSizePercentage/100)}]}>
                  {isLast?(language==='english'?'Start':'Magsimula'):(language==='english'?'Next':'Susunod')}
                </Text>
                <Image source={rightArrow} style={[styles.arrowIcon,styles.rightArrow]}/>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if(isLandscape)return<MainContent/>;
  else return(<SafeAreaView style={[styles.safeArea, { backgroundColor: isDarkMode ? '#1a1a1a' : '#fff' }]}><MainContent/></SafeAreaView>);
};

export default TutorialScreen;

const styles = StyleSheet.create({
// SAFE AREA & MAIN SCREEN CONTAINERS
  safeArea: {flex: 1, backgroundColor: '#fff'},
  screen: {flex: 1, backgroundColor: '#fff'},
  screenLandscape: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20},

// TOP BAR & NAVIGATION
  topBar: {height: Platform.OS === 'ios' ? 96 : 80, justifyContent: 'flex-end', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 28 : 10, position: 'relative'},
  topBarLandscape: {height: 60, paddingTop: 0, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, alignItems: 'center', justifyContent: 'flex-start'},
  
// BACK ARROW COMPONENTS
  backArrowContainer: {position: 'absolute', left: 20, top: Platform.OS === 'ios' ? 80 : 60, zIndex: 20, alignItems: 'flex-start'},
  backArrowContainerLandscape: {left: 40, top: 50},
  backArrowButton: {borderRadius: 25, overflow: 'hidden'},
  backArrowButtonTablet: {borderRadius: 30},
  backArrowIcon: {width: 32, height: 32},
  backArrowIconTablet: {width: 32, height: 32},
  backArrowCircle: {width: 50, height: 50, borderRadius: 25, backgroundColor: '#430A6D', alignItems: 'center', justifyContent: 'center', ...Platform.select({ios: {shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.1, shadowRadius: 3}, android: {elevation: 3},})},

// BUTTON STYLES
  solidButton: {paddingVertical: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 40},
  buttonContent: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  arrowIcon: {width: 16, height: 16, tintColor: '#fff'},
  leftArrow: {marginRight: 8},
  rightArrow: {marginLeft: 8},
  buttonWrapperSmall: {width: 150, borderRadius: 40, overflow: 'hidden'},
  buttonWrapperLarge: {width: 150, borderRadius: 40, overflow: 'hidden'},
  buttonWrapperTablet: {width: 250, borderRadius: 50},
  buttonLabel: {color: '#fff', fontSize: 16, fontWeight: '700'},
  buttonLabelTablet: {fontSize: 20},

// INDICATOR/PAGINATION
  indicatorRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Platform.OS === 'ios' ? 10 : 5},
  indicator: {width: 36, height: 8, borderRadius: 6, marginHorizontal: 6},

// MAIN CONTENT AREAS
  middleContent: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  middleContentLandscape: {position: 'absolute', top: '50%', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', transform: [{translateY: -100}]},
  landscapeContentContainer: {alignItems: 'center'},
  landscapeContentContainerLandscape: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 40},
  bottomBar: {paddingBottom: 36, alignItems: 'center'},
  bottomBarLandscape: {position: 'absolute', bottom: '2%', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: '2%'},
  contentContainer: {flex: 1, width: '100%'},
  contentContainerLandscape: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  contentWrap: {flex: 1, alignItems: 'center', paddingHorizontal: 28, justifyContent: 'center', width: '100%'},
  contentWrapLandscape: {paddingHorizontal: 40, justifyContent: 'center', alignItems: 'center', flex: 1},

// IMAGE STYLES
  tutorialImage: {width: 200, height: 200, marginBottom: 20, borderRadius: 20},
  tutorialImageLandscape: {width: 180, height: 180, borderRadius: 15, alignSelf: 'center'},
  tutorialImageTablet: {width: 320, height: 320, borderRadius: 25},

// TEXT CONTENT CONTAINERS
  textContent: {alignItems: 'center'},
  textContentLandscape: {alignItems: 'flex-start', justifyContent: 'center', maxWidth: 300},
  textContentTablet: {maxWidth: 600},

// BUTTON LAYOUT CONTAINERS
  buttonsContainer: {width: '100%', paddingHorizontal: 20},
  dualButtonSpace: {flexDirection: 'row', justifyContent: 'center', gap: 20},
  singleButtonCenter: {flexDirection: 'row', justifyContent: 'center'},

// TYPOGRAPHY
  headerPlain: {fontSize: 30, fontWeight: '700', textAlign: 'center', color: '#000', marginBottom: 8},
  headerPlainLandscape: {fontSize: 24, marginBottom: 6, textAlign: 'left'},
  headerPlainTablet: {fontSize: 40, marginBottom: 14},
  bodyTextBold: {fontSize: 19, color: '#222', textAlign: 'center', lineHeight: 26, marginTop: 0, fontWeight: '700'},
  bodyTextBoldLandscape: {fontSize: 16, lineHeight: 22, textAlign: 'left'},
  bodyTextBoldTablet: {fontSize: 26, lineHeight: 34},
  bodyTextNormal: {fontSize: 19, color: '#222', textAlign: 'center', lineHeight: 26, fontWeight: '400'},
  bodyTextNormalLandscape: {fontSize: 16, lineHeight: 22, textAlign: 'left'},
  bodyTextNormalTablet: {fontSize: 24, lineHeight: 32},
});