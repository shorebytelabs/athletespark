import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useDerivedValue,
  runOnJS,
} from 'react-native-reanimated';
import Video from 'react-native-video';
import interpolateKeyframes from '../utils/interpolateKeyframes';

const SmartZoomCanvas = ({
  clip,
  zoom,
  x,
  y,
  videoLayout,
  onChange,
  paused,
  setPlaybackTime,
  isPreview,
  videoRef,
  onEnd,
  trimStart,
  trimEnd,
  playbackTime,
  keyframes,
}) => {
  const scale = useSharedValue(zoom);
  const translateX = useSharedValue(x);
  const translateY = useSharedValue(y);

  // Seek to correct timestamp once video is loaded
  const onVideoLoad = () => {
    if (!videoRef.current) return;

    if (isPreview) {
      videoRef.current.seek(trimStart ?? 0, 0);
    } else if (clip.timestamp != null) {
      videoRef.current.seek(clip.timestamp, 0);
    }
  };

  // Gestures
  const panGesture = Gesture.Pan().onChange((e) => {
    translateX.value += e.changeX / videoLayout.frameWidth;
    translateY.value += e.changeY / videoLayout.frameHeight;
    runOnJS(onChange)({
      x: translateX.value,
      y: translateY.value,
      scale: scale.value,
    });
  });

  const pinchGesture = Gesture.Pinch().onChange((e) => {
    scale.value *= e.scale;
    runOnJS(onChange)({
      x: translateX.value,
      y: translateY.value,
      scale: scale.value,
    });
  });

  const composed = Gesture.Simultaneous(panGesture, pinchGesture);

  // 🔄 Frame-synced zoom and pan interpolation
  useEffect(() => {
    if (isPreview) {
      scale.value = zoom;
      translateX.value = x;
      translateY.value = y;
    }
  }, [x, y, zoom, isPreview]);

  const animatedStyle = useAnimatedStyle(() => {
    const translateXPx = translateX.value * videoLayout.frameWidth;
    const translateYPx = translateY.value * videoLayout.frameHeight;
    return {
      transform: [
        { translateX: translateXPx },
        { translateY: translateYPx },
        { scale: scale.value },
      ],
    };
  });

  // Set initial shared values when not previewing
  useEffect(() => {
    if (!isPreview) {
      scale.value = zoom;
      translateX.value = x;
      translateY.value = y;
    }
  }, [x, y, zoom, isPreview]);

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.frame, { width: videoLayout.frameWidth, height: videoLayout.frameHeight }]}>
        <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
          <Video
            key={!isPreview ? `${clip.uri}_${clip.timestamp}` : undefined}
            ref={videoRef}
            onEnd={onEnd}
            source={{ uri: clip.uri }}
            style={styles.video}
            paused={paused}
            resizeMode="contain"
            onLoad={onVideoLoad}
            onProgress={({ currentTime }) => {
              if (isPreview) {
                if (currentTime >= trimEnd) {
                  videoRef.current?.seek(trimStart);
                } else {
                  runOnJS(setPlaybackTime)(currentTime);
                }
              }
            }}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    alignSelf: 'center',
    backgroundColor: 'black',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});

export default SmartZoomCanvas;
