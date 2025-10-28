// context/FontSizeContext.tsx
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FontSizeContextType {
  fontSizePercentage: number;
  setFontSizePercentage: (size: number) => void;
}

const FontSizeContext = createContext<FontSizeContextType | undefined>(undefined);

export const FontSizeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [fontSizePercentage, setFontSizePercentage] = useState(100);

  // Load font size from storage on app start
  useEffect(() => {
    loadFontSize();
  }, []);

  const loadFontSize = async () => {
    try {
      const savedFontSize = await AsyncStorage.getItem('fontSizePercentage');
      if (savedFontSize) {
        setFontSizePercentage(Number(savedFontSize));
      }
    } catch (error) {
      console.error('Error loading font size:', error);
    }
  };

  // Save font size whenever it changes
  useEffect(() => {
    saveFontSize();
  }, [fontSizePercentage]);

  const saveFontSize = async () => {
    try {
      await AsyncStorage.setItem('fontSizePercentage', fontSizePercentage.toString());
    } catch (error) {
      console.error('Error saving font size:', error);
    }
  };

  const updateFontSize = (size: number) => {
    setFontSizePercentage(size);
  };

  return (
    <FontSizeContext.Provider value={{ fontSizePercentage, setFontSizePercentage: updateFontSize }}>
      {children}
    </FontSizeContext.Provider>
  );
};

export const useFontSize = () => {
  const context = useContext(FontSizeContext);
  if (context === undefined) {
    throw new Error('useFontSize must be used within a FontSizeProvider');
  }
  return context;
};