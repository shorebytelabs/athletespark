export default function interpolateKeyframes(keyframes, currentTime) {
  if (keyframes.length === 0) return { x: 0, y: 0, scale: 1 };

  // find keyframes before and after currentTime
  let before = keyframes[0];
  let after = keyframes[keyframes.length - 1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (keyframes[i].timestamp <= currentTime && keyframes[i + 1].timestamp >= currentTime) {
      before = keyframes[i];
      after = keyframes[i + 1];
      break;
    }
  }

  const range = after.timestamp - before.timestamp;
  const progress = range === 0 ? 0 : (currentTime - before.timestamp) / range;

  return {
    x: before.x + (after.x - before.x) * progress,
    y: before.y + (after.y - before.y) * progress,
    scale: before.scale + (after.scale - before.scale) * progress
  };
}
