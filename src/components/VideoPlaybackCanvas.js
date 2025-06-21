import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Image } from 'react-native';
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
import { MarkerOverlay } from './MarkerOverlay';

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
  gestureModeShared,
  overlays,
}) => {
  const offsetX = useSharedValue(x);
  const offsetY = useSharedValue(y);
  const scale = useSharedValue(zoom);

  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const editingMode = useDerivedValue(() => {
    return !isPreview?.value && Array.isArray(keyframes?.value) && keyframes.value.length === 3;
  });

  useEffect(() => {
    if (!isPreview?.value && Array.isArray(keyframes?.value) && keyframes.value.length === 3) {
      offsetX.value = x;
      offsetY.value = y;
      scale.value = zoom;
    }
  }, [x, y, zoom, isPreview, keyframes?.value]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      panStartX.value = offsetX.value;
      panStartY.value = offsetY.value;
    })
    .onUpdate((e) => {
      'worklet';
      offsetX.value = panStartX.value + e.translationX;
      offsetY.value = panStartY.value + e.translationY;

      if (
        gestureModeShared &&
        'value' in gestureModeShared &&
        gestureModeShared.value === 'marker' &&
        onChange &&
        currentKeyframeIndex &&
        'value' in currentKeyframeIndex &&
        typeof currentKeyframeIndex.value === 'number'
      ) {
        runOnJS(onChange)(
          { x: offsetX.value, y: offsetY.value },
          currentKeyframeIndex.value
        );
      }
    });

  const pinch = Gesture.Pinch().onUpdate((e) => {
    'worklet';
    if (!editingMode.value || !Number.isFinite(e.scale)) return;
    scale.value *= e.scale;
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
        index:
          currentKeyframeIndex &&
          'value' in currentKeyframeIndex &&
          typeof currentKeyframeIndex.value === 'number'
            ? currentKeyframeIndex.value
            : 0,
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
        editingMode.value &&
        Array.isArray(keyframes?.value) &&
        Number.isInteger(index) &&
        index >= 0 &&
        index < keyframes.value.length
      ) {
        const kf = keyframes.value[index];
        if (kf && Number.isFinite(kf.x) && Number.isFinite(kf.y)) {
          offsetX.value = kf.x;
          offsetY.value = kf.y;
          scale.value = Number.isFinite(kf.scale) ? kf.scale : 1;
        }
      }
    },
    [keyframes, currentKeyframeIndex, editingMode]
  );

  // const transformStyle = useAnimatedStyle(() => {
  //   const layout = videoLayout?.value;
  //   const naturalW = videoNaturalWidthShared?.value;
  //   const naturalH = videoNaturalHeightShared?.value;

  //   if (!layout || !naturalW || !naturalH || naturalW <= 0 || naturalH <= 0) {
  //     return {};
  //   }

  //   const { frameWidth, frameHeight } = layout;
  //   const fitScale = Math.max(frameWidth / naturalW, frameHeight / naturalH);

  //   let tx = 0, ty = 0, sc = 1;
  //   const t = currentTime.value;
  //   const isPreviewing = isPreview?.value;
  //   const hasValidKeyframes = Array.isArray(keyframes?.value) && keyframes.value.length >= 3;
  //   const isZoomKeyframe = keyframes?.value?.[0]?.scale != null;

  //   if (isPreviewing) {
  //     if (hasValidKeyframes && isZoomKeyframe) {
  //       const interpolated = interpolateKeyframesSpline(keyframes?.value ?? [], t);
  //       if (interpolated && Number.isFinite(interpolated.scale)) {
  //         tx = interpolated.x * fitScale;
  //         ty = interpolated.y * fitScale;
  //         sc = interpolated.scale;
  //       }
  //     } else {
  //       // Smart Tracking: no transform, no spline
  //       tx = 0;
  //       ty = 0;
  //       sc = 1;
  //     }
  //   } else {
  //     // Editing mode (Smart Zoom or Tracking)
  //     tx = offsetX.value * fitScale;
  //     ty = offsetY.value * fitScale;
  //     sc = Number.isFinite(scale.value) ? scale.value : 1;
  //   }

  //   return {
  //     transform: [
  //       { translateX: -tx },
  //       { translateY: -ty },
  //       { scale: sc },
  //     ],
  //     width: naturalW * fitScale,
  //     height: naturalH * fitScale,
  //   };
  // });

  // const transformStyle = useAnimatedStyle(() => {
  //   const layout = videoLayout?.value;
  //   const naturalW = videoNaturalWidthShared?.value;
  //   const naturalH = videoNaturalHeightShared?.value;

  //   if (!layout || !naturalW || !naturalH || naturalW <= 0 || naturalH <= 0) {
  //     console.warn('⚠️ Missing or invalid layout or natural size', {
  //       layout,
  //       naturalW,
  //       naturalH,
  //     });
  //     return {};
  //   }

  //   const { frameWidth, frameHeight } = layout;
  //   const fitScale = Math.max(frameWidth / naturalW, frameHeight / naturalH);

  //   let tx = 0, ty = 0, sc = 1;
  //   const t = currentTime.value;
  //   const isPreviewing = isPreview?.value;
  //   const hasValidKeyframes = Array.isArray(keyframes?.value) && keyframes.value.length >= 3;
  //   const isZoomKeyframe = keyframes?.value?.[0]?.scale != null;

  //   // if (isPreviewing) {
  //   //   if (hasValidKeyframes && isZoomKeyframe) {
  //   //     const interpolated = interpolateKeyframesSpline(keyframes?.value ?? [], t);
  //   //     if (interpolated && Number.isFinite(interpolated.scale)) {
  //   //       tx = interpolated.x * fitScale;
  //   //       ty = interpolated.y * fitScale;
  //   //       sc = interpolated.scale;
  //   //     } else {
  //   //       console.warn('⚠️ Invalid interpolated zoom transform:', interpolated);
  //   //     }
  //   //   } else {
  //   //     // Smart Tracking mode: no zoom transforms applied
  //   //     tx = 0;
  //   //     ty = 0;
  //   //     sc = 1;
  //   //   }
  //   // } else {
  //   //   // Editing mode (Smart Zoom or Tracking)
  //   //   tx = offsetX.value * fitScale;
  //   //   ty = offsetY.value * fitScale;
  //   //   sc = Number.isFinite(scale.value) ? scale.value : 1;
  //   // }

  //   // console.warn('📸 transformStyle', {
  //   //   isPreviewing,
  //   //   t,
  //   //   tx,
  //   //   ty,
  //   //   sc,
  //   //   fitScale,
  //   //   layout,
  //   //   naturalW,
  //   //   naturalH,
  //   // });

  //   if (isPreviewing) {
  //     const keyframeList = keyframes?.value ?? [];
  //     const isZoomKeyframe = keyframeList?.[0]?.scale != null;

  //     if (hasValidKeyframes && isZoomKeyframe) {
  //       const interpolated = interpolateKeyframesSpline(keyframeList, t);

  //       if (
  //         interpolated &&
  //         Number.isFinite(interpolated.x) &&
  //         Number.isFinite(interpolated.y) &&
  //         Number.isFinite(interpolated.scale)
  //       ) {
  //         tx = interpolated.x * fitScale;
  //         ty = interpolated.y * fitScale;
  //         sc = interpolated.scale;
  //       } else {
  //         console.warn('⚠️ Invalid interpolated values for Smart Zoom:', interpolated);
  //         tx = 0;
  //         ty = 0;
  //         sc = 1;
  //       }
  //     } else {
  //       // Smart Tracking or no-op: don't apply transform
  //       tx = 0;
  //       ty = 0;
  //       sc = 1;
  //     }

  //     console.warn('📸 transformStyle', {
  //       isPreviewing,
  //       t,
  //       tx,
  //       ty,
  //       sc,
  //       fitScale,
  //       layout,
  //       naturalW,
  //       naturalH,
  //       keyframes: keyframeList,
  //       isZoomKeyframe,
  //     });
  //   }

  //   return {
  //     transform: [
  //       { translateX: -tx },
  //       { translateY: -ty },
  //       { scale: sc },
  //     ],
  //     width: naturalW * fitScale,
  //     height: naturalH * fitScale,
  //   };
  // });

  const transformStyle = useAnimatedStyle(() => {
    const layout = videoLayout?.value;
    const naturalW = videoNaturalWidthShared?.value;
    const naturalH = videoNaturalHeightShared?.value;

    if (!layout || !naturalW || !naturalH || naturalW <= 0 || naturalH <= 0) {
      console.warn('⚠️ Missing or invalid layout or natural size', { layout, naturalW, naturalH });
      return {};
    }

    const { frameWidth, frameHeight } = layout;
    const fitScale = Math.max(frameWidth / naturalW, frameHeight / naturalH);

    let tx = 0, ty = 0, sc = 1;
    const t = currentTime.value;
    const isPreviewing = isPreview?.value;
    const hasValidKeyframes = Array.isArray(keyframes?.value) && keyframes.value.length >= 3;
    const isZoomKeyframe = keyframes?.value?.[0]?.scale != null;

    if (isPreviewing) {
      if (hasValidKeyframes && isZoomKeyframe) {
        // Smart Zoom playback
        const interpolated = interpolateKeyframesSpline(keyframes?.value ?? [], t);
        if (interpolated && Number.isFinite(interpolated.scale)) {
          tx = interpolated.x * fitScale;
          ty = interpolated.y * fitScale;
          sc = Math.max(1, Math.min(interpolated.scale, 10));
        } else {
          console.warn('⚠️ Invalid interpolated Smart Zoom:', interpolated);
        }
      } else {
        // Smart Tracking playback — no transform
        tx = 0;
        ty = 0;
        sc = 1;
      }
    } else {
      // Editing mode (Smart Zoom drag/zoom or Smart Tracking marker placement)
      tx = offsetX.value * fitScale;
      ty = offsetY.value * fitScale;
      sc = Math.max(1, Math.min(Number.isFinite(scale.value) ? scale.value : 1, 10));
    }

    return {
      transform: [
        { translateX: -tx },
        { translateY: -ty },
        { scale: sc },
      ],
      width: naturalW * fitScale,
      height: naturalH * fitScale,
    };
  });

  console.log('🧩 VideoPlaybackCanvas rendering with context:', {
    isPreview: isPreview?.value,
    currentTime: currentTime?.value,
    paused,
    currentKeyframeIndex: currentKeyframeIndex?.value,
    overlays: overlays?.value,
    layout: videoLayout?.value,
    naturalSize: {
      w: videoNaturalWidthShared?.value,
      h: videoNaturalHeightShared?.value,
    },
  });

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[StyleSheet.absoluteFill, transformStyle]}>
        <Video
          key={`canvas-${previewSessionId}`}
          ref={videoRef}
          source={{ uri: clip.uri }}
          paused={paused}
          onLoad={(data) => {
            const naturalSize = data?.naturalSize;
            const w = naturalSize?.width;
            const h = naturalSize?.height;

            if (w && h) {
              videoNaturalWidthShared.value = w;
              videoNaturalHeightShared.value = h;
              console.log('✅ Set video natural size early:', { w, h });
            } else {
              console.warn('⚠️ Invalid naturalSize', naturalSize);
            }

            if (typeof onLoad === 'function') {
              console.log('🧪 Calling parent onLoad');
              onLoad(data);
            }

            if (Number.isFinite(currentTime?.value)) {
              console.log('⏮ Force seek to', currentTime.value);
              videoRef.current?.seek(currentTime.value);
            }
          }}
          onEnd={onEnd}
          resizeMode={resizeMode}
          style={{ width: '100%', height: '100%' }}
          repeat
          onProgress={({ currentTime: time }) => {
            console.log('⏱ onProgress', time);
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

        {/* Marker Overlays */}
        {Array.isArray(overlays?.value) && overlays.value.length > 0 && (
          <>
            {isPreview?.value ? (
              overlays.value.map((kf, i) => {
                if (!Number.isFinite(kf.timestamp)) {
                  console.warn(`⚠️ Skipping keyframe ${i}: invalid timestamp`, kf);
                  return null;
                }

                console.log(`🎯 Rendering preview marker for frame ${i}`, kf);

                return (
                  <MarkerOverlay
                    key={`marker-preview-${i}`}
                    index={i}
                    overlays={overlays}
                    interpolate={true}
                    videoLayout={videoLayout}
                    videoNaturalWidthShared={videoNaturalWidthShared}
                    videoNaturalHeightShared={videoNaturalHeightShared}
                    currentTime={currentTime}
                    currentKeyframeIndex={currentKeyframeIndex}
                  />
                );
              })
            ) : (
              Number.isInteger(currentKeyframeIndex?.value) &&
              overlays.value?.[currentKeyframeIndex.value] &&
              Number.isFinite(overlays.value[currentKeyframeIndex.value]?.timestamp) && (
                <MarkerOverlay
                  key={`marker-edit-${currentKeyframeIndex.value}`}
                  index={currentKeyframeIndex.value}
                  overlays={overlays}
                  interpolate={false}
                  videoLayout={videoLayout}
                  videoNaturalWidthShared={videoNaturalWidthShared}
                  videoNaturalHeightShared={videoNaturalHeightShared}
                  currentTime={currentTime}
                  currentKeyframeIndex={currentKeyframeIndex}
                />
              )
            )}
          </>
        )}
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  circle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'red',
    backgroundColor: 'rgba(255,0,0,0.3)',
  },
  emoji: {
    fontSize: 24,
    textAlign: 'center',
  },
  gif: {
    width: 30,
    height: 30,
  },
});

export default VideoPlaybackCanvas;
