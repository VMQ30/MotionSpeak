import React from 'react';
import { requireNativeComponent, ViewProps, Platform, View, StyleSheet, Text, UIManager } from 'react-native';

interface NativeCameraProps extends ViewProps {
  facing?: 'front' | 'back';
}

const COMPONENT_NAME = 'MotionSpeakCameraView';

// Module-level static reference to prevent React component unmounting/remounting on re-render
let NativeCameraView: any = null;
if (Platform.OS === 'android') {
  try {
    if (UIManager.hasViewManagerConfig(COMPONENT_NAME)) {
      NativeCameraView = requireNativeComponent<NativeCameraProps>(COMPONENT_NAME);
    }
  } catch (e) {
    console.warn('NativeCameraView initialization error:', e);
  }
}

export const CameraView: React.FC<NativeCameraProps> = React.memo(({ style, facing = 'front', children, ...props }) => {
  // If static init was missed (e.g. initial bundle load timing), attempt once more
  if (Platform.OS === 'android' && !NativeCameraView && UIManager.hasViewManagerConfig(COMPONENT_NAME)) {
    try {
      NativeCameraView = requireNativeComponent<NativeCameraProps>(COMPONENT_NAME);
    } catch (e) {
      console.warn('Lazy NativeCameraView error:', e);
    }
  }

  if (Platform.OS === 'android' && NativeCameraView) {
    return (
      <NativeCameraView style={[styles.container, style]} facing={facing} {...props}>
        {children}
      </NativeCameraView>
    );
  }

  // Fallback Viewfinder for environments where native APK needs to be re-built/re-run
  return (
    <View style={[styles.fallbackContainer, style]}>
      <Text style={styles.fallbackText}>📷 Camera Viewfinder ({facing} facing)</Text>
      <Text style={styles.fallbackSubtext}>Re-run "npm run android" to refresh native binary</Text>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fallbackContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  fallbackText: {
    color: '#00bfff',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 8,
  },
  fallbackSubtext: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
  },
});
