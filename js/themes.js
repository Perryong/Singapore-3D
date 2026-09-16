/**
 * Per-sheet scene colours and camera.
 */
export const URBAN_THEME = {
  clear: 0xffffff,
  fog: null,
  grid: null,
  edge: null,
  // Home view: top-down, north up — the stack reads as a flat composite map.
  camera: [0, 72, 0.1],
  target: [0, 0, 0],
  minDistance: 30,
  maxDistance: 180,
  maxPolarAngle: Math.PI * 0.48,
  select: { color: 0xd9480f, emissive: 0x000000 },
  poster: { azimuth: 30, elevation: 35, fit: 1.12 },
};
