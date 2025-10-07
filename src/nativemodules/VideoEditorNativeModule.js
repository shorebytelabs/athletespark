import { NativeModules, Platform } from 'react-native';

const { VideoEditor } = NativeModules;

const VideoEditorNativeModule = {
  process: (options) => {
    if (Platform.OS === 'ios') {
      return VideoEditor.processVideo(options);
    } else {
      return VideoEditor.process(options);
    }
  },

  trim: (options) => {
    if (Platform.OS === 'ios') {
      return VideoEditor.processVideo(options);
    } else {
      return VideoEditor.process(options);
    }
  },

  exportMergedVideo: (options) => {
    if (Platform.OS === 'ios') {
      return VideoEditor.processVideo(options);
    } else {
      return VideoEditor.process(options);
    }
  },

  saveToCameraRoll: (videoPath) => VideoEditor.saveToCameraRoll(videoPath),

  smartZoom: (options) => {
    if (Platform.OS === 'ios') {
      return VideoEditor.processVideo(options);
    } else {
      return VideoEditor.process(options);
    }
  },
};

export default VideoEditorNativeModule;
