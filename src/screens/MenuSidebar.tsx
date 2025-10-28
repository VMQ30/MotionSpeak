import React from 'react';
import {View, Text, TouchableOpacity, Image, StyleSheet, ScrollView, Animated} from 'react-native';
import {useLanguage} from '../context/LanguageContext';
import {useFontSize} from '../context/FontSizeContext';

type MenuSidebarProps = {
  menuOpen: boolean;
  menuWidth: number;
  isLandscape: boolean;
  isTablet: boolean;
  isTabletLandscape: boolean;
  isDarkMode: boolean;
  slideStyle: any;
  language: "english" | "tagalog";
  getTextStyle: (baseSize: number) => any;
  closeMenu: () => void;
  navigation: any;
  setShowCustomizeModal: (show: boolean) => void; // Add this back
};

const MenuSidebar: React.FC<MenuSidebarProps> = ({
  menuOpen,
  menuWidth,
  isLandscape,
  isTablet,
  isTabletLandscape,
  isDarkMode,
  slideStyle,
  language,
  getTextStyle,
  closeMenu,
  navigation,
  setShowCustomizeModal,
}) => {
  const { fontSizePercentage } = useFontSize();

  const menuItems = [
    {key:'home',icon:require('../assets/home.png'),text:language==='english'?'Back to Home':'Balik sa Home',onPress:()=>{closeMenu();navigation.replace('Home');}},
    {key:'customize',icon:require('../assets/customize.png'),text:language==='english'?'Customize':'I-customize',onPress:()=>{setShowCustomizeModal(true);}},
    {key:'tutorial',icon:require('../assets/tutorial.png'),text:language==='english'?'How to use the app':'Paano gamitin ang app',onPress:()=>{closeMenu();navigation.replace('Tutorial',{fromHomepage:true});}},
    {key:'tips',icon:require('../assets/tutorial.png'),text:language==='english'?'Tips':'Mga Tips',onPress:()=>{closeMenu();navigation.replace('TipsNew',{fromHomepage:true});}},
    {key:'notification',icon:require('../assets/notification.png'),text:language==='english'?'Notifications':'Mga Notification',onPress:()=>{}},
  ];

  return (
    <Animated.View style={[styles.sideMenu,isLandscape&&styles.sideMenuLandscape,isTablet&&styles.sideMenuTablet,isTabletLandscape&&styles.sideMenuTabletLandscape,{width:menuWidth,backgroundColor:isDarkMode?'#1a1a1a':'#fff'},slideStyle]} pointerEvents={menuOpen?'auto':'none'}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuScrollContainer}>
        <View style={[styles.menuHeader,isTablet&&styles.menuHeaderTablet,isTabletLandscape&&styles.menuHeaderTabletLandscape]}>
          <View style={styles.logoContainer}>
            <Image source={require('../assets/logo-slanted.png')} style={[styles.menuLogo,isTablet&&styles.menuLogoTablet,isTabletLandscape&&styles.menuLogoTabletLandscape]} resizeMode="contain"/>
          </View>
          <Text style={[styles.motionText,isTablet&&styles.motionTextTablet,getTextStyle(25),{color:isDarkMode?'#fff':'#0086b3'}]}>
            Motion<Text style={[styles.speakText,{color:isDarkMode?'#ccc':'#606060'}]}>Speak</Text>
          </Text>
        </View>

        {menuItems.map((item)=>(
          <TouchableOpacity key={item.key} style={[styles.menuButton,isTablet&&styles.menuButtonTablet,isTabletLandscape&&styles.menuButtonTabletLandscape]} onPress={item.onPress}>
            <Image source={item.icon} style={[styles.menuIcon,isTablet&&styles.menuIconTablet,isTabletLandscape&&styles.menuIconTabletLandscape,{tintColor:isDarkMode?'#fff':'#0086b3'}]} resizeMode="contain"/>
            <Text style={[styles.menuText,isTablet&&styles.menuTextTablet,getTextStyle(16),{color:isDarkMode?'#fff':'#0086b3'}]}>{item.text}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  sideMenu: {position:'absolute',left:0,top:0,bottom:0,paddingTop:60,paddingHorizontal:20,elevation:8,zIndex:25},
  sideMenuLandscape: {paddingTop:60},
  sideMenuTablet: {paddingHorizontal:40},
  sideMenuTabletLandscape: {width:'30%',paddingHorizontal:40,paddingTop:80},
  menuScrollContainer: {paddingBottom:60},
  menuHeader: {flexDirection:'row',alignItems:'center',justifyContent:'center',marginBottom:30},
  menuHeaderTablet: {marginBottom:40},
  menuHeaderTabletLandscape: {flexDirection:'row',alignItems:'center',justifyContent:'flex-start',marginBottom:50},
  logoContainer: {marginRight:2},
  menuLogo: {width:60,height:60},
  menuLogoTablet: {width:100,height:100},
  menuLogoTabletLandscape: {width:110,height:110,marginRight:5},
  motionText: {fontSize:26,fontWeight:'bold',marginTop:13},
  speakText: {},
  motionTextTablet: {fontSize:38},
  menuButton: {flexDirection:'row',alignItems:'center',paddingVertical:18},
  menuButtonTablet: {paddingVertical:26},
  menuButtonTabletLandscape: {flexDirection:'row',alignItems:'center',paddingVertical:20,justifyContent:'flex-start'},
  menuIcon: {width:22,height:22,marginLeft:22},
  menuIconTablet: {width:36,height:36},
  menuIconTabletLandscape: {width:36,height:36,marginLeft:22},
  menuText: {fontSize:16,marginLeft:15},
  menuTextTablet: {fontSize:22},
  menuTextTabletLandscape: {fontSize:24},
});

export default MenuSidebar;