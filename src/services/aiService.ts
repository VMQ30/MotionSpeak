import { NativeModules, Platform } from 'react-native';

const { MotionSpeakAI } = NativeModules;

export interface AIPredictionResult {
  gloss: string;
  confidence: number;
  rawConfidence?: number;
  classIndex?: number;
  status: 'success' | 'unrecognized' | 'no_hand' | 'fallback' | 'error';
  isHandDetected?: boolean;
  isGestureRecognized?: boolean;
  isNative: boolean;
  fingerTrackingSummary?: string;
  topPredictions?: string;
}

export interface AIModelInfo {
  isLoaded: boolean;
  modelName: string;
  sequenceLength: number;
  featureVectorSize: number;
  numClasses: number;
  glosses: string[];
  isNative: boolean;
}

export const SUPPORTED_GLOSSES = [
  'hello',
  'yes',
  'no',
  'good',
  'bad',
  'what',
  'thank you',
  'welcome',
  'please',
  'sorry',
  'goodbye',
  'morning',
  'afternoon',
  'evening',
  'excuse',
];

/**
 * Checks whether native TFLite module is available on this environment.
 */
export const isNativeAIModuleAvailable = (): boolean => {
  return Platform.OS === 'android' && !!MotionSpeakAI && typeof MotionSpeakAI.predictSign === 'function';
};

/**
 * Retrieves AI model information and supported glosses.
 */
export const getAIModelInfo = async (): Promise<AIModelInfo> => {
  if (isNativeAIModuleAvailable()) {
    try {
      const info = await MotionSpeakAI.getModelInfo();
      return {
        ...info,
        isNative: true,
      };
    } catch (e) {
      console.warn('Native getModelInfo failed, falling back to JS info:', e);
    }
  }

  return {
    isLoaded: true,
    modelName: 'motion_speak_model.tflite (JS Mode)',
    sequenceLength: 30,
    featureVectorSize: 225,
    numClasses: SUPPORTED_GLOSSES.length,
    glosses: SUPPORTED_GLOSSES,
    isNative: false,
  };
};

export const predictSignFromKeypoints = async (
  keypoints?: number[][] | number[]
): Promise<AIPredictionResult> => {
  if (isNativeAIModuleAvailable()) {
    try {
      if (keypoints) {
        const res = await MotionSpeakAI.predictSign(keypoints);
        return {
          gloss: res.gloss || '',
          confidence: res.confidence || 0,
          rawConfidence: res.rawConfidence || 0,
          classIndex: res.classIndex,
          status: res.status || 'success',
          isHandDetected: res.isHandDetected ?? true,
          isGestureRecognized: res.isGestureRecognized ?? true,
          isNative: true,
          fingerTrackingSummary: res.fingerTrackingSummary,
          topPredictions: res.topPredictions,
        };
      } else if (MotionSpeakAI.predictCameraFrame) {
        const res = await MotionSpeakAI.predictCameraFrame();
        return {
          gloss: res.gloss || '',
          confidence: res.confidence || 0,
          rawConfidence: res.rawConfidence || 0,
          classIndex: res.classIndex,
          status: res.status || 'success',
          isHandDetected: res.isHandDetected ?? true,
          isGestureRecognized: res.isGestureRecognized ?? true,
          isNative: true,
          fingerTrackingSummary: res.fingerTrackingSummary,
          topPredictions: res.topPredictions,
        };
      }
    } catch (e) {
      console.warn('Native predictSign / predictCameraFrame failed:', e);
    }
  }

  // If native AI module is unavailable, return an explicit error state instead of generating fake predictions
  return {
    gloss: '',
    confidence: 0,
    rawConfidence: 0,
    status: 'error',
    isHandDetected: false,
    isGestureRecognized: false,
    isNative: false,
  };
};

/**
 * Generates synthetic 30x225 feature matrix representing a sign gesture.
 */
export const generateSampleKeypoints = (glossName: string): number[][] => {
  const seed = SUPPORTED_GLOSSES.indexOf(glossName.toLowerCase()) + 1;
  const sequence: number[][] = [];

  for (let frame = 0; frame < 30; frame++) {
    const frameFeatures: number[] = [];
    for (let f = 0; f < 225; f++) {
      // Generate structured normalized coordinates centered around 0
      const val = Math.sin((frame / 30) * Math.PI * 2 + seed) * 0.5 + (Math.random() - 0.5) * 0.05;
      frameFeatures.push(val);
    }
    sequence.push(frameFeatures);
  }

  return sequence;
};

/**
 * Helper to capitalize glosses for user display.
 */
export const formatGlossText = (gloss: string): string => {
  if (!gloss) return '';
  return gloss
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};
