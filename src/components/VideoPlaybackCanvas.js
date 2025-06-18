import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Video from 'react-native-video';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  useDerivedValue,
  runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { interpolateKeyframesSpline } from '../utils/interpolateKeyframesSpline';

const VideoPlaybackCanvas = ({
  clip,
  zoom,
  x,
  y,
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
  onChange,
  currentKeyframeIndex,
  setPaused,
  previewSessionId,
  resizeMode,
  videoNaturalWidthShared,
  videoNaturalHeightShared,
}) => {
  const offsetX = useSharedValue(x);
  const offsetY = useSharedValue(y);
  const scale = useSharedValue(zoom);

  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const editingMode = useDerivedValue(() => {
    return !isPreview.value && Array.isArray(keyframes?.value) && keyframes.value.length === 3;
  });

  const initialized = useRef(false);

  useEffect(() => {
    if (!isPreview && Array.isArray(keyframes?.value) && keyframes.value.length === 3) {
      offsetX.value = x;
      offsetY.value = y;
      scale.value = zoom;
      console.log('🟢 Updated values for clip:', { x, y, zoom });
    }
  }, [x, y, zoom, isPreview, keyframes.value]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      panStartX.value = offsetX.value;
      panStartY.value = offsetY.value;
    })
    .onTouchesDown(() => {
      'worklet';
      console.log('👆 Pan activated');
      console.log('Pan Editing mode:', editingMode.value);
    })
    .onUpdate((e) => {
      'worklet';
      if (!editingMode.value) return;
      offsetX.value = panStartX.value + e.translationX;
      offsetY.value = panStartY.value + e.translationY;
      // console.log('🟠 Pan update tx:', offsetX.value, 'ty:', offsetY.value);
    });

  const pinch = Gesture.Pinch().onUpdate((e) => {
    'worklet';
    if (!editingMode.value || !Number.isFinite(e.scale)) return;
    scale.value *= e.scale;
    // console.log('🔍 Zoom scale:', scale.value);
  });

  const composedGesture = Gesture.Simultaneous(pan, pinch);

  useAnimatedReaction(
    () => {
      if (
        !editingMode.value ||
        !currentKeyframeIndex ||
        !('value' in currentKeyframeIndex)
      ) {
        return null;
      }

      return {
        x: offsetX.value,
        y: offsetY.value,
        scale: scale.value,
        index: currentKeyframeIndex.value,
      };
    },
    (val) => {
      if (
        val &&
        onChange &&
        Number.isFinite(val.scale) &&
        Number.isFinite(val.x) &&
        Number.isFinite(val.y) &&
        Number.isInteger(val.index)
      ) {
        runOnJS(onChange)(
          { x: val.x, y: val.y, scale: val.scale },
          val.index
        );
      }
    },
    [editingMode]
  );

  useAnimatedReaction(
    () => currentKeyframeIndex?.value,
    (index) => {
      if ( 
        !isPreview.value &&
        Array.isArray(keyframes?.value) &&
        keyframes.value[index]
      ) {
        const kf = keyframes.value[index];
        if (
          Number.isFinite(kf.x) &&
          Number.isFinite(kf.y) &&
          Number.isFinite(kf.scale)
        ) {
          offsetX.value = kf.x;
          offsetY.value = kf.y;
          scale.value = kf.scale;
        }
      }
    },
    [keyframes, currentKeyframeIndex, isPreview]
  );

  const transformStyle = useAnimatedStyle(() => {
    const layout = videoLayout?.value;
    const naturalW = videoNaturalWidthShared?.value;
    const naturalH = videoNaturalHeightShared?.value;

    if (!layout || !naturalW || !naturalH || naturalW <= 0 || naturalH <= 0) {
      return {};
    }

    const { frameWidth, frameHeight } = layout;
    const fitScale = Math.max(frameWidth / naturalW, frameHeight / naturalH);

    let tx = 0, ty = 0, sc = 1;

    const isPreviewing = isPreview?.value;
    const hasValidKeyframes = Array.isArray(keyframes?.value) && keyframes.value.length >= 3;

    // 🛑 Fallback for non-smart-zoom clips (or bad data)
    if (isPreviewing && !hasValidKeyframes) {
      return {
        transform: [
          { translateX: 0 },
          { translateY: 0 },
          { scale: 1 },
        ],
        width: frameWidth,
        height: frameHeight,
      };
    }

    if (isPreviewing && hasValidKeyframes) {
      const t = currentTime.value;
      const interpolated = interpolateKeyframesSpline(keyframes.value, t);

      //console.log('🎯 Smart Zoom Preview @', t, interpolated);

      if (interpolated) {
        tx = interpolated.x * fitScale;
        ty = interpolated.y * fitScale;
        sc = interpolated.scale;
      }
    } else {
      // gesture editing mode
      tx = offsetX.value * fitScale;
      ty = offsetY.value * fitScale;
      sc = scale.value;
    }

    // console.log('🧪 transformStyle ctx:', {
    //   isPreviewing,
    //   hasValidKeyframes,
    //   currentTime: currentTime.value,
    //   keyframes: keyframes?.value,
    // });

    return {
      transform: [
        { translateX: -tx },
        { translateY: -ty },
        { scale: Number.isFinite(sc) ? sc : 1 },
      ],
      width: naturalW * fitScale,
      height: naturalH * fitScale,
    };
  });

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          transformStyle,
        ]}
      >
        <Video
          key={`canvas-${previewSessionId}`} 
          ref={videoRef}
          source={{ uri: clip.uri }}
          paused={paused}
          onLoad={onLoad}
          onEnd={onEnd}
          resizeMode={resizeMode}
          style={{ width: '100%', height: '100%' }}
          repeat
          onProgress={({ currentTime: time }) => {
            if (time >= trimEnd) {
              setPaused(true);
              currentTime.value = trimEnd;
              setPlaybackTime(trimEnd);
              videoRef.current?.seek(trimEnd);
            } else {
              currentTime.value = time;
              setPlaybackTime(time);
            }
          }}
        />
      </Animated.View>
    </GestureDetector>
  );
};

export default VideoPlaybackCanvas;
