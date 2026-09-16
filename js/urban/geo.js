/**
 * Turns the baked scene-unit JSON (see tools/bake_urban.py) into three.js
 * geometry. Knows nothing about layers or colours beyond what it is handed.
 *
 * Every builder merges all features into ONE geometry so a layer costs a
 * handful of draw calls, not thousands.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DATA_DIR = new URL('../../data/urban/', import.meta.url);

export async function loadAll(names) {
  const docs = await Promise.all(
    names.map(async (n) => {
      try {
        const r = await fetch(new URL(`${n}.json`, DATA_DIR));
        if (!r.ok) throw new Error(r.statusText);
        return [n, await r.json()];
      } catch (e) {
        console.warn(`urban: ${n}.json unavailable (${e.message})`);
        return [n, { type: 'polys', features: [], failed: true }];
      }
    })
  );
  return Object.fromEntries(docs);
}

// Scene X is east, scene Z is south; a Shape lives in XY so we draw it as
// (x, -z) and rotate the finished geometry flat onto the ground plane.
function toShape(rings) {
  const [outer, ...holes] = rings;
  const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
  holes.forEach((h) => shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z)))));
  return shape;
}

function flat(geo) {
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function empty() {
  return new THREE.BufferGeometry();
}

function features(doc, filter) {
  return filter ? doc.features.filter(filter) : doc.features;
}

export function polyMesh(doc, { color, y = 0, filter, colorFn, opacity = 1 }) {
  const feats = features(doc, filter);
  const geos = feats.map((f) => {
    const g = new THREE.ShapeGeometry(toShape(f.p));
    if (colorFn) {
      const c = new THREE.Color(colorFn(f));
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    return g;
  });
  const merged = geos.length ? flat(mergeGeometries(geos, false)) : empty();
  geos.forEach((g) => g.dispose());
  const mat = new THREE.MeshBasicMaterial({
    color: colorFn ? 0xffffff : color,
    vertexColors: Boolean(colorFn),
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.position.y = y;
  return mesh;
}

export function lineSegments(doc, { color, y = 0, filter, opacity = 1 }) {
  const pts = [];
  features(doc, filter).forEach((f) => {
    for (let i = 0; i < f.p.length - 1; i++) {
      pts.push(f.p[i][0], y, f.p[i][1], f.p[i + 1][0], y, f.p[i + 1][1]);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })
  );
}

// WebGL line width is 1 px, so anything that must read "thick" is a flat
// ribbon: each segment becomes a quad of the requested width.
export function ribbonMesh(doc, { color, y = 0, width = 0.1, filter }) {
  const pos = [];
  const idx = [];
  const half = width / 2;
  features(doc, filter).forEach((f) => {
    for (let i = 0; i < f.p.length - 1; i++) {
      const [ax, az] = f.p[i];
      const [bx, bz] = f.p[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * half;
      const nz = (dx / len) * half;
      const base = pos.length / 3;
      pos.push(ax + nx, y, az + nz, ax - nx, y, az - nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz);
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
}

export function extrudeMesh(doc, { y = 0, heightFn, colorFn, filter }) {
  const feats = features(doc, filter);
  const geos = feats.map((f) => {
    const depth = Math.max(0.01, heightFn(f));
    const g = new THREE.ExtrudeGeometry(toShape(f.p), { depth, bevelEnabled: false });
    // ExtrudeGeometry extrudes along +Z of the shape; after flat() that is +Y.
    const c = new THREE.Color(colorFn(f));
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const merged = geos.length ? flat(mergeGeometries(geos, false)) : empty();
  geos.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshLambertMaterial({ vertexColors: true })
  );
  mesh.position.y = y;
  return mesh;
}

// Satellite bbox docs are {x:[xMin,xMax], z:[zMin,zMax]} in scene units (see
// tools/fetch_satellite.py). The source mosaic is a plain north-up image
// (row 0 = north edge, col 0 = west edge), and PlaneGeometry's default UVs
// plus three's default texture flipY already put image row 0 at the local
// +y edge; flat()'s rotateX(-PI/2) sends local +y to world -z (north), local
// +x stays world +x (east) -- so the default mapping is already correct and
// needs no UV/rotation adjustment or mirroring. Verified against the baked
// data by checking Pulau Tekong renders in the +x/-z (north-east) quadrant.
export function texturedQuad(bboxDoc, url, { y = 0 } = {}) {
  const { x, z } = bboxDoc;
  const geo = flat(new THREE.PlaneGeometry(x[1] - x[0], z[1] - z[0]));
  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  mesh.position.set((x[0] + x[1]) / 2, y, (z[0] + z[1]) / 2);
  return mesh;
}

export const PLATE_DEPTH = 0.35;

export function plateMesh(coastDoc, { color, side = 0xd9d0bd, outline, y = 0 }) {
  const grp = new THREE.Group();
  const geos = coastDoc.features.map((f) =>
    new THREE.ExtrudeGeometry(toShape(f.p), { depth: PLATE_DEPTH, bevelEnabled: false })
  );
  // ExtrudeGeometry groups: 0 = caps, 1 = sides. mergeGeometries(geos, true)
  // does NOT keep that split — three's BufferGeometryUtils assigns
  // materialIndex = source geometry's index in the array (addGroup(offset,
  // count, i)), ignoring each geometry's own groups. So merge without groups
  // and rebuild the cap/side groups ourselves from each source's own groups.
  const merged = geos.length ? flat(mergeGeometries(geos, false)) : empty();
  if (geos.length) {
    let offset = 0;
    geos.forEach((g) => {
      g.groups.forEach((gr) => merged.addGroup(offset + gr.start, gr.count, gr.materialIndex));
      offset += g.attributes.position.count;
    });
  }
  geos.forEach((g) => g.dispose());
  const cap = new THREE.Mesh(merged, [
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ color: side }),
  ]);
  cap.position.y = y - PLATE_DEPTH; // slab top lands at y
  cap.userData.isPlate = true;
  grp.add(cap);
  const ring = { type: 'lines', features: coastDoc.features.map((f) => ({ p: [...f.p[0], f.p[0][0]] })) };
  grp.add(lineSegments(ring, { color: outline, y: y + 0.02 }));
  return grp;
}
