export function interpolateSmartZoom(keyframes, currentTime) {
  if (!keyframes || keyframes.length < 2) return null;

  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const before = sorted.filter(kf => kf.time <= currentTime).pop();
  const after = sorted.find(kf => kf.time > currentTime);

  if (!before || !after) return before || after;

  const ratio = (currentTime - before.time) / (after.time - before.time);

  const x = before.x + (after.x - before.x) * ratio;
  const y = before.y + (after.y - before.y) * ratio;
  const zoom = before.zoom + (after.zoom - before.zoom) * ratio;

  return { x, y, zoom };
}
