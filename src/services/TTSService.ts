import { NativeModules, NativeEventEmitter } from 'react-native';

const TTSManager = NativeModules.TTSManager;
const eventEmitter = new NativeEventEmitter(TTSManager);

class TTSService {
  private currentWordRangeCallback: ((start: number, end: number) => void) | null = null;
  private onDoneCallback: (() => void) | null = null;

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners() {
    eventEmitter.addListener('onTTSWordRange', (data: string) => {
      this.handleWordRange(data);
    });
    
    eventEmitter.addListener('onTTSDone', () => {
      this.handleDone();
    });
    
    eventEmitter.addListener('onTTSError', () => {
      this.handleDone();
    });
  }

  setRate = (rate: number) => {
    if (TTSManager && TTSManager.setRate) {
      TTSManager.setRate(rate);
    }
  };

  setPitch = (pitch: number) => {
    if (TTSManager && TTSManager.setPitch) {
      TTSManager.setPitch(pitch);
    }
  };

  speak = (text: string, onWordRange?: (start: number, end: number) => void, onDone?: () => void) => {
    if (!text || !TTSManager) return;

    this.stop();
    
    if (onWordRange) {
      this.currentWordRangeCallback = onWordRange;
    }
    
    if (onDone) {
      this.onDoneCallback = onDone;
    }

    TTSManager.speak(text);
  };

  stop = () => {
    if (TTSManager && TTSManager.stop) {
      TTSManager.stop();
    }
    this.resetCallbacks();
  };

  private handleWordRange = (data: string) => {
    if (!this.currentWordRangeCallback || !data) return;
    
    try {
      const range = JSON.parse(data);
      this.currentWordRangeCallback(range.start, range.end);
    } catch (error) {
      if (typeof data === 'string' && data.includes(',')) {
        const [start, end] = data.split(',').map(Number);
        this.currentWordRangeCallback(start, end);
      }
    }
  };

  private handleDone = () => {
    if (this.onDoneCallback) {
      this.onDoneCallback();
    }
    this.resetCallbacks();
  };

  private resetCallbacks = () => {
    this.currentWordRangeCallback = null;
    this.onDoneCallback = null;
  };
}

export default new TTSService();