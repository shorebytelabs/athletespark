// Returns dense frame-by-frame positions based on keyframes
export function interpolateKeyframes(keyframes, fps = 30) {
  const frames = [];
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    const frameCount = Math.round((b.time - a.time) * fps);
    for (let j = 0; j < frameCount; j++) {
      const t = j / frameCount;
      frames.push({
        time: a.time + t * (b.time - a.time),
        x: a.x + t * (b.x - a.x),
        y: a.y + t * (b.y - a.y),
      });
    }
  }
  return frames;
}
