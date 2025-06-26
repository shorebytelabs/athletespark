// /src/components/SmartTrackingEditor.js

import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import VideoPlaybackCanvas from './VideoPlaybackCanvas';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { runOnUI } from 'react-native-reanimated';
import { useRoute } from '@react-navigation/native';

const SmartTrackingEditor = ({
  clip,
  trimStart,
  trimEnd,
  aspectRatio,
  smartZoomKeyframes,
  markerKeyframes,
  onFinish,
}) => {
  const videoRef = useRef(null);
  const route = useRoute();

  // Shared values for interaction
  const currentTime = useSharedValue(trimStart);
  const currentKeyframeIndex = useSharedValue(0);
  const isPreview = useSharedValue(route.params?.startInEdit ? false : true);
  const paused = useSharedValue(true);
  const videoLayout = useSharedValue(null);
  const gestureModeShared = useSharedValue('marker');
  const videoNaturalWidthShared = useSharedValue(0);
  const videoNaturalHeightShared = useSharedValue(0);
  const OUTPUT_ASPECT_RATIO = aspectRatio?.ratio ?? 9 / 16;

  /* ------------------------------------------------------------- */
  /* 1️⃣  Create overlays shared value *with* the incoming keyframes */
  /* ------------------------------------------------------------- */
  const overlays = useSharedValue(
    Array.isArray(markerKeyframes) && markerKeyframes.length
        ? markerKeyframes.map(kf => ({ ...kf }))          // fresh copy
        : [{ timestamp: trimStart, x: 100, y: 300, markerType: 'circle' }]
  );

  /* ---------------------------------------------------------------- */
  /* 2️⃣  Keep overlays/currentTime in-sync when markerKeyframes change */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!Array.isArray(markerKeyframes) || markerKeyframes.length === 0) return;

    runOnUI((_newKfs) => {
        overlays.value             = _newKfs;            // new shareable reference
        currentKeyframeIndex.value = 0;
        currentTime.value          = _newKfs[0].timestamp ?? trimStart;
    })(markerKeyframes.map(kf => ({ ...kf })));         // <- pass plain data

    requestAnimationFrame(() => {
        videoRef.current?.seek?.(markerKeyframes[0].timestamp ?? 0);
    });
    }, [markerKeyframes]);

  const zoomKeyframesShared = useSharedValue(
    Array.isArray(smartZoomKeyframes)
        ? smartZoomKeyframes
        : [
            { x: 0, y: 0, scale: 1, timestamp: trimStart },
            { x: 0, y: 0, scale: 1, timestamp: (trimStart + trimEnd) / 2 },
            { x: 0, y: 0, scale: 1, timestamp: trimEnd },
        ]
  );

  // Called when a marker is dragged/updated
  const handleOverlayChange = (updated, index) => {
    const keyframes = [...(overlays.value || [])];
    keyframes[index] = { ...keyframes[index], ...updated };
    overlays.value = keyframes;
  };

  // Add a keyframe at currentTime
  const handleAddKeyframe = () => {
    const timestamp = currentTime.value;
    const keyframes = [...(overlays.value || [])];

    const newKeyframe = {
      timestamp,
      x: 0,
      y: 0,
      markerType: 'circle', // default marker
    };

    keyframes.push(newKeyframe);
    keyframes.sort((a, b) => a.timestamp - b.timestamp);
    overlays.value = keyframes;
    currentKeyframeIndex.value = keyframes.findIndex(kf => kf.timestamp === timestamp);
  };

  const handlePlayPreview = () => {
    if (!paused.value) {
      paused.value = true;
      isPreview.value = false;
      return;
    }

    isPreview.value = true;
    paused.value = false;

    videoRef.current?.seek?.(trimStart);
    currentTime.value = trimStart;
  };

  const handlePrevKeyframe = () => {
    const index = currentKeyframeIndex.value;
    if (index > 0) {
      currentKeyframeIndex.value = index - 1;
      currentTime.value = overlays.value?.[index - 1]?.timestamp ?? trimStart;
      videoRef.current?.seek(currentTime.value);
    }
  };

  const handleNextKeyframe = () => {
    const index = currentKeyframeIndex.value;
    if (index < overlays.value.length - 1) {
      currentKeyframeIndex.value = index + 1;
      currentTime.value = overlays.value?.[index + 1]?.timestamp ?? trimStart;
      videoRef.current?.seek(currentTime.value);
    }
  };

   const handleSelectMarkerType = (type) => {
    const index = currentKeyframeIndex?.value ?? 0;
    const timestamp = Number.isFinite(currentTime?.value) ? currentTime.value : (trimStart ?? 0);

    const prev = Array.isArray(overlays.value) ? [...overlays.value] : [];
    const existing = prev[index] ?? {};

    const layout = videoLayout?.value;
    const naturalW = videoNaturalWidthShared?.value ?? 1920;
    const naturalH = videoNaturalHeightShared?.value ?? 1080;

    const frameW = layout?.frameWidth ?? 360;
    const frameH = layout?.frameHeight ?? 640;
    const fitScale = Math.max(frameW / naturalW, frameH / naturalH);

    const centerX = (frameW / 2) / fitScale;
    const centerY = (frameH / 2) / fitScale;

    const updated = {
        timestamp: existing.timestamp ?? timestamp,
        x: Number.isFinite(existing.x) ? existing.x : centerX,
        y: Number.isFinite(existing.y) ? existing.y : centerY,
        scale: Number.isFinite(existing.scale) ? existing.scale : 1,
        markerType: type,
    };

    const next = [...prev];
    next[index] = updated;

    console.log("🧠 [handleSelectMarkerType] currentKeyframeIndex:", index);
    console.log("🧠 [handleSelectMarkerType] updated:", updated);
    console.log("🧠 [handleSelectMarkerType] full next:", JSON.stringify(next));

    overlays.value = [...next]; // ensure new reference triggers re-render
    currentKeyframeIndex.value = index;

    setTimeout(() => {
        console.log("🔍 Post-assignment overlays.value:", JSON.stringify(overlays.value));
    }, 1000);
  };

  const handleLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    console.log('📐 Raw layout:', { width, height });

    if (!Number.isFinite(width) || !Number.isFinite(height) || width === 0 || height === 0) {
        console.warn('⚠️ Skipping layout: invalid dimensions', { width, height });
        return;
    }

    const ratio = width / height;
    let frameWidth, frameHeight;

    if (ratio > OUTPUT_ASPECT_RATIO) {
        frameHeight = height;
        frameWidth = height * OUTPUT_ASPECT_RATIO;
    } else {
        frameWidth = width;
        frameHeight = width / OUTPUT_ASPECT_RATIO;
    }

    const layoutObject = {
        containerWidth: width,
        containerHeight: height,
        frameWidth,
        frameHeight,
    };

    videoLayout.value = layoutObject;
    console.log('📏 Layout set:', layoutObject);
  };

  return (
    <View style={styles.container}>
        <View
        style={[
            styles.videoFrameWrapper,
            {
                aspectRatio: OUTPUT_ASPECT_RATIO,
                width: '90%',
                maxWidth: 360,
                maxHeight: OUTPUT_ASPECT_RATIO < 1 ? 500 : undefined,
                alignSelf: 'center',
            },
        ]}
        onLayout={handleLayout}
        >
        <VideoPlaybackCanvas
            clip={clip}
            keyframes={zoomKeyframesShared}
            currentTime={currentTime}
            videoRef={videoRef}
            paused={paused.value}
            isPreview={isPreview}
            setPaused={(val) => { paused.value = val; }}
            trimStart={trimStart}
            trimEnd={trimEnd}
            onLoad={(meta) => {
                // Set video natural dimensions for layout + marker math
                const w = meta?.naturalSize?.width  ?? 1920;
                const h = meta?.naturalSize?.height ?? 1080;
                videoNaturalWidthShared.value  = w;
                videoNaturalHeightShared.value = h;

                // Start from first marker timestamp if it exists
                const firstT =
                    Array.isArray(overlays?.value) &&
                    overlays.value.length > 0 &&
                    Number.isFinite(overlays.value[0].timestamp)
                    ? overlays.value[0].timestamp
                    : trimStart;

                currentTime.value = firstT;
                currentKeyframeIndex.value = 0;

                requestAnimationFrame(() => {
                    videoRef.current?.seek?.(firstT);
                });

                console.log('🎞️ Video loaded', { w, h }, '→ seek to', firstT);
            }}
            onEnd={() => {
            paused.value = true;
            isPreview.value = false;
            }}
            setPlaybackTime={(t) => {
            currentTime.value = t;
            }}
            currentKeyframeIndex={currentKeyframeIndex}
            videoLayout={videoLayout}
            resizeMode="cover"
            gestureModeShared={gestureModeShared}
            overlays={overlays}
            onChange={handleOverlayChange}
            videoNaturalWidthShared={videoNaturalWidthShared}
            videoNaturalHeightShared={videoNaturalHeightShared}
        />
        </View>

        {/* Controls */}
        <View style={styles.controls}>
        {/* <TouchableOpacity onPress={handlePrevKeyframe} style={styles.button}>
            <Text style={styles.buttonText}>⏮️ Prev</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleAddKeyframe} style={styles.button}>
            <Text style={styles.buttonText}>➕ Add Keyframe</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleNextKeyframe} style={styles.button}>
            <Text style={styles.buttonText}>⏭️ Next</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handlePlayPreview} style={styles.button}>
            <Text style={styles.buttonText}>
            {paused.value ? '▶️ Preview' : '⏸️ Pause'}
            </Text>
        </TouchableOpacity> */}
        <TouchableOpacity
            onPress={() => {
            if (typeof onFinish === 'function') {
                onFinish(overlays.value);
                console.log("📤 Finishing editor with overlays.value:", JSON.stringify(overlays.value));
            }
            }}
            style={[styles.button, styles.finishButton]}
        >
            <Text style={styles.buttonText}>✅ Done</Text>
        </TouchableOpacity>
        </View>

        {/* Gesture Mode Buttons */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 8 }}>
        <TouchableOpacity
            onPress={() => {
            gestureModeShared.value = 'zoom';
            console.log('🟢 Set gesture mode to ZOOM');
            }}
            style={{ padding: 10, backgroundColor: '#444', marginRight: 8, borderRadius: 6 }}
        >
            <Text style={{ color: '#fff' }}>Zoom Mode</Text>
        </TouchableOpacity>

        <TouchableOpacity
            onPress={() => {
            gestureModeShared.value = 'marker';
            console.log('🟠 Set gesture mode to MARKER');
            }}
            style={{ padding: 10, backgroundColor: '#444', borderRadius: 6 }}
        >
            <Text style={{ color: '#fff' }}>Marker Mode</Text>
        </TouchableOpacity>
        </View>

        {/* Marker Type Selector */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8 }}>
        {['circle', 'emoji', 'gif'].map((type, idx) => (
            <TouchableOpacity
            key={type}
            onPress={() => handleSelectMarkerType(type)}
            style={{
                padding: 10,
                backgroundColor: '#666',
                borderRadius: 6,
                marginHorizontal: 4,
            }}
            >
            <Text style={{ color: '#fff' }}>
                {type === 'circle' ? '⬤' : type === 'emoji' ? '😊' : '🖼️'} {type}
            </Text>
            </TouchableOpacity>
        ))}
        </View>
    </View>
    );
};

export default SmartTrackingEditor;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#111',
  },
  button: {
    padding: 10,
    backgroundColor: '#333',
    borderRadius: 6,
    marginHorizontal: 4,
    marginVertical: 4,
  },
  finishButton: {
    backgroundColor: '#1abc9c',
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
  },
  videoFrameWrapper: {
    borderWidth: 2,
    borderColor: '#1abc9c',
    backgroundColor: 'black',
    overflow: 'hidden',
    borderRadius: 8,
    marginVertical: 12,
},
});