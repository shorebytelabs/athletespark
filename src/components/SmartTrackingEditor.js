// /src/components/SmartTrackingEditor.js

import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import VideoPlaybackCanvas from './VideoPlaybackCanvas';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

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

  // Shared values for interaction
  const currentTime = useSharedValue(trimStart);
  const currentKeyframeIndex = useSharedValue(0);
  const overlays = useSharedValue(markerKeyframes);
  const isPreview = useSharedValue(false);
  const paused = useSharedValue(true);
  const videoLayout = useSharedValue(null);
  const gestureModeShared = useSharedValue('marker');
  const videoNaturalWidthShared = useSharedValue(0);
  const videoNaturalHeightShared = useSharedValue(0);

  smartZoomKeyframes = useSharedValue([
    { x: 0, y: 0, scale: 1, timestamp: trimStart },
    { x: 0, y: 0, scale: 1, timestamp: (trimStart + trimEnd) / 2 },
    { x: 0, y: 0, scale: 1, timestamp: trimEnd },
  ]);

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

  console.log("smartZoomKeyframes: ", smartZoomKeyframes);

  return (
    <View style={styles.container}>
      <VideoPlaybackCanvas
        clip={clip}
        keyframes={smartZoomKeyframes} // used for transform if applied
        currentTime={currentTime}
        videoRef={videoRef}
        paused={paused.value}
        isPreview={isPreview}
        setPaused={(val) => { paused.value = val; }}
        trimStart={trimStart}
        trimEnd={trimEnd}
        onLoad={(meta) => {
          currentTime.value = trimStart;
          videoRef.current?.seek?.(trimStart);
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

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity onPress={handlePrevKeyframe} style={styles.button}>
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
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            if (typeof onFinish === 'function') {
              onFinish(overlays.value);
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
            style={{ padding: 10, backgroundColor: '#444', marginRight: 8 }}
            >
            <Text style={{ color: '#fff' }}>Zoom Mode</Text>
            </TouchableOpacity>

            <TouchableOpacity
            onPress={() => {
                gestureModeShared.value = 'marker';
                console.log('🟠 Set gesture mode to MARKER');
            }}
            style={{ padding: 10, backgroundColor: '#444' }}
            >
            <Text style={{ color: '#fff' }}>Marker Mode</Text>
            </TouchableOpacity>
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
    margin: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#333',
    borderRadius: 6,
  },
  finishButton: {
    backgroundColor: '#1abc9c',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
  },
});
