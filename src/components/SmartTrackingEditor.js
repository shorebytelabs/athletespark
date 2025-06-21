// SmartTrackingEditor.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Button, StyleSheet, ScrollView } from 'react-native';
import { useSharedValue, useFrameCallback, runOnJS } from 'react-native-reanimated';
import VideoPlaybackCanvas from './VideoPlaybackCanvas';
import { colors } from '../theme/theme';
import { useNavigation, useRoute } from '@react-navigation/native';

const SmartTrackingEditor = ({ videoUri, trimStart, trimEnd, onComplete, aspectRatio, existingKeyframes, project }) => {
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
  const currentKeyframeIndexShared = useSharedValue(0);
  const [previewFinished, setPreviewFinished] = useState(false);
  const [markerType, setMarkerType] = useState('circle');
  const gestureModeShared = useSharedValue('marker');
  const navigation = useNavigation();
  const route = useRoute();
  const clipIndex = route.params?.clipIndex ?? 0;

  const getDefaults = (kf) => ({
    timestamp: Number.isFinite(kf.timestamp) ? kf.timestamp : trimStart,
    x: Number.isFinite(kf.x) ? kf.x : 0,
    y: Number.isFinite(kf.y) ? kf.y : 0,
    markerType: kf.markerType || 'circle',
  });

  const current = keyframes.value?.[currentKeyframeIndex] || getDefaults({});

  useEffect(() => {
    currentKeyframeIndexShared.value = currentKeyframeIndex;
  }, [currentKeyframeIndex]);

//   useEffect(() => {
//     if (phase === 'setup') {
//         const range = trimEnd - trimStart;

//         // ✅ Clamp timestamps to stay within bounds
//         const safeTimestamp = (t) => Math.max(trimStart, Math.min(t, trimEnd));

//         const initial = Array.isArray(existingKeyframes) && existingKeyframes.length === 3
//         ? existingKeyframes.map(getDefaults)
//         : [
//             { timestamp: safeTimestamp(trimStart), x: 0, y: 0, markerType: 'circle' },
//             { timestamp: safeTimestamp(trimStart + range / 2), x: 0, y: 0, markerType: 'circle' },
//             { timestamp: safeTimestamp(trimEnd), x: 0, y: 0, markerType: 'circle' },
//             ];

//         keyframes.value = initial;
//         currentTime.value = trimStart;
//         setPlaybackTime(trimStart);
//         setPhase('editing');
//     }
//   }, [phase]);

  useEffect(() => {
    if (phase === 'setup') {
        const range = trimEnd - trimStart;
        const initial = Array.isArray(existingKeyframes) && existingKeyframes.length === 3
        ? existingKeyframes.map(getDefaults)
        : [
            { timestamp: trimStart, x: 0, y: 0, markerType: 'circle' },
            { timestamp: trimStart + range / 2, x: 0, y: 0, markerType: 'circle' },
            { timestamp: trimEnd, x: 0, y: 0, markerType: 'circle' },
            ];
        keyframes.value = initial;
        currentTime.value = initial[0].timestamp; // ✅ Sync with first keyframe timestamp
        setPlaybackTime(initial[0].timestamp);
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
    if (isPreview.value) {
      setPaused(false);
      currentTime.value = trimStart;
      setPlaybackTime(trimStart);
      setTimeout(() => {
        requestAnimationFrame(() => videoRef.current?.seek(trimStart));
      }, 100);
    }
  }, [isPreview.value]);

//   useEffect(() => {
//     if (!isPreview.value && current?.timestamp && videoRef.current) {
//         setTimeout(() => {
//         requestAnimationFrame(() => {
//             console.log('🎞 Seeking to keyframe', {
//             currentKeyframeIndex,
//             timestamp: current.timestamp,
//             });
//             videoRef.current?.seek(current.timestamp);
//         });
//         }, 100); // allow layout to settle before seeking
//     }
//   }, [currentKeyframeIndex, isPreview.value, current?.timestamp]);

  useEffect(() => {
    if (!isPreview.value && current?.timestamp && videoRef.current) {
        requestAnimationFrame(() => {
        currentTime.value = current.timestamp; // ✅ key addition
        videoRef.current?.seek(current.timestamp);
        });
    }
  }, [currentKeyframeIndex, isPreview.value, current?.timestamp]);

  useEffect(() => {
    console.log('🧩 keyframes', keyframes.value);
    console.log('📍 currentKeyframeIndex', currentKeyframeIndex);
  }, [currentKeyframeIndex]);

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

  const updateKeyframe = useCallback((index, data) => {
    const updated = [...keyframes.value];
    const existing = updated[index] ?? {};

    console.log('📌 updateKeyframe', { index, data, existing });

    const defaultTimestamp =
        index === 0
        ? trimStart
        : index === 1
        ? trimStart + (trimEnd - trimStart) / 2
        : trimEnd;

    updated[index] = {
        timestamp: Number.isFinite(existing.timestamp) ? existing.timestamp : defaultTimestamp,
        x: Number.isFinite('x' in data && data.x) ? data.x : (existing.x ?? 0),
        y: Number.isFinite('y' in data && data.y) ? data.y : (existing.y ?? 0),
        markerType: data.markerType ?? existing.markerType ?? 'circle',
    };

    console.log('✅ updated keyframes', updated);
    console.log('✏️ updateKeyframe', { index, data, updated });

    keyframes.value = updated;
    }, [trimStart, trimEnd]);

  const finishTracking = useCallback(() => {
    const cleaned = keyframes.value.map(getDefaults).map((kf) => ({
      ...kf,
      timestamp: Math.max(trimStart, Math.min(kf.timestamp, trimEnd)),
    }));
    keyframesShared.value = cleaned;

    navigation.navigate('VideoEditor', {
      project,
      updatedSmartTracking: {
        clipIndex,
        keyframes: cleaned,
      },
    });
  }, [keyframes.value]);

  const goToPreview = useCallback(() => {
    const cleaned = keyframes.value.map(getDefaults).map((kf) => ({
      ...kf,
      timestamp: Math.max(trimStart, Math.min(kf.timestamp, trimEnd)),
    }));
    keyframesShared.value = cleaned;
    isPreview.value = true;
    setPreviewFinished(false);
    requestAnimationFrame(() => {
      videoRef.current?.seek(trimStart);
      setTimeout(() => {
        currentTime.value = trimStart;
        setPlaybackTime(trimStart);
        setPaused(false);
      }, 100);
      setPreviewSessionId((id) => id + 1);
    });
  }, [keyframes.value]);

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

    console.log('📏 Layout detected:', {
        width,
        height,
        frameWidth,
        frameHeight,
    });

    videoLayout.value = {
      containerWidth: width,
      containerHeight: height,
      frameWidth,
      frameHeight,
    };
  };

//   const onVideoLoad = useCallback((data) => {
//     console.log('📽️ onVideoLoad', data);
//     videoNaturalWidthShared.value = data?.naturalSize?.width ?? 1080;
//     videoNaturalHeightShared.value = data?.naturalSize?.height ?? 1920;

//     // requestAnimationFrame(() => {
//     //     const ts = isPreview.value ? trimStart : current.timestamp;
//     //     console.log('📍 Seeking to', ts);
//     //     videoRef.current?.seek(ts);
//     // });
//     requestAnimationFrame(() => {
//         const ts = isPreview.value ? trimStart : current.timestamp;
//         console.log('📍 Seeking to', {
//             isPreview: isPreview.value,
//             currentIndex: currentKeyframeIndex,
//             timestamp: ts,
//             keyframes: keyframes.value,
//         });
//         videoRef.current?.seek(ts);
//         });
//     }, [isPreview.value, current.timestamp]);

  const onVideoLoad = useCallback((data) => {
    const naturalW = data?.naturalSize?.width ?? 1080;
    const naturalH = data?.naturalSize?.height ?? 1920;

    videoNaturalWidthShared.value = naturalW;
    videoNaturalHeightShared.value = naturalH;

    console.log('📽️ onVideoLoad', { naturalW, naturalH });
    console.log('📽️ onLoad natural size:', {
        width: data?.naturalSize?.width,
        height: data?.naturalSize?.height,
    });
        console.log('📽️ Shared values before seek:', {
        naturalW: videoNaturalWidthShared.value,
        naturalH: videoNaturalHeightShared.value,
    });

    requestAnimationFrame(() => {
        const ts = isPreview.value ? trimStart : current?.timestamp ?? trimStart;
        console.log('📍 Seeking to', { ts });
        currentTime.value = ts; // ✅ ensure sync
        videoRef.current?.seek(ts);
    });
    }, [isPreview.value, current.timestamp]);

  const handleChange = useCallback((transform, index) => {
    if (!isPreview.value) {
      updateKeyframe(index, {
        ...transform,
        markerType: keyframes.value[index]?.markerType || 'circle',
      });
    }
  }, [isPreview.value, updateKeyframe]);

  const readyToEdit = keyframes.value.length === 3 && Number.isFinite(current.timestamp);
  const shouldRenderCanvas =
    videoLayout.value &&
    canRender &&
    ((isPreview.value && keyframesShared.value.length >= 2) || (!isPreview.value && readyToEdit));

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} style={styles.container}>
      <Text style={styles.header}>Smart Tracking Editor</Text>
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
        {(() => {
        console.log('🔍 Verifying keyframes before render:', keyframes.value);
        keyframes.value.forEach((kf, i) => {
            if (!Number.isFinite(kf.timestamp)) {
            console.warn(`⚠️ Keyframe ${i} has invalid timestamp`, kf);
            }
        });

        console.log('🧪 Render check', {
            currentKeyframeIndex,
            readyToEdit,
            canRender,
            videoLayout: videoLayout.value,
            naturalWidth: videoNaturalWidthShared.value,
            naturalHeight: videoNaturalHeightShared.value,
        });
        })()}
        {shouldRenderCanvas && (
          <VideoPlaybackCanvas
            key={`canvas-${previewSessionId}`}
            clip={{ uri: videoUri || '' }}
            overlays={isPreview.value ? keyframesShared : keyframes}
            onChange={handleChange}
            videoLayout={videoLayout}
            paused={paused}
            isPreview={isPreview}
            setPlaybackTime={setPlaybackTime}
            videoRef={videoRef}
            trimStart={trimStart}
            trimEnd={trimEnd}
            keyframes={isPreview.value ? keyframesShared : keyframes}
            currentTime={currentTime}
            onLoad={onVideoLoad}
            currentKeyframeIndex={currentKeyframeIndexShared}
            resizeMode="contain"
            videoNaturalWidthShared={videoNaturalWidthShared}
            videoNaturalHeightShared={videoNaturalHeightShared}
            setPaused={setPaused}
            gestureModeShared={gestureModeShared}
            previewSessionId={previewSessionId}
          />
        )}
      </View>

      {!isPreview.value && (
        <View style={styles.markerPicker}>
          <Button title="🔴 Circle" onPress={() => {
            const existing = keyframes.value[currentKeyframeIndex];
            updateKeyframe(currentKeyframeIndex, {
                x: existing?.x,
                y: existing?.y,
                markerType: 'circle',
            });
            }} />
          <Button title="🎯 Emoji" onPress={() => {
            const existing = keyframes.value[currentKeyframeIndex];
            updateKeyframe(currentKeyframeIndex, {
                x: existing?.x,
                y: existing?.y,
                markerType: 'emoji',
            });
            }} />
          <Button title="GIF" onPress={() => {
            const existing = keyframes.value[currentKeyframeIndex];
            updateKeyframe(currentKeyframeIndex, {
                x: existing?.x,
                y: existing?.y,
                markerType: 'gif',
            });
            }} />
        </View>
      )}

      {!isPreview.value && (
        <View style={styles.controls}>
          <Button title="◀ Prev" disabled={currentKeyframeIndex === 0} onPress={() => setCurrentKeyframeIndex(i => Math.max(0, i - 1))} />
          <Text style={styles.stepLabel}>Frame {currentKeyframeIndex + 1} of 3</Text>
          <Button
            title={currentKeyframeIndex < 2 ? 'Next ▶' : 'Preview ▶️'}
            onPress={() => {
              if (currentKeyframeIndex < 2) {
                setCurrentKeyframeIndex(i => i + 1);
              } else {
                goToPreview();
              }
            }}
          />
        </View>
      )}

      {isPreview.value && (
        <View style={styles.controls}>
          <Button
            title={paused ? '▶️ Play' : '⏸️ Pause'}
            onPress={() => {
              if (paused) {
                if (previewFinished) {
                    goToPreview();
                } else {
                    const ts = currentTime.value ?? trimStart;
                    requestAnimationFrame(() => {
                    currentTime.value = ts;
                    videoRef.current?.seek(ts);
                    setPaused(false);
                    });
                }
                } else {
                setPaused(true);
              }
            }}
          />
          <Button title="Finish Tracking" onPress={finishTracking} />
        </View>
      )}
    </ScrollView>
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
  markerPicker: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 12,
  },
  stepLabel: {
    color: 'white',
    fontSize: 16,
  },
  videoFrameWrapper: {
    borderWidth: 2,
    borderColor: colors.accent2,
    backgroundColor: 'black',
    overflow: 'hidden',
    borderRadius: 8,
    marginVertical: 12,
  },
  editMarker: {
    position: 'absolute',
    left: -15,
    top: -15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    },
});

export default SmartTrackingEditor;