const DEBUG = true;

export function catmullRomSpline(p0, p1, p2, p3, t) {
  'worklet';
  const t2 = t * t;
  const t3 = t2 * t;

  const x = 0.5 * (
    2 * p1.x +
    (-p0.x + p2.x) * t +
    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
  );

  const y = 0.5 * (
    2 * p1.y +
    (-p0.y + p2.y) * t +
    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
  );

  const scale = 0.5 * (
    2 * p1.scale +
    (-p0.scale + p2.scale) * t +
    (2 * p0.scale - 5 * p1.scale + 4 * p2.scale - p3.scale) * t2 +
    (-p0.scale + 3 * p1.scale - 3 * p2.scale + p3.scale) * t3
  );

  const clampedScale = Math.max(1, Math.min(10, isFinite(scale) ? scale : 1));
  const safeX = isFinite(x) ? x : 0;
  const safeY = isFinite(y) ? y : 0;

  if (DEBUG && (!isFinite(x) || !isFinite(y) || !isFinite(scale))) {
    console.warn('⚠️ spline invalid output:', { x, y, scale, t });
  }

  return { x: safeX, y: safeY, scale: clampedScale };
}

export function interpolateKeyframesSpline(keyframes, time) {
  'worklet';

  if (!Array.isArray(keyframes) || keyframes.length < 2 || typeof time !== 'number') {
    console.warn('⚠️ interpolateKeyframesSpline: Invalid input', { keyframes, time });
    return { x: 0, y: 0, scale: 1 };
  }

  // Clamp time inside valid keyframe timestamp range
  const getTs = (kf) =>
    typeof kf.timestamp === 'number' ? kf.timestamp :
    typeof kf.time === 'number' ? kf.time :
    NaN;

  const firstTs = getTs(keyframes[0]);
  const lastTs = getTs(keyframes[keyframes.length - 1]);
  const safeTime = Math.max(firstTs, Math.min(lastTs, time));

    // if (DEBUG) {
    // console.log('🧮 Trying to interpolate at time:', safeTime, 'keyframes:', keyframes);
    // }

  // Find the current segment
  let i = keyframes.findIndex((kf) => kf.timestamp > safeTime);
  if (i === -1) i = keyframes.length - 1;
  i = Math.max(1, i);

  const p0 = keyframes[i - 2] || keyframes[i - 1];
  const p1 = keyframes[i - 1];
  const p2 = keyframes[i];
  const p3 = keyframes[i + 1] || p2;

  const t0 = getTs(p1);
  const t1 = getTs(p2);

  if (
    typeof t0 !== 'number' ||
    typeof t1 !== 'number' ||
    !isFinite(t0) ||
    !isFinite(t1) ||
    t1 === t0
   ) {
    console.warn('⚠️ Zero or invalid segment duration for interpolation', { t0, t1 });
    return { x: p1?.x ?? 0, y: p1?.y ?? 0, scale: p1?.scale ?? 1 };
  }

  const t = (safeTime - t0) / (t1 - t0);

  const result = catmullRomSpline(p0, p1, p2, p3, t);

  if (
    typeof result?.x !== 'number' ||
    typeof result?.y !== 'number' ||
    typeof result?.scale !== 'number' ||
    !isFinite(result.scale)
  ) {
    console.warn('⚠️ interpolateKeyframesSpline: Output invalid', result);
    return { x: 0, y: 0, scale: 1 };
  }

  // if (DEBUG) {
  //   console.log('🧮 Interpolating at time:', safeTime, '→ result:', result);
  // }

  return result;
}
