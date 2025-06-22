import React, { useEffect, useRef, useState } from 'react';
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
import MarkerOverlay from './MarkerOverlay';

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
  overlays,
  gestureModeShared,
}) => {
  const offsetX = useSharedValue(x);
  const offsetY = useSharedValue(y);
  const scale = useSharedValue(zoom);

  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const markerPanStartX = useSharedValue(0);
  const markerPanStartY = useSharedValue(0);

  const editingMode = useDerivedValue(() => {
    console.log("!isPreview.value: ", !isPreview?.value,"Array.isArray(keyframes?.value): ",Array.isArray(keyframes?.value),"keyframes.value.length: ",keyframes?.value.length);
    return !isPreview.value && Array.isArray(keyframes?.value) && keyframes.value.length === 3;
  });

  const initialized = useRef(false);
  const [gestureMode, setGestureMode] = useState('zoom');

  useAnimatedReaction(
    () => gestureModeShared?.value,
    (val) => {
      if (val && typeof val === 'string') {
        runOnJS(setGestureMode)(val);
      }
    },
    [gestureModeShared]
  );

  useEffect(() => {
    if (!isPreview && Array.isArray(keyframes?.value) && keyframes.value.length === 3) {
      offsetX.value = x;
      offsetY.value = y;
      scale.value = zoom;
      console.log('🟢 Updated values for clip:', { x, y, zoom });
    }
  }, [x, y, zoom, isPreview, keyframes?.value]);

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
      console.log('👆 Pan - Pan gesture update');
      if (!editingMode.value) return;
      offsetX.value = panStartX.value + e.translationX;
      offsetY.value = panStartY.value + e.translationY;
      // console.log('🟠 Pan update tx:', offsetX.value, 'ty:', offsetY.value);
    });

  const pinch = Gesture.Pinch()
  .onUpdate((e) => {
    'worklet';
    console.log('👆 Pinch - Pan gesture update');
    if (!editingMode.value || !Number.isFinite(e.scale)) return;
    scale.value *= e.scale;
    // console.log('🔍 Zoom scale:', scale.value);
  });

  const markerDrag = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      const current = overlays?.value?.[currentKeyframeIndex?.value];
      if (current) {
        markerPanStartX.value = current.x;
        markerPanStartY.value = current.y;
      }
    })
    .onUpdate((e) => {
      'worklet';
      console.log('👆 markerDrag - Pan gesture update');
      if (
        gestureModeShared?.value === 'marker' &&
        overlays?.value?.[currentKeyframeIndex?.value]
      ) {
        overlays.value[currentKeyframeIndex.value].x = markerPanStartX.value + e.translationX;
        overlays.value[currentKeyframeIndex.value].y = markerPanStartY.value + e.translationY;
      }
  });

  const composedGesture = gestureMode === 'marker'
    ? markerDrag
    : Gesture.Simultaneous(pan, pinch);

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
      console.log("layout: ", layout, "naturalW: ", naturalW, "naturalH: ", naturalH);
      return {};
    }

    const { frameWidth, frameHeight } = layout;
    const fitScale = Math.max(frameWidth / naturalW, frameHeight / naturalH);

    let tx = 0, ty = 0, sc = 1;

    const isPreviewing = isPreview?.value;
    const hasValidKeyframes = Array.isArray(keyframes?.value) && keyframes.value.length >= 3;

    // 🛑 Fallback for non-smart-zoom clips (or bad data)
    if (isPreviewing && !hasValidKeyframes) {
      console.log("Fallback for non-smart-zoom clips - isPreviewing: ", isPreviewing, "hasValidKeyframes: ", hasValidKeyframes);

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

    const t = currentTime.value;
    const interpolated = isPreviewing && hasValidKeyframes
      ? interpolateKeyframesSpline(keyframes.value, t)
      : null;

    // Track these always to ensure transform reactivity
    const txRaw = offsetX.value;
    const tyRaw = offsetY.value;
    const scRaw = scale.value;

    if (interpolated) {
      tx = interpolated.x * fitScale;
      ty = interpolated.y * fitScale;
      sc = interpolated.scale;
    } else {
      tx = txRaw * fitScale;
      ty = tyRaw * fitScale;
      sc = scRaw;
    }

    console.log('🧪 Final transform:', {
      tx,
      ty,
      sc,
      naturalW,
      naturalH,
      frameWidth,
      frameHeight,
      mode: isPreviewing ? 'preview' : 'edit',
    });

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
      <Animated.View style={[StyleSheet.absoluteFill, transformStyle]}>
        <Video
          key={`canvas-${previewSessionId}`}
          ref={videoRef}
          source={{ uri: clip.uri }}
          paused={paused}
          onLoad={(meta) => { 
            videoNaturalWidthShared.value = meta.naturalSize.width;
            videoNaturalHeightShared.value = meta.naturalSize.height;

            if (onLoad) {
              runOnJS(onLoad)(meta); // safely call the passed-in onLoad from props
            }
          }}
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
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (videoLayout && 'value' in videoLayout) {
              videoLayout.value = {
                frameWidth: width,
                frameHeight: height,
              };
              console.log('📐 Measured layout:', width, height);
            }
          }}
        />

        {/* 🟢 Object Tracking Marker Overlays */}
        {Array.isArray(overlays?.value) && overlays.value.length > 0 && (
          <>
            {isPreview?.value ? (
              overlays.value.map((kf, i) => (
                <MarkerOverlay
                  key={`marker-preview-${i}`}
                  index={i}
                  overlays={overlays}
                  interpolate={true}
                  currentTime={currentTime}
                  videoLayout={videoLayout}
                  videoNaturalWidthShared={videoNaturalWidthShared}
                  videoNaturalHeightShared={videoNaturalHeightShared}
                  currentKeyframeIndex={currentKeyframeIndex}
                />
              ))
            ) : (
              Number.isInteger(currentKeyframeIndex?.value) &&
              overlays.value?.[currentKeyframeIndex.value] &&
              Number.isFinite(overlays.value[currentKeyframeIndex.value]?.timestamp) && (
                <MarkerOverlay
                  key={`marker-edit-${currentKeyframeIndex.value}`}
                  index={currentKeyframeIndex.value}
                  overlays={overlays}
                  interpolate={false}
                  currentTime={currentTime}
                  videoLayout={videoLayout}
                  videoNaturalWidthShared={videoNaturalWidthShared}
                  videoNaturalHeightShared={videoNaturalHeightShared}
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

export default VideoPlaybackCanvas;
