// /src/utils/interpolateTrackingKeyframes.js

/**
 * Linearly interpolate marker position at a given time t.
 *
 * @param {Array} keyframes - Array of marker keyframes: { timestamp, x, y, markerType }
 * @param {number} t - Current timestamp (relative to trimmed clip)
 * @returns {{ x: number, y: number, markerType: string } | null}
 */
export function interpolateTrackingKeyframes(keyframes, t) {
  if (!Array.isArray(keyframes) || keyframes.length === 0 || !Number.isFinite(t)) {
    return null;
  }

  // Sort keyframes by timestamp (in case they're out of order)
  const sorted = [...keyframes].sort((a, b) => a.timestamp - b.timestamp);

  // If only one keyframe exists, hold position
  if (sorted.length === 1) {
    const { x, y, markerType } = sorted[0];
    return { x, y, markerType };
  }

  // Before first keyframe — hold first
  if (t <= sorted[0].timestamp) {
    const { x, y, markerType } = sorted[0];
    return { x, y, markerType };
  }

  // After last keyframe — hold last
  if (t >= sorted[sorted.length - 1].timestamp) {
    const { x, y, markerType } = sorted[sorted.length - 1];
    return { x, y, markerType };
  }

  // Interpolate between two keyframes
  for (let i = 0; i < sorted.length - 1; i++) {
    const kf0 = sorted[i];
    const kf1 = sorted[i + 1];

    if (t >= kf0.timestamp && t <= kf1.timestamp) {
      const progress = (t - kf0.timestamp) / (kf1.timestamp - kf0.timestamp);

      const x = kf0.x + (kf1.x - kf0.x) * progress;
      const y = kf0.y + (kf1.y - kf0.y) * progress;
      const markerType = kf0.markerType || 'circle';

      return { x, y, markerType };
    }
  }

  return null;
}
