import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import SmartZoomCanvas from './SmartZoomCanvas';

const OUTPUT_ASPECT_RATIO = 9 / 16;

const SmartZoomEditor = ({ videoUri, trimStart, trimEnd, duration, onComplete }) => {
  const keyframes = useSharedValue([]);
  const keyframesShared = useSharedValue([]);
  const currentTime = useSharedValue(trimStart);

  const [currentKeyframeIndex, setCurrentKeyframeIndex] = useState(0);
  const [phase, setPhase] = useState('setup');
  const [playbackTime, setPlaybackTime] = useState(trimStart);
  const [paused, setPaused] = useState(true);
  const [videoLayout, setVideoLayout] = useState(null);

  const videoRef = useRef(null);

  const isPreview = useMemo(() => phase === 'preview', [phase]);

  const getTransformDefaults = (kf) => {
    const safeTimestamp = Number(kf.timestamp);
    return {
      timestamp: Number.isFinite(safeTimestamp) ? safeTimestamp : trimStart,
      x: Number.isFinite(kf.x) ? kf.x : 0,
      y: Number.isFinite(kf.y) ? kf.y : 0,
      scale: Number.isFinite(kf.scale) ? kf.scale : 1.5,
    };
  };

  const current =
    keyframes.value.length > currentKeyframeIndex && keyframes.value[currentKeyframeIndex]
      ? getTransformDefaults(keyframes.value[currentKeyframeIndex])
      : { timestamp: trimStart, x: 0, y: 0, scale: 1.5 };

  const readyToEdit = keyframes.value.length === 3 && current;

  useEffect(() => {
    if (phase === 'setup') {
      const range = trimEnd - trimStart;
      const kfs = [
        { timestamp: trimStart, x: 0, y: 0, scale: 1.5 },
        { timestamp: trimStart + range / 2, x: 0, y: 0, scale: 1.5 },
        { timestamp: trimEnd, x: 0, y: 0, scale: 1.5 },
      ];
      keyframes.value = kfs;
      currentTime.value = trimStart;
      setPlaybackTime(trimStart);
      setPhase('editing');
    }
  }, [phase]);

  useEffect(() => {
    if (!isPreview && current?.timestamp != null && videoRef.current) {
      videoRef.current.seek(current.timestamp);
    }
  }, [currentKeyframeIndex, isPreview]);

  useEffect(() => {
    if (isPreview) {
      setPaused(false);
      currentTime.value = trimStart;
      setPlaybackTime(trimStart);
      if (videoRef.current) {
        videoRef.current.seek(trimStart);
      }
    }
  }, [isPreview]);

  const updateKeyframe = (index, data) => {
    const newFrames = [...keyframes.value];
    newFrames[index] = { ...newFrames[index], ...data };
    keyframes.value = newFrames;
    console.log('📝 Updated keyframe', index + 1, newFrames[index]);
  };

  const finishZoom = () => {
    const cleaned = keyframes.value
      .map(getTransformDefaults)
      .filter(k => typeof k.timestamp === 'number' && !isNaN(k.timestamp));

    console.log('✅ Finishing Smart Zoom with cleaned keyframes:', cleaned);

    if (cleaned.length >= 2) {
      keyframesShared.value = cleaned;
      onComplete?.(cleaned);
    } else {
      console.warn('⚠️ Not enough valid keyframes to finish Smart Zoom.');
    }
  };

  const handleLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    const ratio = width / height;
    let frameWidth, frameHeight;
    if (ratio > OUTPUT_ASPECT_RATIO) {
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

  const getFallbackKeyframes = () => [
    { timestamp: trimStart, x: 0, y: 0, scale: 1.5 },
    { timestamp: (trimStart + trimEnd) / 2, x: 0, y: 0, scale: 1.5 },
    { timestamp: trimEnd, x: 0, y: 0, scale: 1.5 },
  ];

  const hasValidPreviewData =
    isPreview &&
    keyframesShared.value?.length >= 2 &&
    typeof currentTime.value === 'number' &&
    Number.isFinite(currentTime.value);

  const shouldRenderCanvas =
    videoLayout && ((isPreview && hasValidPreviewData) || (!isPreview && readyToEdit));

  const onVideoLoad = () => {
    console.log('🎥 onVideoLoad triggered, seeking to:', isPreview ? trimStart : current?.timestamp);
    if (videoRef.current) {
      const seekTo = isPreview ? trimStart : current?.timestamp;
      if (typeof seekTo === 'number') {
        videoRef.current.seek(seekTo);
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Smart Zoom Editor</Text>

      <View style={styles.videoContainer} onLayout={handleLayout}>
        {/* {shouldRenderCanvas && ( */}
        {videoLayout && (  
          <SmartZoomCanvas
            clip={{ uri: videoUri }}
            zoom={current?.scale}
            x={current?.x}
            y={current?.y}
            onChange={(t) => !isPreview && updateKeyframe(currentKeyframeIndex, t)}
            videoLayout={videoLayout}
            paused={paused}
            isPreview={isPreview}
            setPlaybackTime={setPlaybackTime}
            videoRef={videoRef}
            onEnd={() => setPaused(true)}
            trimStart={trimStart}
            trimEnd={trimEnd}
            keyframes={isPreview ? keyframesShared : keyframes}
            currentTime={currentTime}
            onLoad={onVideoLoad}
          />
        )}
      </View>

      {readyToEdit && !isPreview && (
        <View style={styles.controls}>
          <Button
            title="◀ Prev"
            disabled={currentKeyframeIndex === 0}
            onPress={() => setCurrentKeyframeIndex((i) => Math.max(0, i - 1))}
          />
          <Text style={styles.stepLabel}>
            Frame {currentKeyframeIndex + 1} of {keyframes.value.length}
          </Text>
          <Button
            title={currentKeyframeIndex < keyframes.value.length - 1 ? 'Next ▶' : 'Preview ▶️'}
            onPress={() => {
              if (currentKeyframeIndex < keyframes.value.length - 1) {
                setCurrentKeyframeIndex((i) => i + 1);
              } else {
                const fallback = getFallbackKeyframes();
                const validKeyframes =
                  Array.isArray(keyframes.value) && keyframes.value.length >= 2
                    ? keyframes.value.filter((k) => typeof k.timestamp === 'number')
                    : fallback;

                const cleaned = validKeyframes.map(getTransformDefaults);
                keyframesShared.value = cleaned;
                console.log('🔁 Copied keyframes into keyframesShared:', cleaned);
                setPhase('preview');
              }
            }}
          />
        </View>
      )}

      {readyToEdit && isPreview && (
        <View style={styles.controls}>
          <Button
            title={paused ? 'Play ▶️' : 'Pause ⏸'}
            onPress={() => {
              if (paused) {
                videoRef.current?.seek(trimStart);
              }
              setPaused((p) => !p);
            }}
          />
          <Button title="Finish Smart Zoom" onPress={finishZoom} />
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
    aspectRatio: OUTPUT_ASPECT_RATIO,
    backgroundColor: 'black',
    overflow: 'hidden',
    borderColor: 'white',
    borderWidth: 1,
    borderRadius: 8,
    marginVertical: 10,
  },
  controls: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stepLabel: {
    color: 'white',
    fontSize: 16,
  },
});

export default SmartZoomEditor;
