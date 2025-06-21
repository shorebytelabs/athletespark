// MarkerOverlay.js
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { interpolateTrackingKeyframes } from '../utils/interpolateTrackingKeyframes';

export const MarkerOverlay = ({
  index,
  overlays,
  currentTime,
  videoLayout,
  videoNaturalWidthShared,
  videoNaturalHeightShared,
  interpolate = false,
  currentKeyframeIndex,
}) => {
  const markerStyle = useAnimatedStyle(() => {
    const layout = videoLayout?.value;
    const naturalW = videoNaturalWidthShared?.value;
    const naturalH = videoNaturalHeightShared?.value;
    const t = currentTime.value;

    if (
      !layout ||
      !naturalW || !naturalH ||
      naturalW <= 0 || naturalH <= 0 ||
      !Array.isArray(overlays?.value)
    ) {
      return { opacity: 0 };
    }

    const { frameWidth, frameHeight } = layout;
    const fitScale = Math.max(frameWidth / naturalW, frameHeight / naturalH);

    let x = 0, y = 0, markerType = 'circle';

    if (interpolate) {
      const interpolated = interpolateTrackingKeyframes(overlays.value, t);
      if (
        !interpolated ||
        !Number.isFinite(interpolated.x) ||
        !Number.isFinite(interpolated.y)
      ) {
        console.warn('⚠️ Invalid interpolated marker', { interpolated, t });
        return { opacity: 0 };
      }
      x = interpolated.x;
      y = interpolated.y;
      markerType = interpolated.markerType || 'circle';
    } else {
      const kf = overlays.value[index];
      if (!kf || !Number.isFinite(kf.x) || !Number.isFinite(kf.y)) {
        return { opacity: 0 };
      }
      x = kf.x;
      y = kf.y;
      markerType = kf.markerType || 'circle';
    }

    console.warn('📍 MarkerOverlay', {
      interpolate,
      index,
      x,
      y,
      markerType,
    });

    return {
      position: 'absolute',
      left: x * fitScale - 15,
      top: y * fitScale - 15,
      width: 30,
      height: 30,
      transform: [{ scale: 1 }],
    };
  });

  const renderContent = (markerType) => {
    switch (markerType) {
      case 'circle':
        return <View style={styles.circle} />;
      case 'emoji':
        return <Text style={styles.emoji}>🎯</Text>;
      case 'gif':
        return (
          <Image
            source={require('../../assets/marker.gif')}
            style={styles.gif}
          />
        );
      default:
        return null;
    }
  };

  // Still log basic info in React land
  console.log('🎯 MarkerOverlay props (outside worklet)', {
    interpolate,
    index,
    layout: videoLayout?.value,
    naturalW: videoNaturalWidthShared?.value,
    naturalH: videoNaturalHeightShared?.value,
    currentTime: currentTime?.value,
  });

  const markerType = interpolate
    ? interpolateTrackingKeyframes(overlays?.value ?? [], currentTime.value)?.markerType || 'circle'
    : overlays?.value?.[index]?.markerType || 'circle';

  return <Animated.View style={markerStyle}>{renderContent(markerType)}</Animated.View>;
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
    fontSize: 24,
    textAlign: 'center',
  },
  gif: {
    width: 30,
    height: 30,
  },
});
