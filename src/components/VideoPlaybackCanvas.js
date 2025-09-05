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
    const isNotPreview = !isPreview?.value;
    const hasKeyframes = Array.isArray(keyframes?.value);
    const keyframeCount = keyframes?.value?.length || 0;
    const hasThreeKeyframes = keyframeCount === 3;
    const result = isNotPreview && hasKeyframes && hasThreeKeyframes;
    
    console.log("🔍 editingMode check:", {
      isNotPreview,
      hasKeyframes,
      keyframeCount,
      hasThreeKeyframes,
      result,
      keyframes: keyframes?.value
    });
    
    return result;
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
      console.log('🟢 Pan gesture began');
      panStartX.value = offsetX.value;
      panStartY.value = offsetY.value;
    })
    .onTouchesDown(() => {
      'worklet';
      console.log('👆 Pan touches down - Editing mode:', editingMode.value);
    })
    .onUpdate((e) => {
      'worklet';
      console.log('👆 Pan gesture update - Editing mode:', editingMode.value, 'Translation:', e.translationX, e.translationY);
      if (!editingMode.value) {
        console.log('❌ Pan gesture blocked - not in editing mode');
        return;
      }
      offsetX.value = panStartX.value + e.translationX;
      offsetY.value = panStartY.value + e.translationY;
      console.log('✅ Pan update applied - offsetX:', offsetX.value, 'offsetY:', offsetY.value);
    });

  const pinch = Gesture.Pinch()
  .onBegin(() => {
    'worklet';
    console.log('🔍 Pinch gesture began');
  })
  .onUpdate((e) => {
    'worklet';
    console.log('🔍 Pinch gesture update - Editing mode:', editingMode.value, 'Scale:', e.scale);
    if (!editingMode.value) {
      console.log('❌ Pinch gesture blocked - not in editing mode');
      return;
    }
    if (!Number.isFinite(e.scale)) {
      console.log('❌ Pinch gesture blocked - invalid scale:', e.scale);
      return;
    }
    scale.value *= e.scale;
    console.log('✅ Pinch update applied - new scale:', scale.value);
  });

  const markerDrag = Gesture.Pan()
  // 1) Remember the marker’s start position (natural-video space)
  .onBegin(() => {
    'worklet';
    const i = currentKeyframeIndex.value;
    const cur = overlays.value[i];

    markerPanStartX.value = Number.isFinite(cur?.x) ? cur.x : 100;
    markerPanStartY.value = Number.isFinite(cur?.y) ? cur.y : 300;
  })

  // 2) Convert drag delta & write back immutably
  .onUpdate((e) => {
    'worklet';
    if (gestureModeShared?.value !== 'marker') return;

    const layout = videoLayout.value;
    const w = videoNaturalWidthShared.value;
    const h = videoNaturalHeightShared.value;
    if (!layout || w === 0 || h === 0) return;

    // Same scale used in MarkerOverlay.js
    const fitScale = Math.max(
      layout.frameWidth  / w,
      layout.frameHeight / h
    );

    // ΔX / ΔY back to natural-video pixels
    const dxNat = e.translationX / fitScale;
    const dyNat = e.translationY / fitScale;

    const i = currentKeyframeIndex.value;
    const updated = {
      ...overlays.value[i],
      x: markerPanStartX.value + dxNat,
      y: markerPanStartY.value + dyNat,
    };

    // 🔄 Replace the whole array so Reanimated picks it up
    overlays.value = overlays.value.map((o, idx) =>
      idx === i ? updated : o
    );
  });

  const composedGesture = gestureMode === 'marker'
    ? markerDrag
    : Gesture.Simultaneous(pan, pinch);

  console.log('🎭 Current gesture mode:', gestureMode, 'gestureModeShared:', gestureModeShared?.value);

  useAnimatedReaction(
    () => {
      const isZoomMode =
        !gestureModeShared /* Smart Zoom */ ||
        gestureModeShared.value === 'zoom';
      if (
        !editingMode.value ||
        !isZoomMode ||
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
      const isZoomMode =
        !gestureModeShared || gestureModeShared.value === 'zoom';
      if (
        isZoomMode &&
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
    [editingMode, gestureModeShared]
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

  const [canRenderOverlay, setCanRenderOverlay] = useState(false);

  const layoutReady = useDerivedValue(() => {
    const layout = videoLayout?.value;
    const w = videoNaturalWidthShared?.value;
    const h = videoNaturalHeightShared?.value;

    return (
      layout &&
      Number.isFinite(layout.frameWidth) &&
      Number.isFinite(layout.frameHeight) &&
      w > 0 &&
      h > 0
    );
  });

  useAnimatedReaction(
    () => layoutReady.value,
    (ready, prev) => {
      if (ready && !prev) {
        runOnJS(setCanRenderOverlay)(true); // ✅ safe
      }
    },
    []
  );


  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[StyleSheet.absoluteFill, transformStyle]}>
        <Video
          key={`canvas-${previewSessionId}`}
          ref={videoRef}
          source={{ uri: clip.uri }}
          paused={paused}
          onLoad={(meta) => {
            'worklet';
            const w = meta?.naturalSize?.width  ?? 1;
            const h = meta?.naturalSize?.height ?? 1;

            videoNaturalWidthShared.value  = w;
            videoNaturalHeightShared.value = h;

            runOnJS(console.log)('🎞️ Video loaded (natural):', { w, h });

            if (onLoad) runOnJS(onLoad)(meta);
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
              videoLayout.value = { frameWidth: width, frameHeight: height };
              console.log('📐 Measured layout:', width, height);
            }
          }}
        />

        {/* 🟢 Object-tracking marker overlays */}
        {Array.isArray(overlays?.value) && overlays.value.length > 0 && (
          isPreview?.value ? (
            /* ----- Preview: every keyframe, each does its own interpolation ----- */
            overlays.value.map((_, i) => (
              <MarkerOverlay
                key={`marker-preview-${i}`}
                currentKeyframeIndex={{ value: i }}      // constant-like object
                overlays={overlays}
                interpolate={true}
                currentTime={currentTime}
                videoLayout={videoLayout}
                videoNaturalWidthShared={videoNaturalWidthShared}
                videoNaturalHeightShared={videoNaturalHeightShared}
              />
            ))
          ) : (
            /* ----- Edit: only the active keyframe ----- */
            <MarkerOverlay
              key="marker-edit"
              currentKeyframeIndex={currentKeyframeIndex}  // ← shared value (reactive)
              overlays={overlays}
              interpolate={false}
              currentTime={currentTime}
              videoLayout={videoLayout}
              videoNaturalWidthShared={videoNaturalWidthShared}
              videoNaturalHeightShared={videoNaturalHeightShared}
            />
          )
        )}
      </Animated.View>
    </GestureDetector>
  );
};

export default VideoPlaybackCanvas;
