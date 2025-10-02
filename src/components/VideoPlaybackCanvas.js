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
  // Spotlight effect props
  spotlightMode,
  spotlightData,
}) => {
  const offsetX = useSharedValue(x);
  const offsetY = useSharedValue(y);
  const scale = useSharedValue(zoom);
  
  // Note: Using existing zoom logic instead of temporary zoom values
  // The zoom mode now works exactly like Marker tile Zoom option

  // Spotlight effect state - using React state instead of shared values to avoid Reanimated errors
  const [spotlightState, setSpotlightState] = useState({
    isActive: false,
    startTime: 0,
    duration: 0,
    marker: null,
    isPaused: false
  });

  // Spotlight detection using useEffect instead of useAnimatedReaction to avoid Reanimated errors
  // Spotlight effect implementation - TEMPORARILY DISABLED
  // TODO: Re-implement with safer approach to avoid Reanimated errors
  /*
  useEffect(() => {
    if (!spotlightData || !Array.isArray(spotlightData) || spotlightData.length === 0) {
      return;
    }

    const spotlight = spotlightData[0]; // Only support one spotlight for MVP
    if (!spotlight || typeof spotlight.timestamp !== 'number') {
      return;
    }

    const spotlightTime = spotlight.timestamp;
    const freezeDuration = spotlight.freezeDuration || 0.7;

    // Check if we're at the spotlight time
    const checkSpotlight = () => {
      const currentTimeValue = currentTime?.value || 0;
      const timeDiff = Math.abs(currentTimeValue - spotlightTime);
      const isAtSpotlightTime = timeDiff < 0.1; // 100ms tolerance

      if (isAtSpotlightTime && !spotlightState.isActive) {
        // Start spotlight
        setSpotlightState({
          isActive: true,
          startTime: spotlightTime,
          duration: freezeDuration,
          marker: {
            x: spotlight.x || 0,
            y: spotlight.y || 0,
            type: spotlight.markerType || 'circle'
          },
          isPaused: true
        });
        
        // Pause the video
        setPaused(true);
      }
    };

    // Check if spotlight should end
    const checkSpotlightEnd = () => {
      if (spotlightState.isActive) {
        const currentTimeValue = currentTime?.value || 0;
        const elapsed = currentTimeValue - spotlightState.startTime;
        if (elapsed >= spotlightState.duration) {
          // End spotlight
          setSpotlightState({
            isActive: false,
            startTime: 0,
            duration: 0,
            marker: null,
            isPaused: false
          });
          
          // Resume video playback
          setPaused(false);
        }
      }
    };

    // Set up interval to check spotlight timing
    const interval = setInterval(() => {
      checkSpotlight();
      checkSpotlightEnd();
    }, 50); // Check every 50ms

    return () => clearInterval(interval);
  }, [spotlightData, spotlightState.isActive, spotlightState.startTime, spotlightState.duration, currentTime, setPaused]);
  */

  // Effective paused state that includes spotlight freezing - TEMPORARILY DISABLED
  // const effectivePausedShared = useSharedValue(false);
  
  // Update effective paused state when paused or spotlight state changes - TEMPORARILY DISABLED
  /*
  useEffect(() => {
    const effectivePaused = paused || spotlightState.isActive;
    effectivePausedShared.value = effectivePaused;
  }, [paused, spotlightState.isActive]);
  */

  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const markerPanStartX = useSharedValue(0);
  const markerPanStartY = useSharedValue(0);

  const editingMode = useDerivedValue(() => {
    const isNotPreview = isPreview ? !isPreview.value : true;
    const hasKeyframes = keyframes ? Array.isArray(keyframes.value) : false;
    const keyframeCount = keyframes && keyframes.value ? keyframes.value.length : 0;
    const hasThreeKeyframes = keyframeCount === 3;
    const result = isNotPreview && hasKeyframes && hasThreeKeyframes;
    
    return result;
  });

  const initialized = useRef(false);
  const [gestureMode, setGestureMode] = useState('zoom');

  useAnimatedReaction(
    () => gestureModeShared ? gestureModeShared.value : null,
    (val) => {
      if (val && typeof val === 'string') {
        runOnJS(setGestureMode)(val);
      }
    },
    [gestureModeShared]
  );

  useEffect(() => {
    if (!isPreview && keyframes && Array.isArray(keyframes.value) && keyframes.value.length === 3) {
      offsetX.value = x;
      offsetY.value = y;
      scale.value = zoom;
      console.log('🟢 Updated values for clip:', { x, y, zoom });
    }
  }, [x, y, zoom, isPreview, keyframes]);

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
    const layout = videoLayout ? videoLayout.value : null;
    const naturalW = videoNaturalWidthShared ? videoNaturalWidthShared.value : null;
    const naturalH = videoNaturalHeightShared ? videoNaturalHeightShared.value : null;

    if (!layout || !naturalW || !naturalH || naturalW <= 0 || naturalH <= 0) {
      return {};
    }

    const { frameWidth, frameHeight } = layout;
    const fitScale = Math.max(frameWidth / naturalW, frameHeight / naturalH);

    let tx = 0, ty = 0, sc = 1;

    const isPreviewing = isPreview ? isPreview.value : false;
    const hasValidKeyframes = keyframes ? Array.isArray(keyframes.value) && keyframes.value.length >= 3 : false;

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

    const t = currentTime ? currentTime.value : 0;
    const interpolated = isPreviewing && hasValidKeyframes
      ? interpolateKeyframesSpline(keyframes.value, t)
      : null;

    // Track these always to ensure transform reactivity
    const txRaw = offsetX ? offsetX.value : 0;
    const tyRaw = offsetY ? offsetY.value : 0;
    const scRaw = scale ? scale.value : 1;

    if (interpolated) {
      tx = interpolated.x * fitScale;
      ty = interpolated.y * fitScale;
      sc = interpolated.scale;
    } else {
      tx = txRaw * fitScale;
      ty = tyRaw * fitScale;
      sc = scRaw;
    }

    // Note: Using existing zoom logic - no custom zoom mode adjustments needed
    // The zoom mode now works exactly like Marker tile Zoom option

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
    const layout = videoLayout ? videoLayout.value : null;
    const w = videoNaturalWidthShared ? videoNaturalWidthShared.value : null;
    const h = videoNaturalHeightShared ? videoNaturalHeightShared.value : null;

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

        {/* 🎯 Spotlight marker overlay (only during spotlight freeze) */}
        {/* Spotlight marker overlay - TEMPORARILY DISABLED */}
        {/*
        {spotlightState.isActive && spotlightState.marker && (
          <MarkerOverlay
            key="spotlight-marker"
            currentKeyframeIndex={{ value: 0 }}
            overlays={{
              value: [{
                timestamp: spotlightState.startTime,
                x: spotlightState.marker.x,
                y: spotlightState.marker.y,
                markerType: spotlightState.marker.type
              }]
            }}
            interpolate={false}
            currentTime={currentTime}
            videoLayout={videoLayout}
            videoNaturalWidthShared={videoNaturalWidthShared}
            videoNaturalHeightShared={videoNaturalHeightShared}
          />
        )}
        */}
      </Animated.View>
    </GestureDetector>
  );
};

export default VideoPlaybackCanvas;
