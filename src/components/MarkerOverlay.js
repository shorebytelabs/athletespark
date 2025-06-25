import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Animated, {
  useDerivedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { interpolateTrackingKeyframes } from '../utils/interpolateTrackingKeyframes';

/**
 * MarkerOverlay
 * --------------
 * ‣ Keeps marker positions in *natural‑video* coordinates (pixels in the source asset).
 * ‣ Converts them to frame space on‑the‑fly using `fitScale` so the same positions work
 *   in any container size and during export.
 */
export const MarkerOverlay = ({
  index,
  overlays,
  interpolate,
  currentTime,
  videoLayout,
  videoNaturalWidthShared,
  videoNaturalHeightShared,
}) => {
  // React‑side state for which graphic to render (circle / emoji / gif).
  const [reactMarkerType, setReactMarkerType] = useState('circle');

  /**
   * Shared marker: derives the *current* marker for this index.
   * If `interpolate` is true we sample the spline; otherwise we take the keyframe directly.
   */
  const markerShared = useDerivedValue(() => {
    const t = currentTime?.value ?? 0;
    const keyframes = overlays?.value ?? [];

    if (keyframes.length === 0) {
      return { x: 100, y: 300, markerType: 'circle' };
    }

    const marker =
      interpolate && Number.isFinite(t)
        ? interpolateTrackingKeyframes(keyframes, t)
        : keyframes[index];

    return {
      x: Number.isFinite(marker?.x) ? marker.x : 100,
      y: Number.isFinite(marker?.y) ? marker.y : 300,
      markerType: marker?.markerType ?? 'circle',
    };
  });

  // Keep React in sync with marker type so we can switch visuals on the JS thread.
  useAnimatedReaction(
    () => markerShared.value.markerType,
    (next, prev) => {
      if (next !== prev) {
        runOnJS(setReactMarkerType)(next);
      }
    },
    []
  );

  /**
   * Animated style — translate natural (x,y) into frame space.
   * Invisible until both layout + natural size are available.
   */
  const style = useAnimatedStyle(() => {
    const layout   = videoLayout?.value;
    const naturalW = videoNaturalWidthShared?.value;
    const naturalH = videoNaturalHeightShared?.value;

    const ready =
      layout &&
      Number.isFinite(layout.frameWidth) &&
      Number.isFinite(layout.frameHeight) &&
      naturalW > 0 &&
      naturalH > 0;

    if (!ready) {
      return {
        position: 'absolute',
        zIndex: -1,
        transform: [{ translateX: -9999 }, { translateY: -9999 }],
      };
    }

    const fitScale = Math.max(
      layout.frameWidth  / naturalW,
      layout.frameHeight / naturalH
    );

    return {
      position: 'absolute',
      left: 0,
      top: 0,
      zIndex: 999,
      transform: [
        { translateX: markerShared.value.x * fitScale },
        { translateY: markerShared.value.y * fitScale },
      ],
    };
  });

  // ---------- Render helpers ---------- //
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
            source={{ uri: 'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif' }}
            style={styles.gif}
          />
        );
      default:
        return <Text style={{ color: 'red' }}>⚠️ Unknown marker</Text>;
    }
  };

  return (
    <Animated.View style={style} pointerEvents="none">
      {renderMarker(reactMarkerType)}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
  },
  emojiContainer: {
    backgroundColor: 'yellow',
    padding: 10,
    borderRadius: 8,
  },
  emoji: {
    fontSize: 36,
    textAlign: 'center',
  },
  gif: {
    width: 60,
    height: 60,
  },
});
