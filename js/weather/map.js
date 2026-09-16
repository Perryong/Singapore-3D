/**
 * Static top-down Singapore for the weather page: satellite quad + coast
 * slab, orthographic camera looking straight down (north = screen up).
 * The scene never animates — render on load and resize only.
 */
import * as THREE from 'three';
import { loadAll, plateMesh, texturedQuad } from '../urban/geo.js';

// Scene-unit mapping baked into data/urban/satellite.json (linear fit;
// residual Mercator-vs-SVY21 error at this extent is < 0.1 %).
const LON = { min: 103.55, max: 104.15, xMin: -19.89, xMax: 22.7 };
const LAT = { min: 1.13, max: 1.53, zMax: 13.05, zMin: -15.16 }; // lat 1.13 → z 13.05 (south)

export function lonLatToScene(lon, lat) {
  const x = LON.xMin + ((lon - LON.min) / (LON.max - LON.min)) * (LON.xMax - LON.xMin);
  const z = LAT.zMax + ((lat - LAT.min) / (LAT.max - LAT.min)) * (LAT.zMin - LAT.zMax);
  return { x, z };
}

export async function createWeatherMap(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xffffff, 1);

  const scene = new THREE.Scene();
  const docs = await loadAll(['coast', 'satellite']);
  if (docs.satellite?.x) scene.add(texturedQuad(docs.satellite, './data/urban/satellite.jpg', { y: -0.02 }));
  scene.add(plateMesh(docs.coast, { color: 0xf3ede2, side: 0xd9d0bd, outline: 0x6b665c, y: 0 }));

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  cam.up.set(0, 0, -1); // north up
  cam.position.set(1, 100, -1); // roughly the island centre
  cam.lookAt(1, 0, -1);

  const HALF = 23; // island z-extent ~28.2 units + margin fits the tighter axis

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    // Fit the island in both axes: x span ~42.6, z span ~28.2 (satellite bbox).
    const halfW = Math.max(HALF * aspect, 24);
    const halfH = halfW / aspect;
    cam.left = -halfW; cam.right = halfW; cam.top = halfH; cam.bottom = -halfH;
    cam.updateProjectionMatrix();
    render();
    resizeCbs.forEach((cb) => cb());
  }

  function render() { renderer.render(scene, cam); }

  const v = new THREE.Vector3();
  function project(lon, lat) {
    const { x, z } = lonLatToScene(lon, lat);
    v.set(x, 0.4, z).project(cam);
    const r = canvas.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
  }

  const resizeCbs = [];
  window.addEventListener('resize', resize);
  resize();
  return { project, render, onResize: (cb) => resizeCbs.push(cb) };
}
