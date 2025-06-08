import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Video from 'react-native-video';
import { interpolateKeyframesSpline } from '../utils/interpolateKeyframesSpline';

const SmartZoomCanvas = ({
  clip,
  zoom,
  x,
  y,
  onChange,
  videoLayout,
  paused,
  isPreview,
  setPlaybackTime,
  videoRef,
  onEnd,
  trimStart,
  trimEnd,
  keyframes,
  currentTime,
  onLoad,
}) => {
  const translateX = useSharedValue(x || 0);
  const translateY = useSharedValue(y || 0);
  const scale = useSharedValue(zoom || 1.5);

  useEffect(() => {
    translateX.value = x ?? 0;
    translateY.value = y ?? 0;
    scale.value = zoom ?? 1.5;
  }, [x, y, zoom]);

  const preview = useDerivedValue(() => {
    return typeof isPreview === 'boolean' ? isPreview : false;
  });

  const panGesture = Gesture.Pan().onChange((e) => {
    if (preview.value) return;
    translateX.value += e.changeX / videoLayout.frameWidth;
    translateY.value += e.changeY / videoLayout.frameHeight;
    runOnJS(onChange)({ x: translateX.value, y: translateY.value, scale: scale.value });
  });

  const pinchGesture = Gesture.Pinch().onChange((e) => {
    if (preview.value) return;
    scale.value *= e.scaleChange;
    runOnJS(onChange)({ x: translateX.value, y: translateY.value, scale: scale.value });
  });

  const gesture = Gesture.Simultaneous(panGesture, pinchGesture);

  const animatedStyle = useAnimatedStyle(() => {
    let transformX = translateX.value;
    let transformY = translateY.value;
    let zoomValue = scale.value;

    if (
      preview.value &&
      Array.isArray(keyframes?.value) &&
      keyframes.value.length >= 2 &&
      typeof currentTime?.value === 'number'
    ) {
      const interpolated = interpolateKeyframesSpline(
        keyframes.value,
        currentTime.value
      );
      transformX = interpolated.x;
      transformY = interpolated.y;
      zoomValue = interpolated.scale;
    }

    const valid =
      Number.isFinite(transformX) &&
      Number.isFinite(transformY) &&
      Number.isFinite(zoomValue);

    if (!valid) {
      console.warn('⚠️ Invalid transform values, skipping render');
      return { transform: [] };
    }

    const translateXpx = transformX * videoLayout.frameWidth;
    const translateYpx = transformY * videoLayout.frameHeight;

    return {
      transform: [
        { scale: zoomValue },
        { translateX: -translateXpx },
        { translateY: -translateYpx },
      ],
    };
  });

  const handleProgress = (e) => {
    const ts = e?.currentTime ?? 0;

    if (preview.value) {
      if (ts < trimStart) {
        videoRef.current?.seek(trimStart);
        return;
      }
      if (ts > trimEnd) {
        videoRef.current?.seek(trimEnd);
        runOnJS(onEnd)();
        return;
      }

      currentTime.value = ts;
      runOnJS(setPlaybackTime)(ts);
    }
  };

  const handleLoad = () => {
    console.log('🎥 Video loaded, setting initial playback time:', trimStart, 'preview:', preview.value);
    if (typeof onLoad === 'function') {
      runOnJS(onLoad)();
    }
  };

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <Video
          ref={videoRef}
          source={{ uri: clip.uri }}
          resizeMode="contain"
          style={StyleSheet.absoluteFill}
          paused={paused}
          onEnd={onEnd}
          onProgress={handleProgress}
          onLoad={handleLoad}
          repeat
        />
      </Animated.View>
    </GestureDetector>
  );
};

export default SmartZoomCanvas;
