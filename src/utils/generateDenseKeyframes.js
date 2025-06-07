function easeInOutQuad(t) {
  return t < 0.5
    ? 2 * t * t
    : -1 + (4 - 2 * t) * t;
}

/**
 * Converts sparse keyframes to dense interpolated keyframes at 30fps.
 * @param {Array} keyframes - [{ timestamp, x, y, scale }]
 * @param {number} fps - default 30
 * @returns {Array} interpolated [{ time, x, y, scale }]
 */
export function generateDenseKeyframes(keyframes, fps = 30) {
  if (!keyframes || keyframes.length < 2) return keyframes;

  const sorted = [...keyframes].sort((a, b) => a.timestamp - b.timestamp);
  const result = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const kf1 = sorted[i];
    const kf2 = sorted[i + 1];

    const t1 = kf1.timestamp;
    const t2 = kf2.timestamp;
    const duration = t2 - t1;
    const steps = Math.max(1, Math.floor(duration * fps));

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const eased = easeInOutQuad(t);
      result.push({
        time: t1 + t * duration,
        x: kf1.x + (kf2.x - kf1.x) * eased,
        y: kf1.y + (kf2.y - kf1.y) * eased,
        scale: kf1.scale + (kf2.scale - kf1.scale) * eased,
      });
    }
  }

  // Include final keyframe
  const last = sorted[sorted.length - 1];
  result.push({
    time: last.timestamp,
    x: last.x,
    y: last.y,
    scale: last.scale,
  });

  return result;
}