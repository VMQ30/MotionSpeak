import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Language = 'english' | 'tagalog';

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (lang: Language) => void;
}>({
  language: 'english',
  setLanguage: () => {},
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('english');

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const savedLang = await AsyncStorage.getItem('appLanguage');
        if (savedLang) setLanguage(savedLang as Language);
      } catch (error) {
        console.error('Failed to load language:', error);
      }
    };
    loadLanguage();
  }, []);

  const updateLanguage = (lang: Language) => {
    setLanguage(lang);
    AsyncStorage.setItem('appLanguage', lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: updateLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);