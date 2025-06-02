import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useDerivedValue,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import Video from 'react-native-video';

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
}) => {
  const videoRef = useRef(null);

  // Shared values for gesture transforms
  const scale = useSharedValue(zoom);
  const translateX = useSharedValue(x);
  const translateY = useSharedValue(y);

  // Seek to correct timestamp once video is loaded
  const onVideoLoad = () => {
    if (videoRef.current && !isPreview && clip.timestamp != null) {
      videoRef.current.seek(clip.timestamp, 0);
    }
  };

  // Gesture for pan
  const panGesture = Gesture.Pan().onChange((e) => {
    translateX.value += e.changeX / videoLayout.frameWidth;
    translateY.value += e.changeY / videoLayout.frameHeight;
    runOnJS(onChange)({
      x: translateX.value,
      y: translateY.value,
      scale: scale.value,
    });
  });

  // Gesture for pinch (zoom)
  const pinchGesture = Gesture.Pinch().onChange((e) => {
    scale.value *= e.scale;
    runOnJS(onChange)({
      x: translateX.value,
      y: translateY.value,
      scale: scale.value,
    });
  });

  const composed = Gesture.Simultaneous(panGesture, pinchGesture);

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

  useEffect(() => {
    if (isPreview) {
      translateX.value = withTiming(x);
      translateY.value = withTiming(y);
      scale.value = withTiming(zoom);
    }
  }, [x, y, zoom, isPreview]);

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.frame, { width: videoLayout.frameWidth, height: videoLayout.frameHeight }]}>
        <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
          <Video
            key={!isPreview ? `${clip.uri}_${clip.timestamp}` : undefined} 
            ref={videoRef}
            source={{ uri: clip.uri }}
            style={styles.video}
            paused={paused}
            resizeMode="contain"
            onLoad={onVideoLoad}
            onProgress={({ currentTime }) => {
              if (isPreview && setPlaybackTime) {
                runOnJS(setPlaybackTime)(currentTime);
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
