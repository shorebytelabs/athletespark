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
            markerType: (Array.isArray(markerKeyframes) && markerKeyframes.length && markerKeyframes[0]?.markerType) 
                ? markerKeyframes[0].markerType 
                : 'gif', // Default to GIF marker type
            freezeDuration: (Array.isArray(markerKeyframes) && markerKeyframes.length && markerKeyframes[0]?.freezeDuration) 
                ? markerKeyframes[0].freezeDuration 
                : 0.7,   // Use existing freezeDuration or default to 0.7s
        }]
        : (Array.isArray(markerKeyframes) && markerKeyframes.length
            ? markerKeyframes.map(kf => ({ ...kf }))
            : [{ timestamp: trimStart, x: 100, y: 300, markerType: 'circle' }])
  );

  // ① Local React state to mirror the shared value
  const [freezeDurUI, setFreezeDurUI] =
    useState(overlays.value[0]?.freezeDuration ?? 0.7); // Default to 0.7s
  const freezeDurationShared = useSharedValue(freezeDurUI);

  // Collapsible sections state - all start collapsed
  const [frameSelectionExpanded, setFrameSelectionExpanded] = useState(false);
  const [freezeDurationExpanded, setFreezeDurationExpanded] = useState(false);
  const [markerExpanded, setMarkerExpanded] = useState(false);
  const [currentMarkerType, setCurrentMarkerType] = useState(overlays.value[0]?.markerType || 'gif');
  const [isZoomMode, setIsZoomMode] = useState(false);

  // Function to handle tile selection - only one can be expanded at a time
  const handleTilePress = (tileType) => {
    switch (tileType) {
      case 'frame':
        // Toggle frame tile - if already expanded, collapse it
        if (frameSelectionExpanded) {
          setFrameSelectionExpanded(false);
        } else {
          // Close all other tiles and expand frame
          setFreezeDurationExpanded(false);
          setMarkerExpanded(false);
          setFrameSelectionExpanded(true);
        }
        break;
      case 'duration':
        // Toggle duration tile - if already expanded, collapse it
        if (freezeDurationExpanded) {
          setFreezeDurationExpanded(false);
        } else {
          // Close all other tiles and expand duration
          setFrameSelectionExpanded(false);
          setMarkerExpanded(false);
          setFreezeDurationExpanded(true);
        }
        break;
      case 'marker':
        // Toggle marker tile - if already expanded, collapse it
        if (markerExpanded) {
          setMarkerExpanded(false);
        } else {
          // Close all other tiles and expand marker
          setFrameSelectionExpanded(false);
          setFreezeDurationExpanded(false);
          setMarkerExpanded(true);
        }
        break;
    }
  };

  // Function to toggle zoom mode
  const handleToggleZoomMode = () => {
    // Toggle zoom mode without resetting zoom values
    // Zoom values persist throughout the Player Spotlight session
    setIsZoomMode(!isZoomMode);
  };

  // Function to reset zoom values when exiting Player Spotlight editor
  const resetZoomValues = () => {
    // This will be called when exiting the Player Spotlight editor
    // The actual reset happens in VideoPlaybackCanvas
  };

  // Update freezeDurUI when overlays changes (for editing existing markers)
  useEffect(() => {
    if (overlays.value[0]?.freezeDuration && overlays.value[0].freezeDuration !== freezeDurUI) {
      setFreezeDurUI(overlays.value[0].freezeDuration);
      freezeDurationShared.value = overlays.value[0].freezeDuration;
    }
  }, [overlays.value[0]?.freezeDuration]);

  // Update currentMarkerType when overlays changes (for editing existing markers)
  useEffect(() => {
    if (overlays.value[0]?.markerType && overlays.value[0].markerType !== currentMarkerType) {
      setCurrentMarkerType(overlays.value[0].markerType);
    }
  }, [overlays.value[0]?.markerType]);

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
    
    // Update the state to trigger re-render for highlighting
    setCurrentMarkerType(type);

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
        {/* Zoom Mode Button - Only show in Intro mode */}
        {isIntro && (
            <View style={{
                position: 'absolute',
                top: 20,
                right: 20,
                zIndex: 200,
                alignItems: 'flex-end',
            }}>
                <TouchableOpacity
                    onPress={handleToggleZoomMode}
                    style={{
                        backgroundColor: isZoomMode ? colors.accent1 : 'rgba(0, 0, 0, 0.7)',
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: isZoomMode ? colors.accent1 : '#555',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    <Text style={{ 
                        color: isZoomMode ? '#000' : '#fff',
                        fontSize: 16,
                        fontWeight: '600'
                    }}>
                        ⬟
                    </Text>
                    <Text style={{ 
                        color: isZoomMode ? '#000' : '#fff',
                        fontSize: 12,
                        fontWeight: '500'
                    }}>
                        {isZoomMode ? 'Zoom On' : 'Zoom'}
                    </Text>
                </TouchableOpacity>
                
                {/* State indicator when zoom mode is active */}
                {isZoomMode && (
                    <View style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 4,
                        marginTop: 4,
                        borderWidth: 1,
                        borderColor: colors.accent1,
                    }}>
                        <Text style={{ 
                            color: colors.accent1,
                            fontSize: 10,
                            fontWeight: '600'
                        }}>
                            Zoom Mode On
                        </Text>
                    </View>
                )}
            </View>
        )}

        {/* Zoom Mode Message - Positioned below video frame */}
        {isIntro && isZoomMode && (
            <View style={{
                position: 'absolute',
                bottom: 120, // Position below video frame, above controls
                left: 20,
                right: 20,
                zIndex: 200,
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 8,
                borderLeftWidth: 4,
                borderLeftColor: colors.accent1,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
                elevation: 5,
            }}>
                <Text style={{ 
                    color: '#fff',
                    fontSize: 12,
                    textAlign: 'center',
                    lineHeight: 16,
                    fontWeight: '500'
                }}>
                    Zoom is for marker placement only and won't be saved in your final edit.{'\n'}
                    While in Zoom Mode, marker movement is disabled.
                </Text>
            </View>
        )}

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
            // Zoom mode props
            isZoomMode={isZoomMode}
            onResetZoom={resetZoomValues}
        />
        </View>

        {/* Intro Mode - Controls positioned below video */}
        {isIntro && (
            <View style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.95)',
                paddingTop: 16,
                paddingBottom: 20,
                paddingHorizontal: 20,
                zIndex: 100,
            }}>
                {/* Tile Navigation Row */}
                <View style={{ 
                    flexDirection: 'row', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: 16 
                }}>
                    {/* Left side - Control tiles */}
                    <View style={{ flexDirection: 'row', flex: 1, justifyContent: 'space-between', gap: 8 }}>
                        {/* Frame Selection Tile */}
                        <TouchableOpacity
                            onPress={() => handleTilePress('frame')}
                            style={{
                                backgroundColor: frameSelectionExpanded ? colors.accent1 : '#333',
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 10,
                                alignItems: 'center',
                                flex: 1,
                                maxWidth: 110,
                            }}
                        >
                            <Text style={{ 
                                color: frameSelectionExpanded ? '#000' : '#fff',
                                fontSize: 14,
                                marginBottom: 2
                            }}>
                                🎬
                            </Text>
                            <Text style={{ 
                                color: frameSelectionExpanded ? '#000' : '#fff',
                                fontSize: 10,
                                fontWeight: '600',
                                marginBottom: 2
                            }}>
                                Frame
                            </Text>
                            <Text style={{ 
                                color: frameSelectionExpanded ? '#000' : '#aaa',
                                fontSize: 8
                            }}>
                                {frameTimestampUI.toFixed(1)}s
                            </Text>
                        </TouchableOpacity>

                        {/* Freeze Duration Tile */}
                        <TouchableOpacity
                            onPress={() => handleTilePress('duration')}
                            style={{
                                backgroundColor: freezeDurationExpanded ? colors.accent1 : '#333',
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 10,
                                alignItems: 'center',
                                flex: 1,
                                maxWidth: 110,
                            }}
                        >
                            <Text style={{ 
                                color: freezeDurationExpanded ? '#000' : '#fff',
                                fontSize: 14,
                                marginBottom: 2
                            }}>
                                ⏱️
                            </Text>
                            <Text style={{ 
                                color: freezeDurationExpanded ? '#000' : '#fff',
                                fontSize: 10,
                                fontWeight: '600',
                                marginBottom: 2
                            }}>
                                Duration
                            </Text>
                            <Text style={{ 
                                color: freezeDurationExpanded ? '#000' : '#aaa',
                                fontSize: 8
                            }}>
                                {freezeDurUI}s
                            </Text>
                        </TouchableOpacity>

                        {/* Marker Tile */}
                        <TouchableOpacity
                            onPress={() => handleTilePress('marker')}
                            style={{
                                backgroundColor: markerExpanded ? colors.accent1 : '#333',
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 10,
                                alignItems: 'center',
                                flex: 1,
                                maxWidth: 110,
                            }}
                        >
                            <Text style={{ 
                                color: markerExpanded ? '#000' : '#fff',
                                fontSize: 14,
                                marginBottom: 2
                            }}>
                                {gestureModeShared.value === 'marker' ? '📍' : '🔍'}
                            </Text>
                            <Text style={{ 
                                color: markerExpanded ? '#000' : '#fff',
                                fontSize: 10,
                                fontWeight: '600',
                                marginBottom: 2
                            }}>
                                Marker
                            </Text>
                            <Text style={{ 
                                color: markerExpanded ? '#000' : '#aaa',
                                fontSize: 8
                            }}>
                                {currentMarkerType}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Right side - Done button styled as tile */}
                    <TouchableOpacity
                        onPress={() => {
                            // Reset zoom values when exiting Player Spotlight editor
                            // This ensures zoom doesn't persist to main editor
                            if (typeof onFinish === 'function') {
                                const result = {
                                    markerKeyframes: overlays.value,
                                    zoomKeyframes: zoomKeyframesShared.value
                                };
                                onFinish(result);
                                console.log("📤 Finishing intro editor with:", JSON.stringify(result));
                            }
                        }}
                        style={{
                            backgroundColor: '#4CAF50', // Green color to indicate final action
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 10,
                            alignItems: 'center',
                            marginLeft: 12,
                            borderWidth: 1,
                            borderColor: '#66BB6A',
                            maxWidth: 110,
                        }}
                    >
                        <Text style={{ 
                            color: '#fff',
                            fontSize: 14,
                            marginBottom: 2
                        }}>
                            ✅
                        </Text>
                        <Text style={{ 
                            color: '#fff',
                            fontSize: 10,
                            fontWeight: '600',
                            marginBottom: 2
                        }}>
                            DONE
                        </Text>
                        <Text style={{ 
                            color: '#E8F5E8',
                            fontSize: 8
                        }}>
                            SAVE
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Expanded Content - Positioned directly below tile row */}
                {(frameSelectionExpanded || freezeDurationExpanded || markerExpanded) && (
                    <ScrollView 
                        style={{ 
                            maxHeight: 200,
                            marginBottom: 8
                        }}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 10 }}
                    >
                    {frameSelectionExpanded && (
                        <View style={{ 
                            backgroundColor: '#222', 
                            borderRadius: 8, 
                            padding: 12, 
                            marginBottom: 8,
                            minHeight: 100
                        }}>
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500', marginBottom: 8, textAlign: 'center' }}>
                                Select Freeze Frame
                            </Text>
                            <View style={{ flex: 1, justifyContent: 'center' }}>
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
                                    style={{ width: '100%', height: 30 }}
                                    thumbTintColor="#fff"
                                    minimumTrackTintColor="#3498db"
                                    maximumTrackTintColor="#555"
                                />
                                <Text style={{ color: '#aaa', fontSize: 10, textAlign: 'center', marginTop: 6 }}>
                                    Freeze frame at: {frameTimestampUI.toFixed(2)}s
                                </Text>
                            </View>
                        </View>
                    )}

                    {freezeDurationExpanded && (
                        <View style={{ 
                            backgroundColor: '#222', 
                            borderRadius: 8, 
                            padding: 12, 
                            marginBottom: 8,
                            minHeight: 100
                        }}>
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500', marginBottom: 8, textAlign: 'center' }}>
                                Freeze Duration
                            </Text>
                            <View style={{ flex: 1, justifyContent: 'center' }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                                    {[0.5, 0.7, 1.0, 1.5].map((duration) => (
                                        <TouchableOpacity
                                            key={duration}
                                            onPress={() => {
                                                setFreezeDurUI(duration);
                                                freezeDurationShared.value = duration;
                                                overlays.value = [{ ...overlays.value[0], freezeDuration: duration }];
                                                videoRef.current?.seek?.(frameTimestampUI);
                                                currentTime.value = frameTimestampUI;
                                            }}
                                            style={{
                                                paddingHorizontal: 12,
                                                paddingVertical: 6,
                                                backgroundColor: Math.abs(freezeDurUI - duration) < 0.1 ? colors.accent1 : '#444',
                                                borderRadius: 16,
                                                borderWidth: 1,
                                                borderColor: Math.abs(freezeDurUI - duration) < 0.1 ? colors.accent1 : '#666',
                                            }}
                                        >
                                            <Text style={{ 
                                                color: Math.abs(freezeDurUI - duration) < 0.1 ? '#000' : '#fff',
                                                fontSize: 11,
                                                fontWeight: '500'
                                            }}>
                                                {duration}s
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </View>
                    )}

                    {markerExpanded && (
                        <View style={{ 
                            backgroundColor: '#222', 
                            borderRadius: 8, 
                            padding: 12, 
                            marginBottom: 8,
                            minHeight: 100
                        }}>
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500', marginBottom: 8, textAlign: 'center' }}>
                                Marker Settings
                            </Text>
                            
                            <View style={{ flex: 1, justifyContent: 'center' }}>
                                {/* Mode Toggle */}
                                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                                    <TouchableOpacity
                                        onPress={() => {
                                            gestureModeShared.value = 'zoom';
                                            currentTime.value = frameTimestampUI;
                                            videoRef.current?.seek?.(frameTimestampUI);
                                            console.log('🟢 Set gesture mode to ZOOM');
                                        }}
                                        style={{ 
                                            paddingHorizontal: 16, 
                                            paddingVertical: 8, 
                                            backgroundColor: gestureModeShared.value === 'zoom' ? colors.accent1 : '#444', 
                                            borderRadius: 6,
                                            borderWidth: 1,
                                            borderColor: gestureModeShared.value === 'zoom' ? colors.accent1 : '#555',
                                        }}
                                    >
                                        <Text style={{ 
                                            color: gestureModeShared.value === 'zoom' ? '#000' : '#fff',
                                            fontSize: 11,
                                            fontWeight: '500'
                                        }}>
                                            🔍 Zoom
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={() => {
                                            gestureModeShared.value = 'marker';
                                            currentTime.value = frameTimestampUI;
                                            videoRef.current?.seek?.(frameTimestampUI);
                                            console.log('🟠 Set gesture mode to MARKER');
                                        }}
                                        style={{ 
                                            paddingHorizontal: 16, 
                                            paddingVertical: 8, 
                                            backgroundColor: gestureModeShared.value === 'marker' ? colors.accent1 : '#444', 
                                            borderRadius: 6,
                                            borderWidth: 1,
                                            borderColor: gestureModeShared.value === 'marker' ? colors.accent1 : '#555',
                                        }}
                                    >
                                        <Text style={{ 
                                            color: gestureModeShared.value === 'marker' ? '#000' : '#fff',
                                            fontSize: 11,
                                            fontWeight: '500'
                                        }}>
                                            📍 Marker
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Marker Type Selector */}
                                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                                    {['circle', 'emoji', 'gif'].map((type, idx) => (
                                        <TouchableOpacity
                                            key={type}
                                            onPress={() => handleSelectMarkerType(type)}
                                            style={{
                                                paddingHorizontal: 12,
                                                paddingVertical: 6,
                                                backgroundColor: currentMarkerType === type ? colors.accent1 : '#333',
                                                borderRadius: 6,
                                                borderWidth: 1,
                                                borderColor: currentMarkerType === type ? colors.accent1 : '#555',
                                            }}
                                        >
                                            <Text style={{ 
                                                color: currentMarkerType === type ? '#000' : '#fff',
                                                fontSize: 10,
                                                fontWeight: '500'
                                            }}>
                                                {type === 'circle' ? '⬤' : type === 'emoji' ? '😊' : '🖼️'} {type.charAt(0).toUpperCase() + type.slice(1)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </View>
                    )}
                    </ScrollView>
                )}
            </View>
        )}

        {/* Controls for Guided Mode */}
        {!isIntro && (
            <ScrollView 
                style={{ backgroundColor: '#111' }}
                contentContainerStyle={{
                    justifyContent: 'center', 
                    paddingVertical: 10, 
                    paddingBottom: 20
                }}
                showsVerticalScrollIndicator={false}
            >
                {/* Regular Done Button for guided mode */}
                <TouchableOpacity
                    onPress={() => {
                        if (typeof onFinish === 'function') {
                            onFinish(overlays.value);
                            console.log("📤 Finishing guided editor with overlays.value:", JSON.stringify(overlays.value));
                        }
                    }}
                    style={[styles.button, styles.finishButton]}
                >
                    <Text style={styles.buttonText}>✅ Done</Text>
                </TouchableOpacity>

                {/* Gesture Mode Buttons */}
                <View style={{ width: '90%', marginBottom: 16 }}>
                    <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 8, fontSize: 16, fontWeight: '600' }}>
                        Edit Mode
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
                        <TouchableOpacity
                            onPress={() => {
                            gestureModeShared.value = 'zoom';
                            // In guided mode, seek to zoom keyframe timestamp
                            const currentZoomKf = zoomKeyframesShared.value[currentZoomKeyframeIndex.value];
                            if (currentZoomKf && Number.isFinite(currentZoomKf.timestamp)) {
                                currentTime.value = currentZoomKf.timestamp;
                                videoRef.current?.seek?.(currentZoomKf.timestamp);
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
                            // In guided mode, seek to marker keyframe timestamp
                            const currentMarkerKf = overlays.value[currentKeyframeIndex.value];
                            if (currentMarkerKf && Number.isFinite(currentMarkerKf.timestamp)) {
                                currentTime.value = currentMarkerKf.timestamp;
                                videoRef.current?.seek?.(currentMarkerKf.timestamp);
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
        )}
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