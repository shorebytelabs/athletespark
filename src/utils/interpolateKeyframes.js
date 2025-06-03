function easeInOutQuad(t) {
  return t < 0.5
    ? 2 * t * t
    : -1 + (4 - 2 * t) * t;
}

export default function interpolateKeyframes(keyframes, currentTime) {
  if (!keyframes.length) return { x: 0, y: 0, scale: 1 };

  // Find bounding keyframes
  let before = keyframes[0];
  let after = keyframes[keyframes.length - 1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (
      keyframes[i].timestamp <= currentTime &&
      keyframes[i + 1].timestamp >= currentTime
    ) {
      before = keyframes[i];
      after = keyframes[i + 1];
      break;
    }
  }

  const range = after.timestamp - before.timestamp;
  const rawT = range === 0 ? 0 : (currentTime - before.timestamp) / range;
  const t = easeInOutQuad(Math.max(0, Math.min(rawT, 1)));

  return {
    x: before.x + (after.x - before.x) * t,
    y: before.y + (after.y - before.y) * t,
    scale: before.scale + (after.scale - before.scale) * t,
  };
}
