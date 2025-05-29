import { NativeModules } from 'react-native';

const { VideoEditor } = NativeModules;

const VideoEditorNativeModule = {
  process: (options) => VideoEditor.processVideo(options),

  trim: (options) => VideoEditor.processVideo(options),

  exportMergedVideo: (options) => VideoEditor.processVideo(options),

  saveToCameraRoll: (videoPath) => VideoEditor.saveToCameraRoll(videoPath),

  smartZoom: (options) => VideoEditor.processVideo(options),
};

export default VideoEditorNativeModule;
