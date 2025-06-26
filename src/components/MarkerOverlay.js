// /src/components/MarkerOverlay.js
import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Animated, {
  useDerivedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { interpolateTrackingKeyframes } from '../utils/interpolateTrackingKeyframes';

/* helpers */
const FALLBACK = { x: 100, y: 300, markerType: 'circle' };
const log = (msg) => console.log(msg);              // plain JS fn → safe with runOnJS

export const MarkerOverlay = ({
  currentKeyframeIndex,
  overlays,
  interpolate,
  currentTime,
  videoLayout,
  videoNaturalWidthShared,
  videoNaturalHeightShared,
}) => {
  /* ------------------------------------------------ marker selection */
  const [reactMarkerType, setReactMarkerType] = useState('circle');

  const markerShared = useDerivedValue(() => {
    const kfs = overlays?.value ?? [];
    if (kfs.length === 0) return FALLBACK;

    if (interpolate) {
      const t = currentTime?.value ?? 0;
      return interpolateTrackingKeyframes(kfs, t) ?? FALLBACK;
    }

    const i  = currentKeyframeIndex?.value ?? 0;
    const kf = kfs[i];
    return {
      x: Number.isFinite(kf?.x) ? kf.x : FALLBACK.x,
      y: Number.isFinite(kf?.y) ? kf.y : FALLBACK.y,
      markerType: kf?.markerType ?? FALLBACK.markerType,
    };
  });

  /* one-time debug */
  useAnimatedReaction(
    () => ({
      ready: (overlays?.value?.length ?? 0) > 0,
      idx:   currentKeyframeIndex?.value ?? -1,
      x:     markerShared.value.x,
      y:     markerShared.value.y,
    }),
    (d, p) => {
      if (d.ready && p?.x !== d.x) {
        runOnJS(log)(`[overlay-ready] idx ${d.idx}  x ${d.x.toFixed(1)}  y ${d.y.toFixed(1)}`);
      }
    },
    []
  );

  useAnimatedReaction(
    () => markerShared.value.markerType,
    (next, prev) => {
      if (next !== prev) runOnJS(setReactMarkerType)(next);
    },
    []
  );

  /* ------------------------------------------------ transform */
  const style = useAnimatedStyle(() => {
    const layout   = videoLayout?.value;
    const natW     = videoNaturalWidthShared?.value;
    const natH     = videoNaturalHeightShared?.value;

    const ready =
      layout &&
      Number.isFinite(layout.frameWidth) &&
      Number.isFinite(layout.frameHeight) &&
      natW > 0 &&
      natH > 0;

    if (!ready) {
      return {
        position: 'absolute',
        zIndex: 999,
        transform: [{ translateX: -9999 }, { translateY: -9999 }],
      };
    }

    /* ----- scale and centering offsets ----- */
    const fit = Math.max(layout.frameWidth / natW, layout.frameHeight / natH);

    const drawnW = natW * fit;
    const drawnH = natH * fit;

    const offsetX = (layout.frameWidth  - drawnW) / 2;  // can be negative
    const offsetY = (layout.frameHeight - drawnH) / 2;  // can be negative

    const tx = offsetX + markerShared.value.x * fit;
    const ty = offsetY + markerShared.value.y * fit;

    return {
      position: 'absolute',
      zIndex: 999,
      transform: [
        { translateX: tx },
        { translateY: ty },
      ],
    };
  });

  /* ------------------------------------------------ visual helpers */
  const renderMarker = (type) => {
    switch (type) {
      case 'circle':
        return <View style={[styles.circle, { backgroundColor: 'rgba(255,0,0,0.6)' }]} />;
      case 'emoji':
        return (
          <View style={styles.emojiContainer}>
            <Text style={styles.emoji}>🎯</Text>
          </View>
        );
      case 'gif':
        return (
          <Image
            source={require('../../assets/gifs/tracking_circle_pink.gif')}
            style={styles.gif}
          />
        );
      default:
        return <Text style={{ color: 'red' }}>⚠️ Unknown</Text>;
    }
  };

  return (
    <Animated.View style={style} pointerEvents="none">
      {renderMarker(reactMarkerType)}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  circle: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#fff' },
  emojiContainer: { backgroundColor: 'yellow', padding: 10, borderRadius: 8 },
  emoji: { fontSize: 36, textAlign: 'center' },
  gif: { width: 60, height: 60 },
});
