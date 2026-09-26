export const CAMERA_BOUNDS = [[103.45, 1.1], [104.25, 1.55]];
export const DEFAULT_CAMERA = { center: [103.835, 1.345], zoom: 11.5, pitch: 25, bearing: -8 };
export const CATEGORIES = { all: 'All food', hawker: 'Hawker centres', restaurant: 'Restaurants', cafe: 'Cafés', other: 'More food', vegetarian: 'Vegetarian' };
export const LINES = { NS: ['North South', '#f05d69'], EW: ['East West', '#57c28a'], NE: ['North East', '#b28bea'], CC: ['Circle', '#ffc857'], DT: ['Downtown', '#5a9ff2'], TE: ['Thomson–East Coast', '#c99573'] };
export function validPoint(p) {
 return Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(x => typeof x === 'number' && Number.isFinite(x)) && p[0] >= 103.5 && p[0] <= 104.2 && p[1] >= 1.15 && p[1] <= 1.5;
}
export function validateCollection(data, lines = false) {
 if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Invalid map data');
 const ids = new Set();
 for (const f of data.features) {
  const p = f?.properties;
  if (!p || typeof p.id !== 'string' || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim()) throw new Error('Invalid place record');
  ids.add(p.id);
  const g = f.geometry;
  const coords = lines ? (g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' ? g.coordinates : null) : null;
  if (lines ? (!coords?.length || coords.some(line => !Array.isArray(line) || line.length < 2 || !line.every(validPoint))) : (g?.type !== 'Point' || !validPoint(g.coordinates))) throw new Error('Invalid geographic coordinates');
 }
 return data;
}
export function filterPlaces(features, query = '', category = 'all') {
 const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return features.filter(({ properties: p }) => (category === 'all' || (category === 'vegetarian' ? ['vegetarian', 'vegan'].includes(p.diet) : p.category === category)) && words.every(word => [p.name, p.cuisine, p.address, p.codes].filter(Boolean).join(' ').toLocaleLowerCase().includes(word)));
}
export function distance(a, b) {
 const rad = Math.PI / 180, dlat = (b[1] - a[1]) * rad, dlon = (b[0] - a[0]) * rad;
 const h = Math.sin(dlat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dlon / 2) ** 2;
 return 12742 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function nearest(origin, features, count = 3) {
 // ponytail: linear scan plus sort is fine for this island snapshot; use a spatial index if the directory grows beyond 50k places.
 return features.map(feature => ({ feature, km: distance(origin, feature.geometry.coordinates) })).sort((a, b) => a.km - b.km).slice(0, count);
}
export function cameraFromURL(search) {
 const p = new URLSearchParams(search);
 const number = (key, lo, hi, fallback) => {
  const raw = p.get(key), n = raw?.trim() ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
 };
 return { center: [number('lng', CAMERA_BOUNDS[0][0], CAMERA_BOUNDS[1][0], DEFAULT_CAMERA.center[0]), number('lat', CAMERA_BOUNDS[0][1], CAMERA_BOUNDS[1][1], DEFAULT_CAMERA.center[1])], zoom: number('z', 10, 18, DEFAULT_CAMERA.zoom), pitch: number('pitch', 0, 60, DEFAULT_CAMERA.pitch), bearing: number('bearing', -180, 180, DEFAULT_CAMERA.bearing) };
}
