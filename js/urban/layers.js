/**
 * Seven analytical layers as exploded groups. Each builder takes the loaded
 * JSON docs and returns a THREE.Group sitting at y = 0; the stack order and
 * spacing come from PARTS[i].explode, which applyDisassembly() in scene.js
 * already knows how to drive.
 */

import * as THREE from 'three';
import { PARTS, COLORS } from '../../data/urban/layers.js';
import { polyMesh, lineSegments, ribbonMesh, extrudeMesh, plateMesh, texturedQuad } from './geo.js';

const Z = { plate: 0, poly: 0.05, poly2: 0.08, poly3: 0.11, line: 0.14, line2: 0.17 };

// Storey height in scene units, and how much L-05 exaggerates it: at true
// scale a 40-storey tower is 40 * STOREY_UNITS ~= 0.13 units tall against a
// 40-unit-wide island — invisible, so the extrusion is boosted ×10.
const STOREY_UNITS = 0.0032;
const HEIGHT_EXAGGERATION = 10;

function plate(d, color = COLORS.plate) {
  return plateMesh(d.coast, { color, outline: COLORS.outline, y: Z.plate });
}

// region.json's box outline runs along the 120 km clip rectangle; those
// frame edges are bake artefacts, not coastline, so drop any run of points
// that lies on the frame before drawing. A segment is "on the frame" when
// both its endpoints sit within 0.5 units of the region bbox's min/max x or z.
function stripRegionFrame(doc) {
  const xs = doc.features.flatMap((f) => f.p.map((pt) => pt[0]));
  const zs = doc.features.flatMap((f) => f.p.map((pt) => pt[1]));
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const onFrame = ([x, z]) =>
    Math.abs(x - minX) < 0.5 || Math.abs(x - maxX) < 0.5 || Math.abs(z - minZ) < 0.5 || Math.abs(z - maxZ) < 0.5;
  const features = [];
  doc.features.forEach((f) => {
    let run = [];
    f.p.forEach((pt, i) => {
      const prev = f.p[i - 1];
      if (prev && onFrame(prev) && onFrame(pt)) {
        if (run.length > 1) features.push({ ...f, p: run });
        run = [pt];
      } else {
        run.push(pt);
      }
    });
    if (run.length > 1) features.push({ ...f, p: run });
  });
  return { ...doc, features };
}

const BUILDERS = {
  'L-01': (d) => {
    const g = new THREE.Group();
    g.add(plate(d));
    g.add(polyMesh(d.parks, { y: Z.poly, colorFn: (f) => COLORS.natural[f.k] ?? COLORS.natural.open }));
    g.add(polyMesh(d.water, { color: COLORS.natural.water, y: Z.poly2 }));
    g.add(lineSegments(d.contours, { color: COLORS.natural.contour, y: Z.line }));
    return g;
  },
  'L-02': (d) => {
    const g = new THREE.Group();
    g.add(plate(d));
    g.add(polyMesh(d.parks, { color: COLORS.landuse.park, y: Z.poly }));
    g.add(polyMesh(d.landuse, {
      y: Z.poly2,
      filter: (f) => f.k !== 'core',
      colorFn: (f) => COLORS.landuse[f.k] ?? COLORS.landuse.mixed,
    }));
    g.add(polyMesh(d.landuse, { color: COLORS.landuse.core, y: Z.poly3, filter: (f) => f.k === 'core' }));
    return g;
  },
  'L-03': (d) => {
    const g = new THREE.Group();
    g.add(plate(d));
    g.add(lineSegments(d.roads, { color: COLORS.transport.secondary, y: Z.line, filter: (f) => f.k === 'secondary' }));
    g.add(ribbonMesh(d.roads, { color: COLORS.transport.primary, y: Z.line2, width: 0.12, filter: (f) => f.k === 'primary' }));
    g.add(ribbonMesh(d.rail, { color: COLORS.transport.rail, y: Z.line2 + 0.02, width: 0.09 }));
    return g;
  },
  'L-04': (d) => {
    const g = new THREE.Group();
    g.add(plate(d));
    g.add(polyMesh(d.growth, { y: Z.poly, colorFn: (f) => COLORS.growth[f.k] ?? COLORS.growth.recent }));
    return g;
  },
  'L-05': (d) => {
    const g = new THREE.Group();
    g.add(plate(d));
    g.add(polyMesh(d.density, {
      y: Z.poly,
      filter: (f) => f.q > 0,
      colorFn: (f) => COLORS.density[f.q],
      opacity: 0.85,
    }));
    // Extruded buildings, height from levels, colour from the density cell
    // they mostly sit in would need a spatial join; use levels directly.
    g.add(extrudeMesh(d.buildings, {
      y: Z.poly2,
      heightFn: (f) => (f.v ?? 4) * STOREY_UNITS * HEIGHT_EXAGGERATION,
      colorFn: (f) => COLORS.density[Math.min(4, Math.floor(((f.v ?? 4) - 1) / 8))],
      filter: (f) => (f.v ?? 4) >= 10,
    }));
    return g;
  },
  'L-06': (d) => {
    const g = new THREE.Group();
    g.add(plate(d));
    g.add(polyMesh(d.fabric, { color: COLORS.fabric, y: Z.poly }));
    return g;
  },
  'L-07': (d) => {
    const g = new THREE.Group();
    const bg = d.satellite?.x
      ? texturedQuad(d.satellite, './data/urban/satellite.jpg', { y: Z.plate - 0.02 })
      : new THREE.Mesh(
          new THREE.PlaneGeometry(240, 240),
          new THREE.MeshBasicMaterial({ color: COLORS.plateRegion, side: THREE.DoubleSide })
        );
    if (!d.satellite?.x) {
      bg.rotation.x = -Math.PI / 2;
      bg.position.y = Z.plate - 0.02;
    }
    bg.userData.isRegionBg = false;
    g.add(bg);
    g.add(lineSegments(stripRegionFrame(d.region), { color: COLORS.region.coast, y: Z.line }));
    g.add(plate(d));
    g.userData.labels = d.region.labels ?? [];
    return g;
  },
};

export function buildLayers(docs) {
  const root = new THREE.Group();
  const groups = new Map();
  PARTS.forEach((p) => {
    const grp = BUILDERS[p.id](docs);
    grp.userData.partId = p.id;
    grp.userData.home = new THREE.Vector3(0, 0, 0);
    grp.userData.explode = new THREE.Vector3(...p.explode);
    grp.userData.paired = false;
    grp.traverse((o) => {
      if (o.isMesh || o.isLineSegments) {
        o.userData.partId = p.id;
        o.userData.noHighlight = !o.userData.isPlate;
      }
    });
    root.add(grp);
    groups.set(p.id, grp);
  });
  return { root, groups };
}

export const LAYER_FILES = [...new Set(PARTS.flatMap((p) => p.files))];
