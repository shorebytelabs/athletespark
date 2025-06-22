// /src/components/MarkerOverlay.js

import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { interpolateTrackingKeyframes } from '../utils/interpolateTrackingKeyframes';

/**
 * Props:
 * - index: number – keyframe index
 * - overlays: shared value of keyframes
 * - interpolate: boolean – animate position if true
 * - currentTime: shared value – playback timestamp
 * - videoLayout: shared value – container layout { frameWidth, frameHeight }
 * - videoNaturalWidthShared / videoNaturalHeightShared: shared video size
 * - currentKeyframeIndex: shared index (for editing mode)
 */
export const MarkerOverlay = ({
  index,
  overlays,
  interpolate,
  currentTime,
  videoLayout,
  videoNaturalWidthShared,
  videoNaturalHeightShared,
  currentKeyframeIndex,
}) => {
  const style = useAnimatedStyle(() => {
    const layout = videoLayout?.value;
    const naturalW = videoNaturalWidthShared?.value;
    const naturalH = videoNaturalHeightShared?.value;
    const keyframes = overlays?.value;

    if (!layout || !naturalW || !naturalH || !keyframes || keyframes.length === 0) {
      return { display: 'none' };
    }

    const t = currentTime?.value ?? 0;
    const marker =
      interpolate && Number.isFinite(t)
        ? interpolateTrackingKeyframes(keyframes, t)
        : keyframes[index];

    if (!marker || !Number.isFinite(marker.x) || !Number.isFinite(marker.y)) {
      return { display: 'none' };
    }

    const { frameWidth, frameHeight } = layout;
    const fitScale = Math.max(frameWidth / naturalW, frameHeight / naturalH);

    const tx = marker.x * fitScale;
    const ty = marker.y * fitScale;

    return {
      position: 'absolute',
      transform: [{ translateX: tx }, { translateY: ty }],
    };
  });

  const renderMarker = (markerType) => {
    switch (markerType) {
      case 'circle':
        return <View style={styles.circle} />;
      case 'emoji':
        return <Text style={styles.emoji}>🎯</Text>;
      case 'gif':
        return (
          <Image
            source={{ uri: 'https://media.giphy.com/media/xTiTnkY55bGvF7FpKk/giphy.gif' }}
            style={styles.gif}
          />
        );
      default:
        return <View style={styles.circle} />;
    }
  };

  const markerType =
    interpolate && currentTime?.value != null
      ? interpolateTrackingKeyframes(overlays?.value ?? [], currentTime.value)?.markerType
      : overlays?.value?.[index]?.markerType ?? 'circle';

  return (
    <Animated.View style={style} pointerEvents="none">
      {renderMarker(markerType)}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  circle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'red',
    backgroundColor: 'rgba(255,0,0,0.3)',
  },
  emoji: {
    fontSize: 28,
    textAlign: 'center',
  },
  gif: {
    width: 30,
    height: 30,
  },
});
