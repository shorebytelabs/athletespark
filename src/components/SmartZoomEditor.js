// SmartZoomEditor.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { useSharedValue, useFrameCallback, runOnJS } from 'react-native-reanimated';
import VideoPlaybackCanvas from './VideoPlaybackCanvas';
import { colors } from '../theme/theme';
import { useNavigation, useRoute } from '@react-navigation/native'; 

const SmartZoomEditor = ({ videoUri, trimStart, trimEnd, onComplete, aspectRatio, existingKeyframes, project }) => {
  const keyframes = useSharedValue([]);
  const keyframesShared = useSharedValue([]);
  const currentTime = useSharedValue(trimStart);
  const videoLayout = useSharedValue(null);
  const isPreview = useSharedValue(false);

  const [currentKeyframeIndex, setCurrentKeyframeIndex] = useState(0);
  const [phase, setPhase] = useState('setup');
  const [playbackTime, setPlaybackTime] = useState(trimStart);
  const [paused, setPaused] = useState(true);
  const [canRender, setCanRender] = useState(false);
  const videoRef = useRef(null);
  const OUTPUT_ASPECT_RATIO = aspectRatio?.ratio ?? (9 / 16); 
  const [previewSessionId, setPreviewSessionId] = useState(0);
  const videoNaturalWidthShared = useSharedValue(null);
  const videoNaturalHeightShared = useSharedValue(null);

  const getTransformDefaults = (kf) => ({
    timestamp: Number.isFinite(kf.timestamp) ? kf.timestamp : trimStart,
    x: Number.isFinite(kf.x) ? kf.x : 0,
    y: Number.isFinite(kf.y) ? kf.y : 0,
    scale: Number.isFinite(kf.scale) ? kf.scale : 1,
  });

  const current =
    keyframes.value?.[currentKeyframeIndex] || getTransformDefaults({});

  const readyToEdit = keyframes.value.length === 3 && Number.isFinite(current.timestamp);
  const currentKeyframeIndexShared = useSharedValue(0);
  const [previewFinished, setPreviewFinished] = useState(false);
  const navigation = useNavigation();
  const route = useRoute();
  const clipIndex = route.params?.clipIndex ?? 0; 

  useEffect(() => {
    currentKeyframeIndexShared.value = currentKeyframeIndex;
  }, [currentKeyframeIndex]);

  useEffect(() => {
    if (phase === 'setup') {
      const range = trimEnd - trimStart;
      let initialKeyframes;

      if (Array.isArray(existingKeyframes) && existingKeyframes.length === 3) {
        initialKeyframes = existingKeyframes.map((kf) => ({
          timestamp: Math.max(trimStart, Math.min(kf.timestamp, trimEnd)),
          x: Number.isFinite(kf.x) ? kf.x : 0,
          y: Number.isFinite(kf.y) ? kf.y : 0,
          scale: Number.isFinite(kf.scale) ? kf.scale : 1,
        }));
      } else {
        initialKeyframes = [
          { timestamp: trimStart, x: 0, y: 0, scale: 1 },
          { timestamp: trimStart + range / 2, x: 0, y: 0, scale: 1 },
          { timestamp: trimEnd, x: 0, y: 0, scale: 1 },
        ];
      }

      keyframes.value = initialKeyframes;
      currentTime.value = trimStart;
      setPlaybackTime(trimStart);
      setPhase('editing');
    }
  }, [phase]);

  useEffect(() => {
    const id = setInterval(() => {
      if (keyframes.value.length === 3 && keyframes.value.every((kf) => Number.isFinite(kf.timestamp))) {
        setCanRender(true);
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isPreview.value && current?.timestamp && videoRef.current) {
      const ts = current.timestamp;
      requestAnimationFrame(() => {
        videoRef.current?.seek(ts);
      });
    }
  }, [currentKeyframeIndex]);

  useEffect(() => {
    if (isPreview.value) {
      setPaused(false);
      currentTime.value = trimStart;
      setPlaybackTime(trimStart);
      setTimeout(() => {
        requestAnimationFrame(() => videoRef.current?.seek(trimStart));
      }, 100);
    }
  }, [isPreview.value]);

  useFrameCallback(({ timeSincePreviousFrame }) => {
    if (isPreview.value && !paused) {
      const nextTime = currentTime.value + timeSincePreviousFrame / 1000;

      if (nextTime >= trimEnd) {
        currentTime.value = trimEnd;
        runOnJS(setPaused)(true);
        runOnJS(setPreviewFinished)(true); 
      } else {
        currentTime.value = nextTime;
      }

      runOnJS(setPlaybackTime)(currentTime.value);
    }
  });

  useEffect(() => {
    if (isPreview.value && playbackTime >= trimEnd) {
      setPaused(true);
      currentTime.value = trimEnd;
      videoRef.current?.seek(trimEnd);

      // Exit preview mode entirely
      isPreview.value = false;
      setPreviewFinished(true);
    }
  }, [playbackTime, trimEnd]);

  const updateKeyframe = useCallback((index, data) => {
    const newFrames = [...keyframes.value];
    newFrames[index] = { ...newFrames[index], ...data };
    keyframes.value = newFrames;
    // console.log('📝 Updated keyframe', index + 1, newFrames[index]);
  }, []);

  const finishZoom = useCallback(() => {
    const cleaned = keyframes.value.map(getTransformDefaults).map((kf) => ({
      ...kf,
      timestamp: Math.max(trimStart, Math.min(kf.timestamp, trimEnd)),
    }));
    keyframesShared.value = cleaned;

    console.log('✅ Cleaned keyframes for preview:', cleaned);

    // ⬇️ Instead of calling onComplete, navigate back with data
    navigation.navigate('VideoEditor', {
      project,
      updatedSmartZoom: {
        clipIndex,
        keyframes: cleaned,
      },
    });
  }, [navigation, route, keyframes.value, getTransformDefaults, trimStart, trimEnd]);

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

  const hasValidPreviewData =
    isPreview.value &&
    Array.isArray(keyframesShared.value) &&
    keyframesShared.value.length >= 2 &&
    keyframesShared.value.every((kf) => Number.isFinite(kf.timestamp) && Number.isFinite(kf.scale));

  const shouldRenderCanvas =
  videoLayout.value &&
  canRender &&
  ((isPreview.value && hasValidPreviewData) ||
    (!isPreview.value && readyToEdit));

  const onVideoLoad = useCallback((data) => {
    console.log('🎞 Video loaded');

    const naturalWidth = data?.naturalSize?.width;
    const naturalHeight = data?.naturalSize?.height;

    if (Number.isFinite(naturalWidth) && Number.isFinite(naturalHeight)) {
      videoNaturalWidthShared.value = naturalWidth;
      videoNaturalHeightShared.value = naturalHeight;
      console.log('📏 Natural size (SmartZoomEditor):', { naturalWidth, naturalHeight });
    } else {
      console.warn('⚠️ Missing or invalid natural size in SmartZoomEditor');
      videoNaturalWidthShared.value = 1080;
      videoNaturalHeightShared.value = 1920;
    }

    const seekTo = isPreview.value ? trimStart : current.timestamp;
    requestAnimationFrame(() => videoRef.current?.seek(seekTo));
  }, [isPreview.value, current.timestamp, trimStart]);

  const handleEnd = useCallback(() => setPaused(true), []);

  const handleChange = useCallback(
    (transform, index) => {
      if (!isPreview.value) updateKeyframe(index, transform);
    },
    [isPreview.value, updateKeyframe]
  );

  const goToPreview = useCallback(() => {
    const cleaned = keyframes.value.map(getTransformDefaults).map((kf) => ({
      ...kf,
      timestamp: Math.max(trimStart, Math.min(kf.timestamp, trimEnd)),
    }));
    keyframesShared.value = cleaned;
    console.log('✅ Cleaned keyframes for preview:', cleaned);

    isPreview.value = true;
    setPreviewFinished(false);

    // Step 1: Seek to beginning
    requestAnimationFrame(() => {
      videoRef.current?.seek(trimStart);

      // Step 2: Add delay before unpausing to let audio & video flush
      setTimeout(() => {
        currentTime.value = trimStart;
        setPlaybackTime(trimStart);
        setPaused(false);
      }, 100); // <-- 100ms delay (tweakable)

      setPreviewSessionId((id) => id + 1);
    });
  }, [keyframes.value, getTransformDefaults, trimStart, trimEnd]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Smart Zoom Editor</Text>
        <View
          style={[
            styles.videoFrameWrapper,
            {
              aspectRatio: OUTPUT_ASPECT_RATIO,
              width: '90%',
              maxWidth: 360, 
              alignSelf: 'center',
            },
          ]}
          onLayout={handleLayout}
        >
          {shouldRenderCanvas && (
            <VideoPlaybackCanvas
              clip={{ uri: videoUri || '' }}
              zoom={current.scale}
              x={current.x}
              y={current.y}
              onChange={handleChange}
              videoLayout={videoLayout}
              paused={paused}
              repeat={false} 
              isPreview={isPreview}
              setPlaybackTime={setPlaybackTime}
              videoRef={videoRef}
              onEnd={handleEnd}
              trimStart={trimStart}
              trimEnd={trimEnd}
              keyframes={isPreview.value ? keyframesShared : keyframes}
              currentTime={currentTime}
              onLoad={onVideoLoad}
              currentKeyframeIndex={currentKeyframeIndexShared}
              setPaused={setPaused}
              resizeMode="contain"
              videoNaturalWidthShared={videoNaturalWidthShared}
              videoNaturalHeightShared={videoNaturalHeightShared}
            />
          )}
        </View>

      {readyToEdit && !isPreview.value && !previewFinished && (
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
                goToPreview();
              }
            }}
          />
        </View>
      )}

      {readyToEdit && (isPreview.value || previewFinished) && (
      <View style={styles.controls}>
        <Button
          title={paused ? '▶️ Play' : '⏸️ Pause'}
          onPress={() => {
          if (paused) {
            console.log("previewFinished: ",previewFinished, "isPreview.value: ",isPreview.value)
            if (previewFinished || !isPreview.value) {
              goToPreview(); // Re-run preview mode fully with smooth startup
            } else {
              // Mid-preview resume
              requestAnimationFrame(() => {
                videoRef.current?.seek(currentTime.value);
                requestAnimationFrame(() => {
                  setPaused(false);
                });
              });
            }
          } else {
            setPaused(true);
          }
        }}
        />
        {!isPreview.value && !previewFinished && (
          <Button
            title="Preview ▶️"
            onPress={() => {
              goToPreview();
              setPreviewFinished(false);
            }}
          />
        )}
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
  controls: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stepLabel: {
    color: 'white',
    fontSize: 16,
  },
  videoFrameWrapper: {
    borderWidth: 2,
    borderColor: colors.accent1,
    backgroundColor: 'black',
    overflow: 'hidden',
    borderRadius: 8,
    marginVertical: 12,
  },
});

export default SmartZoomEditor;