import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import SmartZoomCanvas from './SmartZoomCanvas';
import { interpolateAtTime } from '../utils/interpolateAtTime';
import { generateDenseKeyframes } from '../utils/generateDenseKeyframes';
import { useSharedValue } from 'react-native-reanimated';

const OUTPUT_ASPECT_RATIO = 9 / 16;

const SmartZoomEditor = ({ videoUri, trimStart, trimEnd, duration, onComplete }) => {
  const [keyframes, setKeyframes] = useState([]);
  const [denseKeyframes, setDenseKeyframes] = useState([]);
  const [currentKeyframeIndex, setCurrentKeyframeIndex] = useState(0);
  const [phase, setPhase] = useState('setup'); // 'setup' | 'editing' | 'preview'
  const [playbackTime, setPlaybackTime] = useState(trimStart);
  const [paused, setPaused] = useState(true);
  const [videoLayout, setVideoLayout] = useState(null);
  const currentTime = useSharedValue(trimStart);

  const videoRef = useRef(null);

  const isPreview = phase === 'preview';

  const extractValue = (v) => {
    return typeof v === 'object' && v?.value != null ? v.value : v;
  };

  // ✅ 1. Initial keyframe generation
  useEffect(() => {
    if (phase === 'setup') {
      const range = trimEnd - trimStart;
      const base = [
        { timestamp: trimStart, x: 0, y: 0, scale: 1.5 },
        { timestamp: trimStart + range / 2, x: 0, y: 0, scale: 1.5 },
        { timestamp: trimEnd, x: 0, y: 0, scale: 1.5 },
      ];
      setKeyframes(base);
      setPhase('editing');
    }
  }, [phase]);

  // ✅ 2. Generate dense keyframes for preview
  useEffect(() => {
    if (phase === 'preview' && keyframes.length >= 2) {
      const cleaned = keyframes.filter(kf => typeof kf.timestamp === 'number');
      const dense = generateDenseKeyframes(cleaned);
      setDenseKeyframes(dense);
      setPaused(false); // autoplay in preview
    }
  }, [phase, keyframes]);

  // ✅ 3. Seek when keyframe index changes
  useEffect(() => {
    if (videoRef.current && keyframes[currentKeyframeIndex]) {
      videoRef.current.seek(keyframes[currentKeyframeIndex].timestamp, 0);
    }
  }, [currentKeyframeIndex]);

  const handleLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    const containerAspect = width / height;
    let frameWidth, frameHeight;
    if (containerAspect > OUTPUT_ASPECT_RATIO) {
      frameHeight = height;
      frameWidth = height * OUTPUT_ASPECT_RATIO;
    } else {
      frameWidth = width;
      frameHeight = width / OUTPUT_ASPECT_RATIO;
    }
    setVideoLayout({
      containerWidth: width,
      containerHeight: height,
      frameWidth,
      frameHeight,
    });
  };

  const updateKeyframe = (index, data) => {
    setKeyframes((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        x: data.x,
        y: data.y,
        scale: data.scale,
      };
      return updated;
    });
  };

  const handleProgress = ({ currentTime: t }) => {
    if (t >= trimEnd) {
      setPaused(true);
      videoRef.current.seek(trimStart);
    } else {
      currentTime.value = t;
      setPlaybackTime(t);
    }
  };

  const handleFinish = () => {
    if (!keyframes || keyframes.length < 2) {
      Alert.alert('Error', 'Please create at least two keyframes.');
      return;
    }

    const cleanedKeyframes = keyframes.map((kf, i) => {
      const cleaned = {
        timestamp: typeof kf.timestamp === 'object' && kf.timestamp?.value != null ? kf.timestamp.value : kf.timestamp,
        x: typeof kf.x === 'object' && kf.x?.value != null ? kf.x.value : kf.x,
        y: typeof kf.y === 'object' && kf.y?.value != null ? kf.y.value : kf.y,
        scale: typeof kf.scale === 'object' && kf.scale?.value != null ? kf.scale.value : kf.scale,
      };

      // Logging to debug this
      if (typeof cleaned.x === 'object' || typeof cleaned.y === 'object' || typeof cleaned.scale === 'object') {
        console.warn(`⚠️ Unclean value at keyframe ${i}`, cleaned, kf);
      }

      return cleaned;
    });

    try {
      onComplete?.(cleanedKeyframes);
    } catch (err) {
      console.error('❌ Failed to complete Smart Zoom:', err, cleanedKeyframes);
      Alert.alert('Export Error', 'Smart Zoom could not complete. See console for details.');
    }
  };

  const current = isPreview ? interpolateAtTime(denseKeyframes, playbackTime) : keyframes[currentKeyframeIndex];

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Smart Zoom Editor</Text>

      <View style={styles.videoContainer} onLayout={handleLayout}>
        {videoLayout && (
          <SmartZoomCanvas
            clip={{
              uri: videoUri,
              timestamp: isPreview ? playbackTime : current?.timestamp,
            }}
            zoom={current?.scale || 1}
            x={current?.x || 0}
            y={current?.y || 0}
            videoLayout={videoLayout}
            onChange={(transform) => !isPreview && updateKeyframe(currentKeyframeIndex, transform)}
            paused={paused}
            setPlaybackTime={setPlaybackTime}
            isPreview={isPreview}
            videoRef={videoRef}
            onEnd={() => setPaused(true)}
            trimStart={trimStart}
            trimEnd={trimEnd}
            keyframes={keyframes}
            denseKeyframes={denseKeyframes}
            playbackTime={playbackTime}
            currentTime={currentTime}
          />
        )}
      </View>

      {!isPreview && (
        <View style={styles.controls}>
          <Button
            title="◀ Prev"
            disabled={currentKeyframeIndex === 0}
            onPress={() => setCurrentKeyframeIndex((i) => Math.max(0, i - 1))}
          />
          <Text style={styles.stepLabel}>
            Frame {currentKeyframeIndex + 1} of {keyframes.length}
          </Text>
          <Button
            title={currentKeyframeIndex < keyframes.length - 1 ? 'Next ▶' : 'Preview ▶️'}
            onPress={() => {
              if (currentKeyframeIndex < keyframes.length - 1) {
                setCurrentKeyframeIndex((i) => i + 1);
              } else {
                setPhase('preview');
              }
            }}
          />
        </View>
      )}

      {isPreview && (
        <View style={styles.controls}>
          <Button
            title={paused ? 'Play ▶️' : 'Pause ⏸'}
            onPress={() => {
              if (paused && videoRef.current) {
                videoRef.current.seek(trimStart);
              }
              setPaused((p) => !p);
            }}
          />
          <Button title="Finish Smart Zoom" onPress={handleFinish} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 10,
  },
  videoContainer: {
    alignSelf: 'center',
    width: '90%',
    aspectRatio: 9 / 16,
    backgroundColor: 'black',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'white',
    borderRadius: 8,
    marginVertical: 10,
  },
  controls: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  stepLabel: {
    color: 'white',
    fontSize: 16,
  },
});

export default SmartZoomEditor;
