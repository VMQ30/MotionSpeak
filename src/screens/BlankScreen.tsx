import React from 'react';
import { View, StyleSheet } from 'react-native';

const BlankScreen = () => {
  return <View style={styles.container} />;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});

export default BlankScreen;
