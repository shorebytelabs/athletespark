// SmartZoomCanvas.js
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
  useDerivedValue,
} from 'react-native-reanimated';
import Video from 'react-native-video';
import { interpolateAtTime } from '../utils/interpolateAtTime';

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
  keyframes,
  denseKeyframes,
  currentTime,
}) => {
  const scale = useSharedValue(zoom);
  const translateX = useSharedValue(x);
  const translateY = useSharedValue(y);

  const interpolatedTransform = useDerivedValue(() => {
    'worklet';
    if (!denseKeyframes?.value || typeof currentTime?.value !== 'number') {
      return { x: 0, y: 0, scale: 1 };
    }
    return interpolateAtTime(denseKeyframes.value, currentTime.value);
  });

  const onVideoLoad = () => {
    if (!videoRef.current) return;
    if (isPreview) {
      videoRef.current.seek(trimStart ?? 0, 0);
    } else if (clip.timestamp != null) {
      videoRef.current.seek(clip.timestamp, 0);
    }
  };

  const panGesture = Gesture.Pan().onChange((e) => {
    if (isPreview) return;
    translateX.value += e.changeX / videoLayout.frameWidth;
    translateY.value += e.changeY / videoLayout.frameHeight;
    runOnJS(onChange)({
      x: translateX.value,
      y: translateY.value,
      scale: scale.value,
    });
  });

  const pinchGesture = Gesture.Pinch().onChange((e) => {
    if (isPreview) return;
    scale.value *= e.scale;
    runOnJS(onChange)({
      x: translateX.value,
      y: translateY.value,
      scale: scale.value,
    });
  });

  const composed = Gesture.Simultaneous(panGesture, pinchGesture);

  useEffect(() => {
    scale.value = zoom;
    translateX.value = x;
    translateY.value = y;
  }, [x, y, zoom, isPreview]);

  const animatedStyle = useAnimatedStyle(() => {
    if (isPreview && denseKeyframes?.value && typeof currentTime?.value === 'number') {
      const t = interpolatedTransform.value;
      return {
        transform: [
          { translateX: t.x * videoLayout.frameWidth },
          { translateY: t.y * videoLayout.frameHeight },
          { scale: t.scale },
        ],
      };
    }
    return {
      transform: [
        { translateX: translateX.value * videoLayout.frameWidth },
        { translateY: translateY.value * videoLayout.frameHeight },
        { scale: scale.value },
      ],
    };
  });

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
            onProgress={({ currentTime: t }) => {
              if (isPreview) {
                if (t >= trimEnd) {
                  videoRef.current?.seek(trimStart);
                } else {
                  runOnJS(setPlaybackTime)(t);
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
