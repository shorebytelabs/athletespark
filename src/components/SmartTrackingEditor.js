// /src/components/SmartTrackingEditor.js

import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import VideoPlaybackCanvas from './VideoPlaybackCanvas';
import { useSharedValue, runOnJS, useDerivedValue, useAnimatedReaction, } from 'react-native-reanimated';
import { runOnUI, withTiming, } from 'react-native-reanimated';
import { useRoute } from '@react-navigation/native';
import { SPOTLIGHT_MODES } from '../constants/playerSpotlight'; 
import Slider from '@react-native-community/slider';
import { colors } from '../theme/theme';

const SmartTrackingEditor = ({ 
  clip,
  trimStart,
  trimEnd,
  aspectRatio,
  smartZoomKeyframes,
  markerKeyframes,
  spotlightMode = SPOTLIGHT_MODES.GUIDED,
  onFinish,
}) => {
  const videoRef = useRef(null);
  const route = useRoute();

  // Shared values for interaction
  const currentTime = useSharedValue(trimStart);
  const currentKeyframeIndex = useSharedValue(0);
  const currentZoomKeyframeIndex = useSharedValue(0); // Separate index for zoom keyframes
  const isPreview = useSharedValue(route.params?.startInEdit ? false : true);
  const paused = useSharedValue(true);
  const videoLayout = useSharedValue(null);
  const gestureModeShared = useSharedValue('marker');
  const videoNaturalWidthShared = useSharedValue(0);
  const videoNaturalHeightShared = useSharedValue(0);
  const OUTPUT_ASPECT_RATIO = aspectRatio?.ratio ?? 9 / 16;
  const freezeProgress = useSharedValue(0);

  // Derived value to use the appropriate keyframe index based on gesture mode
  const activeKeyframeIndex = useDerivedValue(() => {
    return gestureModeShared.value === 'zoom' ? currentZoomKeyframeIndex.value : currentKeyframeIndex.value;
  });
  
  /* ------------------------------------------------------------- */
  /* 1️⃣  Create overlays shared value *with* the incoming keyframes */
  /* ------------------------------------------------------------- */
  const isIntro = spotlightMode === SPOTLIGHT_MODES.INTRO;

  // Set isPreview to false in intro mode to enable editing
  useEffect(() => {
    if (isIntro) {
      isPreview.value = false;
    }
  }, [isIntro]);

  const overlays = useSharedValue(
    isIntro
        ? [{
            timestamp: Math.min(trimStart + 1, trimEnd), // Default to 1 second from start, but not beyond trimEnd
            x: 0, y: 0,
            markerType: 'circle',
            freezeDuration: 1.0,   // default 1 s
        }]
        : (Array.isArray(markerKeyframes) && markerKeyframes.length
            ? markerKeyframes.map(kf => ({ ...kf }))
            : [{ timestamp: trimStart, x: 100, y: 300, markerType: 'circle' }])
  );

  // ① Local React state to mirror the shared value
  const [freezeDurUI, setFreezeDurUI] =
    useState(overlays.value[0]?.freezeDuration ?? 1);
  const freezeDurationShared = useSharedValue(freezeDurUI);

  // Local state for frame timestamp slider
  const [frameTimestampUI, setFrameTimestampUI] = useState(
    isIntro ? Math.min(trimStart + 1, trimEnd) : (overlays.value[0]?.timestamp ?? trimStart)
  );

  // ② Bridge SharedValue → React for live label updates
  useAnimatedReaction(
    () => freezeDurationShared.value,
    (val, prev) => {
        if (val !== prev) runOnJS(setFreezeDurUI)(val);
    },
    []
 );

  // Bridge overlay timestamp → React for frame slider
  useAnimatedReaction(
    () => overlays.value[0]?.timestamp,
    (val, prev) => {
        if (val !== prev && Number.isFinite(val)) runOnJS(setFrameTimestampUI)(val);
    },
    []
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

  // Debug: Log zoom keyframes
  console.log('🎯 Zoom keyframes initialized:', zoomKeyframesShared.value);

  // Called when a marker is dragged/updated
  const handleOverlayChange = (updated, index) => {
    const keyframes = [...(overlays.value || [])];
    keyframes[index] = { ...keyframes[index], ...updated };
    overlays.value = keyframes;
  };

  // Unified handler for both marker and zoom changes
  const handleChange = (transform, index) => {
    console.log('🔄 handleChange called with:', transform, 'index:', index, 'gestureMode:', gestureModeShared.value);
    // Check if this is a zoom transform (has scale property) or marker transform
    if (transform.hasOwnProperty('scale')) {
      // This is a zoom transform
      console.log('🔍 Updating zoom keyframe:', index, transform);
      const keyframes = [...(zoomKeyframesShared.value || [])];
      keyframes[index] = { ...keyframes[index], ...transform };
      zoomKeyframesShared.value = keyframes;
    } else {
      // This is a marker transform
      console.log('📍 Updating marker keyframe:', index, transform);
      const keyframes = [...(overlays.value || [])];
      keyframes[index] = { ...keyframes[index], ...transform };
      overlays.value = keyframes;
    }
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

  /* ===== Intro-Spotlight freeze-frame ===== */
  const freezeDuration = overlays.value[0]?.freezeDuration ?? 1;
  const seekTo = (t) => {
    if (videoRef.current?.seek) {
        videoRef.current.seek(t);
    }
    };

  const isIntroPreview = useDerivedValue(() =>
    isIntro && isPreview.value
    );

  useAnimatedReaction(
    () => isIntroPreview.value,
    (previewing) => {
        if (!previewing) return;

        // 0️⃣ reset to first frame & pause (seek on JS thread)
        runOnJS(seekTo)(trimStart);
        currentTime.value = trimStart;
        paused.value      = true;

        // 1️⃣ animate dummy value → when finished, un-pause
        freezeProgress.value = 0;   // reset
        freezeProgress.value = withTiming(
        1,
        { duration: freezeDuration * 1000 },
        (/* finished */) => {
            'worklet';
            paused.value = false;   // runs on UI thread, perfectly shareable
        }
        );
    },
    []
  );

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
            zoom={zoomKeyframesShared.value[currentZoomKeyframeIndex.value]?.scale ?? 1}
            x={zoomKeyframesShared.value[currentZoomKeyframeIndex.value]?.x ?? 0}
            y={zoomKeyframesShared.value[currentZoomKeyframeIndex.value]?.y ?? 0}
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
            currentKeyframeIndex={activeKeyframeIndex}
            videoLayout={videoLayout}
            resizeMode="cover"
            gestureModeShared={gestureModeShared}
            overlays={overlays}
            onChange={handleChange}
            videoNaturalWidthShared={videoNaturalWidthShared}
            videoNaturalHeightShared={videoNaturalHeightShared}
        />
        </View>

        {/* Controls */}
        <ScrollView 
            style={{ backgroundColor: '#111' }}
            contentContainerStyle={[
                isIntro && { flexDirection: 'column', alignItems: 'center' },
                { justifyContent: 'center', paddingVertical: 10, paddingBottom: 20 }
            ]}
            showsVerticalScrollIndicator={false}
        >
            <TouchableOpacity
                onPress={() => {
                if (typeof onFinish === 'function') {
                    if (isIntro) {
                        // In intro mode, pass both marker and zoom data
                        const result = {
                            markerKeyframes: overlays.value,
                            zoomKeyframes: zoomKeyframesShared.value
                        };
                        onFinish(result);
                        console.log("📤 Finishing intro editor with:", JSON.stringify(result));
                    } else {
                        // In guided mode, just pass marker data
                        onFinish(overlays.value);
                        console.log("📤 Finishing guided editor with overlays.value:", JSON.stringify(overlays.value));
                    }
                }
                }}
                style={[styles.button, styles.finishButton]}
            >
                <Text style={styles.buttonText}>✅ Done</Text>
            </TouchableOpacity>
            {isIntro && (
                <>
                    {/* Frame Selection Section */}
                    <View style={{ width: '90%', marginBottom: 20 }}>
                        <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 8, fontSize: 16, fontWeight: '600' }}>
                            Select Frame
                        </Text>
                        <Slider
                            minimumValue={trimStart}
                            maximumValue={trimEnd}
                            step={0.01}
                            value={frameTimestampUI}
                            onValueChange={(val) => {
                                setFrameTimestampUI(val);
                                overlays.value = [{ ...overlays.value[0], timestamp: val }];
                                currentTime.value = val;
                                videoRef.current?.seek?.(val);
                            }}
                            style={{ width: '100%', height: 40 }}
                            thumbTintColor="#fff"
                            minimumTrackTintColor="#3498db"
                            maximumTrackTintColor="#555"
                        />
                        <Text style={{ color: '#aaa', fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                            Freeze frame at: {frameTimestampUI.toFixed(2)}s
                        </Text>
                    </View>

                    {/* Freeze Duration Section */}
                    <View style={{ width: '90%', marginBottom: 20 }}>
                        <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 12, fontSize: 16, fontWeight: '600' }}>
                            Freeze Duration
                        </Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                            {[0.5, 0.7, 1.0].map((duration) => (
                                <TouchableOpacity
                                    key={duration}
                                    onPress={() => {
                                        setFreezeDurUI(duration);
                                        freezeDurationShared.value = duration;
                                        overlays.value = [{ ...overlays.value[0], freezeDuration: duration }];
                                        // Instant preview at selected frame
                                        videoRef.current?.seek?.(frameTimestampUI);
                                        currentTime.value = frameTimestampUI;
                                    }}
                                    style={{
                                        paddingHorizontal: 12,
                                        paddingVertical: 6,
                                        backgroundColor: Math.abs(freezeDurUI - duration) < 0.1 ? colors.accent1 : '#333',
                                        borderRadius: 16,
                                        borderWidth: 1,
                                        borderColor: Math.abs(freezeDurUI - duration) < 0.1 ? colors.accent1 : '#555',
                                    }}
                                >
                                    <Text style={{ 
                                        color: Math.abs(freezeDurUI - duration) < 0.1 ? '#000' : '#fff',
                                        fontSize: 12,
                                        fontWeight: '500'
                                    }}>
                                        {duration}s
                                    </Text>
                                </TouchableOpacity>
                            ))}
                            <TouchableOpacity
                                onPress={() => {
                                    // TODO: Implement custom duration modal
                                    console.log('Custom duration requested');
                                }}
                                style={{
                                    paddingHorizontal: 12,
                                    paddingVertical: 6,
                                    backgroundColor: '#444',
                                    borderRadius: 16,
                                    borderWidth: 1,
                                    borderColor: '#666',
                                }}
                            >
                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500' }}>
                                    Custom
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </>
            )}

        {/* Gesture Mode Buttons */}
        <View style={{ width: '90%', marginBottom: 16 }}>
            <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 8, fontSize: 16, fontWeight: '600' }}>
                Edit Mode
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
                <TouchableOpacity
                    onPress={() => {
                    gestureModeShared.value = 'zoom';
                    // In intro mode, stay at the freeze frame timestamp
                    if (isIntro) {
                        currentTime.value = frameTimestampUI;
                        videoRef.current?.seek?.(frameTimestampUI);
                    } else {
                        // In guided mode, seek to zoom keyframe timestamp
                        const currentZoomKf = zoomKeyframesShared.value[currentZoomKeyframeIndex.value];
                        if (currentZoomKf && Number.isFinite(currentZoomKf.timestamp)) {
                            currentTime.value = currentZoomKf.timestamp;
                            videoRef.current?.seek?.(currentZoomKf.timestamp);
                        }
                    }
                    console.log('🟢 Set gesture mode to ZOOM');
                    }}
                    style={{ 
                        paddingHorizontal: 20, 
                        paddingVertical: 12, 
                        backgroundColor: gestureModeShared.value === 'zoom' ? colors.accent1 : '#444', 
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: gestureModeShared.value === 'zoom' ? colors.accent1 : '#555',
                    }}
                >
                    <Text style={{ 
                        color: gestureModeShared.value === 'zoom' ? '#000' : '#fff',
                        fontSize: 14,
                        fontWeight: '500'
                    }}>
                        🔍 Zoom
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => {
                    gestureModeShared.value = 'marker';
                    // In intro mode, stay at the freeze frame timestamp
                    if (isIntro) {
                        currentTime.value = frameTimestampUI;
                        videoRef.current?.seek?.(frameTimestampUI);
                    } else {
                        // In guided mode, seek to marker keyframe timestamp
                        const currentMarkerKf = overlays.value[currentKeyframeIndex.value];
                        if (currentMarkerKf && Number.isFinite(currentMarkerKf.timestamp)) {
                            currentTime.value = currentMarkerKf.timestamp;
                            videoRef.current?.seek?.(currentMarkerKf.timestamp);
                        }
                    }
                    console.log('🟠 Set gesture mode to MARKER');
                    }}
                    style={{ 
                        paddingHorizontal: 20, 
                        paddingVertical: 12, 
                        backgroundColor: gestureModeShared.value === 'marker' ? colors.accent1 : '#444', 
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: gestureModeShared.value === 'marker' ? colors.accent1 : '#555',
                    }}
                >
                    <Text style={{ 
                        color: gestureModeShared.value === 'marker' ? '#000' : '#fff',
                        fontSize: 14,
                        fontWeight: '500'
                    }}>
                        📍 Marker
                    </Text>
                </TouchableOpacity>
            </View>
        </View>

        {/* Zoom Keyframe Navigation (only show in zoom mode) */}
        {gestureModeShared.value === 'zoom' && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 8 }}>
                <TouchableOpacity
                    onPress={() => {
                        if (currentZoomKeyframeIndex.value > 0) {
                            currentZoomKeyframeIndex.value = currentZoomKeyframeIndex.value - 1;
                            // Seek to the new zoom keyframe timestamp
                            const newZoomKf = zoomKeyframesShared.value[currentZoomKeyframeIndex.value];
                            if (newZoomKf && Number.isFinite(newZoomKf.timestamp)) {
                                currentTime.value = newZoomKf.timestamp;
                                videoRef.current?.seek?.(newZoomKf.timestamp);
                            }
                        }
                    }}
                    style={{ padding: 10, backgroundColor: '#333', marginRight: 8, borderRadius: 6 }}
                >
                    <Text style={{ color: '#fff' }}>◀ Prev Zoom</Text>
                </TouchableOpacity>
                
                <Text style={{ color: '#fff', padding: 10 }}>
                    Zoom Frame {currentZoomKeyframeIndex.value + 1} of {zoomKeyframesShared.value.length}
                </Text>
                
                <TouchableOpacity
                    onPress={() => {
                        if (currentZoomKeyframeIndex.value < zoomKeyframesShared.value.length - 1) {
                            currentZoomKeyframeIndex.value = currentZoomKeyframeIndex.value + 1;
                            // Seek to the new zoom keyframe timestamp
                            const newZoomKf = zoomKeyframesShared.value[currentZoomKeyframeIndex.value];
                            if (newZoomKf && Number.isFinite(newZoomKf.timestamp)) {
                                currentTime.value = newZoomKf.timestamp;
                                videoRef.current?.seek?.(newZoomKf.timestamp);
                            }
                        }
                    }}
                    style={{ padding: 10, backgroundColor: '#333', marginLeft: 8, borderRadius: 6 }}
                >
                    <Text style={{ color: '#fff' }}>Next Zoom ▶</Text>
                </TouchableOpacity>
            </View>
        )}

        {/* Marker Type Selector */}
        <View style={{ width: '90%', marginBottom: 16 }}>
            <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 8, fontSize: 16, fontWeight: '600' }}>
                Marker Type
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                {['circle', 'emoji', 'gif'].map((type, idx) => (
                    <TouchableOpacity
                        key={type}
                        onPress={() => handleSelectMarkerType(type)}
                        style={{
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            backgroundColor: overlays.value[0]?.markerType === type ? colors.accent1 : '#333',
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: overlays.value[0]?.markerType === type ? colors.accent1 : '#555',
                        }}
                    >
                        <Text style={{ 
                            color: overlays.value[0]?.markerType === type ? '#000' : '#fff',
                            fontSize: 14,
                            fontWeight: '500'
                        }}>
                            {type === 'circle' ? '⬤' : type === 'emoji' ? '😊' : '🖼️'} {type.charAt(0).toUpperCase() + type.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
        </ScrollView>
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