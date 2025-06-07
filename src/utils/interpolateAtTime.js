function easeInOutQuad(t) {
  return t < 0.5
    ? 2 * t * t
    : -1 + (4 - 2 * t) * t;
}

// For use with dense keyframes during live preview
export function interpolateAtTime(keyframes, currentTime) {
  'worklet';

  if (!keyframes || keyframes.length < 2) {
    return { x: 0, y: 0, scale: 1 };
  }

  let before = keyframes[0];
  let after = keyframes[keyframes.length - 1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    const curr = keyframes[i];
    const next = keyframes[i + 1];
    if (curr.time <= currentTime && next.time >= currentTime) {
      before = curr;
      after = next;
      break;
    }
  }

  const rawT = (currentTime - before.time) / (after.time - before.time);
  const t = Math.max(0, Math.min(rawT, 1));

  return {
    x: before.x + (after.x - before.x) * t,
    y: before.y + (after.y - before.y) * t,
    scale: before.scale + (after.scale - before.scale) * t,
  };
}
