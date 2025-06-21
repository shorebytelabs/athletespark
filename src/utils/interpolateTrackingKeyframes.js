// src/utils/interpolateTrackingKeyframes.js

export function interpolateTrackingKeyframes(keyframes, t) {
  'worklet'; // 👈 This makes it safe to use in useAnimatedStyle

  if (!Array.isArray(keyframes) || keyframes.length < 2) return null;
  const sorted = [...keyframes].sort((a, b) => a.timestamp - b.timestamp);
  let i = 0;
  while (i < sorted.length - 1 && t > sorted[i + 1].timestamp) i++;

  const kf1 = sorted[i];
  const kf2 = sorted[i + 1] || sorted[i];
  const range = kf2.timestamp - kf1.timestamp;
  if (range <= 0 || !Number.isFinite(range)) {
    console.warn('⚠️ Invalid keyframe range', { t, kf1, kf2 });
    return { x: kf1.x, y: kf1.y, markerType: kf1.markerType };
    }

  const alpha = (t - kf1.timestamp) / range;
  const result = {
    x: kf1.x + (kf2.x - kf1.x) * alpha,
    y: kf1.y + (kf2.y - kf1.y) * alpha,
    markerType: kf1.markerType,
  };
  console.warn('🧮 interpolateTrackingKeyframes', { t, alpha, result });
  return result;
}
