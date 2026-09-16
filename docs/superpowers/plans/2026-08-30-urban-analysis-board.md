# Singapore Urban Analysis Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second page, `urban.html`, that shows Singapore as seven vertically exploded axonometric map layers built from real OpenStreetMap data, driven by the same slider / parts-list / callout machinery as the tank sheet.

**Architecture:** The tank sheet's page wiring (`js/app.js`) becomes `bootSheet({ data, build, theme })` in `js/sheet.js`; `scene.js` takes the geometry builder and colour theme as parameters instead of importing the vehicle. A Python script bakes OSM geometry to scene-unit JSON in `data/urban/`; `js/urban/layers.js` turns that JSON into seven `THREE.Group`s whose `userData.explode` the existing `applyDisassembly` already understands.

**Tech Stack:** three.js 0.164 via import map (no bundler), vanilla ES modules, Python 3.13 + osmnx/geopandas/shapely for the one-off bake, Playwright MCP for browser verification, `python3 -m http.server 8080` to serve.

**Spec:** `docs/superpowers/specs/2026-08-30-urban-analysis-board-design.md`

## Global Constraints

- No build step, no npm in the browser path; three.js stays at `https://unpkg.com/three@0.164.0`.
- Tank sheet (`index.html`) must look and behave exactly as today after every task.
- Scene units: main island spans 40 units east–west; `+X` = east, `+Z` = south (three.js right-handed, Y up), origin at the main-island centroid.
- Layer explode: layer index `i` (VII = 0 … I = 6) gets `explode: [0, i * 6, 0]`.
- Colours exactly as spec §4. Base plate beige `#f3ede2`; layer VII plate `#e9ebee`.
- Every hand-authored analytical polygon carries `"indicative": true` and the UI says so.
- Data files total < 8 MB (spec asked < 6 MB; buildings decide it — see Task 2 ceiling).
- Commit after each task. Commit messages end with the Co-Authored-By / Claude-Session trailer already used in this repo.
- Serve with `python3 -m http.server 8080 --bind 127.0.0.1` from the repo root when verifying in a browser.

---

### Task 1: Parameterise the scene and page wiring (tank sheet unchanged)

**Files:**
- Modify: `js/scene.js:12-18` (imports/constants), `js/scene.js:19-35` (renderer/scene/camera), `js/scene.js:46-83` (grid, materials, vehicle, edges), `js/scene.js:110-116` (isolate), `js/scene.js:118-128` (blueprint)
- Modify: `js/ui.js:9-13` (import → parameter)
- Create: `js/sheet.js` (moved body of `js/app.js`)
- Modify: `js/app.js` (becomes a 12-line entry)
- Create: `js/themes.js`

**Interfaces:**
- Produces: `createScene(canvas, { build, theme })` where `build(materials) → { root: THREE.Group, groups: Map<string, THREE.Group> }` and `theme = { clear, fog: {near, far} | null, grid: {size, div, c1, c2} | null, edge: {color, opacity} | null, camera: [x,y,z], target: [x,y,z], minDistance, maxDistance, maxPolarAngle }`.
- Produces: `createUI({ onSelect, data })` where `data = { PARTS, GROUPS, PART_BY_ID }`.
- Produces: `bootSheet({ data, build, theme })` from `js/sheet.js`; `data` additionally needs `SHEET`.
- Produces: `TANK_THEME` from `js/themes.js`.

- [ ] **Step 1: Record the baseline**

Start the server if not running, open `http://127.0.0.1:8080/` with the Playwright MCP, take a screenshot `baseline-tank.png` into the scratchpad directory, and read the console: the only error allowed is the `favicon.ico` 404. Count `.callout` nodes with `browser_evaluate`: `document.querySelectorAll('.callout').length` → expected **23**.

- [ ] **Step 2: Create `js/themes.js`**

```js
/**
 * Per-sheet scene colours and camera. The tank sheet is the dark blueprint;
 * other sheets supply their own object with the same keys.
 */
export const TANK_THEME = {
  clear: 0x070f18,
  fog: { near: 28, far: 62 },
  grid: { size: 60, div: 60, c1: 0x1d4258, c2: 0x122d3d },
  edge: { color: 0x5cc8f2, opacity: 0.55 },
  camera: [12.5, 7.5, 14],
  target: [0, 1.6, 0],
  minDistance: 6,
  maxDistance: 55,
  maxPolarAngle: Math.PI * 0.52,
  select: { color: 0xf2a33c, emissive: 0x6b3d05 },
};
```

- [ ] **Step 3: Thread `build` and `theme` through `js/scene.js`**

Replace lines 10–35 (imports through `controls.target.set`) with:

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyDisassembly } from './parts.js';

export function createScene(canvas, { build, theme }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(theme.clear, 1);

  const scene = new THREE.Scene();
  if (theme.fog) scene.fog = new THREE.Fog(theme.clear, theme.fog.near, theme.fog.far);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
  camera.position.set(...theme.camera);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = theme.minDistance;
  controls.maxDistance = theme.maxDistance;
  controls.maxPolarAngle = theme.maxPolarAngle;
  controls.target.set(...theme.target);
```

Replace the ground-grid block (lines 46–49) with:

```js
  // ---- Ground grid ------------------------------------------------------
  const grid = theme.grid
    ? new THREE.GridHelper(theme.grid.size, theme.grid.div, theme.grid.c1, theme.grid.c2)
    : null;
  if (grid) scene.add(grid);
```

Replace the vehicle block (lines 64–69) with:

```js
  // ---- Model ------------------------------------------------------------
  const { root, groups } = build(materials);
  scene.add(root);
```

and move the `root.position.y = -0.16;` line into `buildVehicle` in `js/parts.js` just before `return { root, groups };` (as `root.position.y = -0.16;` with its existing comment) — the offset is the tank's business, not the scene's.

Replace the edge-overlay block (lines 71–82) with:

```js
  // ---- Edge overlay -----------------------------------------------------
  // One LineSegments per mesh, parented to the mesh so it follows every
  // disassembly move for free. Sheets whose lines are their own edges
  // (maps) pass edge: null and skip this.
  const edgeMat = new THREE.LineBasicMaterial({
    color: theme.edge?.color ?? 0xffffff,
    transparent: true,
    opacity: theme.edge?.opacity ?? 0.55,
  });
  const edges = [];
  if (theme.edge) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const seg = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), edgeMat);
      seg.userData.isEdge = true;
      o.add(seg);
      edges.push(seg);
    });
  }
```

Replace the highlight material (lines 85–90) with:

```js
  const highlightMat = new THREE.MeshStandardMaterial({
    color: theme.select.color,
    emissive: theme.select.emissive,
    roughness: 0.5,
    metalness: 0.1,
  });
```

In `setIsolated`, change `grid.visible = true;` to `if (grid) grid.visible = true;`.

In `setBlueprint`, change `edgeMat.opacity = on ? 0.95 : 0.55;` to `edgeMat.opacity = on ? 0.95 : theme.edge?.opacity ?? 0.55;`.

Delete the now-unused `INK`, `LINE`, `SELECT` constants.

- [ ] **Step 4: Make `js/ui.js` take its data as a parameter**

Replace line 9 `import { PARTS, GROUPS, PART_BY_ID } from '../data/bom.js';` with nothing, and change the signature to:

```js
export function createUI({ onSelect, data }) {
  const { PARTS, GROUPS, PART_BY_ID } = data;
```

- [ ] **Step 5: Move `js/app.js` into `js/sheet.js` as `bootSheet`**

Create `js/sheet.js` with the whole current body of `js/app.js` wrapped as follows. Keep every line of the current file except the three import lines for scene/callouts/ui/bom and the two top-level `createScene`/`createUI` calls, which become:

```js
/**
 * Page wiring shared by every sheet. Owns the single piece of shared state —
 * which part is selected — and keeps the scene, the parts list and the
 * callouts pointed at the same answer.
 */

import * as THREE from 'three';
import { createScene } from './scene.js';
import { createCallouts } from './callouts.js';
import { createUI } from './ui.js';

export function bootSheet({ data, build, theme }) {
  const { PARTS, SHEET } = data;
  const canvas = document.getElementById('field');
  const api = createScene(canvas, { build, theme });

  const callouts = createCallouts(
    document.getElementById('callout-layer'),
    document.getElementById('leader-layer'),
    PARTS,
    api
  );

  let selected = null;
  let isolated = null;

  const ui = createUI({ onSelect: select, data });

  // … everything from `function select(partId)` down to `tick();` exactly as
  // it is in js/app.js today, unchanged …

  return api;
}
```

Then replace `js/app.js` entirely with:

```js
/**
 * Entry point for the TPZ-77 general arrangement sheet.
 */
import { bootSheet } from './sheet.js';
import { buildVehicle } from './parts.js';
import { TANK_THEME } from './themes.js';
import * as bom from '../data/bom.js';

bootSheet({ data: bom, build: buildVehicle, theme: TANK_THEME });
```

`data/bom.js` already exports `PARTS`, `GROUPS`, `SHEET` and `PART_BY_ID` (confirm with `grep -n '^export' data/bom.js`; if `PART_BY_ID` is missing add `export const PART_BY_ID = Object.fromEntries(PARTS.map((p) => [p.id, p]));`).

- [ ] **Step 6: Verify the tank sheet is unchanged**

Reload `http://127.0.0.1:8080/` in the Playwright MCP. Expect: console has only the favicon 404; `document.querySelectorAll('.callout').length === 23`; screenshot visually matches `baseline-tank.png` (same camera, same colours, grid present). Drag the slider: `document.getElementById('disassembly').value = 100; document.getElementById('disassembly').dispatchEvent(new Event('input'))` then screenshot — parts must be spread as before.

- [ ] **Step 7: Commit**

```bash
git add js/scene.js js/ui.js js/sheet.js js/app.js js/themes.js js/parts.js
git commit -m "Parameterise scene builder and theme; move page wiring to bootSheet"
```

---

### Task 2: Bake Singapore geometry from OpenStreetMap

**Files:**
- Create: `tools/bake_urban.py`
- Create: `tools/requirements.txt`
- Create: `data/urban/growth.src.json` (hand-authored lon/lat polygons)
- Create: `data/urban/region_labels.json` (hand-authored)
- Create (generated, committed): `data/urban/{coast,water,parks,contours,landuse,roads,rail,buildings,density,growth,region}.json`
- Modify: `.gitignore` (create if absent) — add `tools/.venv/` and `tools/.cache/`

**Interfaces:**
- Produces: every generated file is `{"type": "polys" | "lines", "features": [...]}`. A `polys` feature is `{"p": [[[x, z], ...outerRing], [[x, z], ...hole], ...], "k": "<kind>", "v": <number|null>, "n": "<name|null>"}`. A `lines` feature is `{"p": [[x, z], ...], "k": "<kind>", "n": "<name|null>"}`. Coordinates are scene units (floats, 2 dp). `density.json` features carry `"v"` = raw score and `"q"` = quantile 0–4. `growth.json` features carry `"indicative": true`. `region.json` also carries a top-level `"labels": [{"x", "z", "t"}]`.
- Produces: `python3 tools/bake_urban.py --check` exits 0 when every file is valid.

- [ ] **Step 1: Write the check first (`tools/bake_urban.py` skeleton with `--check`)**

```python
#!/usr/bin/env python3
"""
Bake Singapore geometry from OpenStreetMap into scene-unit JSON for the
urban analysis board. Run once; the outputs in data/urban/ are committed.

    python3 tools/bake_urban.py          # download + bake (needs network)
    python3 tools/bake_urban.py --check  # validate existing outputs only

Scene units: the main island spans 40 units east-west, origin at the main
island centroid, +x east, +z south (three.js Y-up right-handed). All files
share one {type, features} shape; see FILES below.
"""
import argparse
import json
import math
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "urban"
ISLAND_WIDTH_UNITS = 40.0
BOUND = 80.0
REGION_BOUND = 260.0

FILES = {
    "coast": "polys", "water": "polys", "parks": "polys", "contours": "lines",
    "landuse": "polys", "roads": "lines", "rail": "lines", "buildings": "polys",
    "density": "polys", "growth": "polys", "region": "lines",
}


def check() -> int:
    bad = 0
    for name, kind in FILES.items():
        path = OUT / f"{name}.json"
        if not path.exists():
            print(f"MISSING {path}")
            bad += 1
            continue
        doc = json.loads(path.read_text())
        feats = doc.get("features", [])
        if doc.get("type") != kind:
            print(f"{name}: type {doc.get('type')!r} != {kind!r}")
            bad += 1
        if not feats and name != "contours":
            print(f"{name}: no features")
            bad += 1
        limit = REGION_BOUND if name == "region" else BOUND
        for f in feats:
            rings = f["p"] if kind == "polys" else [f["p"]]
            for ring in rings:
                for x, z in ring:
                    if abs(x) > limit or abs(z) > limit:
                        print(f"{name}: coordinate ({x}, {z}) outside ±{limit}")
                        bad += 1
                        break
        if name == "growth" and any(not f.get("indicative") for f in feats):
            print("growth: every feature must be indicative")
            bad += 1
        size = path.stat().st_size / 1e6
        print(f"ok {name:10s} {len(feats):6d} features {size:5.2f} MB")
    total = sum((OUT / f"{n}.json").stat().st_size for n in FILES if (OUT / f"{n}.json").exists()) / 1e6
    print(f"total {total:.2f} MB")
    if total > 8:
        print("total exceeds 8 MB")
        bad += 1
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.check:
        return check()
    return bake()


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run the check to see it fail**

Run: `python3 tools/bake_urban.py --check`
Expected: `MISSING …/data/urban/coast.json` (×11), exit code 1.

- [ ] **Step 3: Hand-author the two source files**

`data/urban/growth.src.json` — lon/lat rings, WGS84, roughly traced around URA Master Plan growth areas. These are indicative outlines, not planning boundaries:

```json
{
  "features": [
    {"n": "Punggol Digital District", "k": "recent", "ll": [[103.905,1.415],[103.925,1.415],[103.925,1.400],[103.905,1.400]]},
    {"n": "Bidadari", "k": "recent", "ll": [[103.868,1.343],[103.882,1.343],[103.882,1.332],[103.868,1.332]]},
    {"n": "Tengah", "k": "future", "ll": [[103.720,1.375],[103.755,1.375],[103.755,1.345],[103.720,1.345]]},
    {"n": "Jurong Lake District", "k": "future", "ll": [[103.720,1.345],[103.745,1.345],[103.745,1.325],[103.720,1.325]]},
    {"n": "Paya Lebar Air Base", "k": "future", "ll": [[103.895,1.375],[103.925,1.375],[103.925,1.350],[103.895,1.350]]},
    {"n": "Greater Southern Waterfront", "k": "renewal", "ll": [[103.780,1.275],[103.850,1.275],[103.850,1.262],[103.780,1.262]]},
    {"n": "Kampong Bugis", "k": "renewal", "ll": [[103.862,1.312],[103.872,1.312],[103.872,1.305],[103.862,1.305]]},
    {"n": "Woodlands Regional Centre", "k": "future", "ll": [[103.775,1.445],[103.795,1.445],[103.795,1.430],[103.775,1.430]]}
  ]
}
```

`data/urban/region_labels.json`:

```json
{"labels": [
  {"lon": 103.76, "lat": 1.49, "t": "JOHOR BAHRU"},
  {"lon": 104.05, "lat": 1.05, "t": "BATAM"},
  {"lon": 104.45, "lat": 0.95, "t": "BINTAN"},
  {"lon": 103.60, "lat": 1.20, "t": "STRAIT OF SINGAPORE"},
  {"lon": 103.80, "lat": 1.44, "t": "STRAIT OF JOHOR"}
]}
```

- [ ] **Step 4: Write `bake()`**

Add to `tools/bake_urban.py`, above `main()`:

```python
def bake() -> int:
    import geopandas as gpd
    import osmnx as ox
    from shapely.geometry import box, mapping, shape
    from shapely.ops import unary_union

    ox.settings.use_cache = True
    ox.settings.cache_folder = str(Path(__file__).parent / ".cache")
    ox.settings.log_console = True

    CRS = "EPSG:3414"  # SVY21 / Singapore TM, metres
    OUT.mkdir(parents=True, exist_ok=True)

    # ---- Coastline / island polygons ---------------------------------------
    sg = ox.geocode_to_gdf("Singapore").to_crs(CRS)
    land = sg.geometry.iloc[0]
    parts = sorted(getattr(land, "geoms", [land]), key=lambda g: -g.area)
    main = parts[0]
    cx, cy = main.centroid.x, main.centroid.y
    minx, _, maxx, _ = main.bounds
    scale = ISLAND_WIDTH_UNITS / (maxx - minx)

    def xz(x, y):  # projected metres -> scene units; +z is south
        return [round((x - cx) * scale, 2), round(-(y - cy) * scale, 2)]

    def ring(coords):
        return [xz(x, y) for x, y in coords]

    def poly_feats(geoms, kinds=None, vals=None, names=None, tol=20.0, min_area=0.0):
        out = []
        for i, g in enumerate(geoms):
            if g is None or g.is_empty:
                continue
            g = g.simplify(tol, preserve_topology=True)
            for p in getattr(g, "geoms", [g]):
                if p.geom_type != "Polygon" or p.area < min_area:
                    continue
                rings = [ring(p.exterior.coords)] + [ring(h.coords) for h in p.interiors]
                out.append({
                    "p": rings,
                    "k": kinds[i] if kinds is not None else None,
                    "v": vals[i] if vals is not None else None,
                    "n": names[i] if names is not None else None,
                })
        return out

    def line_feats(geoms, kinds=None, names=None, tol=20.0):
        out = []
        for i, g in enumerate(geoms):
            if g is None or g.is_empty:
                continue
            g = g.simplify(tol, preserve_topology=True)
            for l in getattr(g, "geoms", [g]):
                if l.geom_type != "LineString":
                    continue
                out.append({
                    "p": ring(l.coords),
                    "k": kinds[i] if kinds is not None else None,
                    "n": names[i] if names is not None else None,
                })
        return out

    def write(name, kind, feats, extra=None):
        doc = {"type": kind, "features": feats}
        if extra:
            doc.update(extra)
        (OUT / f"{name}.json").write_text(json.dumps(doc, separators=(",", ":")))
        print(f"wrote {name}: {len(feats)} features")

    write("coast", "polys", poly_feats(parts, tol=25.0, min_area=50_000))

    def features(tags):
        gdf = ox.features_from_place("Singapore", tags)
        gdf = gdf[gdf.geometry.notna()].to_crs(CRS)
        return gdf

    # ---- Water ------------------------------------------------------------
    water = features({"natural": ["water"], "waterway": ["river", "canal"]})
    water = water[water.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    write("water", "polys", poly_feats(list(water.geometry), min_area=20_000))

    # ---- Parks ------------------------------------------------------------
    parks = features({"leisure": ["park", "nature_reserve", "garden"],
                      "landuse": ["forest", "grass", "recreation_ground"]})
    parks = parks[parks.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    kinds = []
    for _, r in parks.iterrows():
        if r.get("leisure") == "nature_reserve" or r.get("landuse") == "forest":
            kinds.append("forest")
        elif r.get("leisure") in ("park", "garden"):
            kinds.append("park")
        else:
            kinds.append("open")
    write("parks", "polys", poly_feats(list(parks.geometry), kinds=kinds, min_area=15_000))

    # ---- Contours (optional) ---------------------------------------------
    contours = []
    try:
        import numpy as np
        import rasterio
        from rasterio import features as rfeatures
        import elevation  # noqa: F401  (SRTM download helper)
        dem = Path(__file__).parent / ".cache" / "sg_dem.tif"
        if not dem.exists():
            import subprocess
            subprocess.run(["eio", "clip", "-o", str(dem), "--bounds",
                            "103.6", "1.2", "104.1", "1.5"], check=True)
        with rasterio.open(dem) as src:
            arr = src.read(1).astype(float)
            from skimage import measure
            for level in range(20, 180, 20):
                for c in measure.find_contours(arr, level):
                    pts = [src.xy(r, cc) for r, cc in c[::4]]
                    ls = gpd.GeoSeries([shape({"type": "LineString", "coordinates": pts})],
                                       crs=src.crs).to_crs(CRS).iloc[0]
                    contours += line_feats([ls], kinds=[str(level)], tol=30.0)
    except Exception as e:  # contours are decorative; never block the bake
        print(f"contours skipped: {e}")
    write("contours", "lines", contours)

    # ---- Land use ---------------------------------------------------------
    lu = features({"landuse": ["residential", "commercial", "retail", "industrial"],
                   "amenity": ["university", "hospital", "school", "college"]})
    lu = lu[lu.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    kmap = {"residential": "residential", "commercial": "commercial",
            "retail": "commercial", "industrial": "mixed"}
    kinds = []
    for _, r in lu.iterrows():
        if isinstance(r.get("amenity"), str):
            kinds.append("institutional")
        else:
            kinds.append(kmap.get(r.get("landuse"), "mixed"))
    lu_feats = poly_feats(list(lu.geometry), kinds=kinds, min_area=30_000)
    # Primary urban core: CBD + Marina Bay, one hand-picked box (lon/lat).
    core_ll = box(103.840, 1.270, 103.870, 1.300)
    core = gpd.GeoSeries([core_ll], crs="EPSG:4326").to_crs(CRS).iloc[0].intersection(main)
    lu_feats += poly_feats([core], kinds=["core"], names=["Central Business District"], tol=10.0)
    write("landuse", "polys", lu_feats)

    # ---- Roads ------------------------------------------------------------
    G = ox.graph_from_place("Singapore", network_type="drive", simplify=True)
    edges = ox.graph_to_gdfs(G, nodes=False).to_crs(CRS)
    def road_kind(h):
        h = h[0] if isinstance(h, list) else h
        if h in ("motorway", "trunk", "primary", "motorway_link", "trunk_link"):
            return "primary"
        if h in ("secondary", "tertiary"):
            return "secondary"
        return None
    edges["k"] = edges["highway"].map(road_kind)
    edges = edges[edges["k"].notna()]
    write("roads", "lines", line_feats(list(edges.geometry), kinds=list(edges["k"]), tol=15.0))

    # ---- Rail -------------------------------------------------------------
    rail = features({"railway": ["subway", "light_rail"]})
    rail = rail[rail.geometry.geom_type.isin(["LineString", "MultiLineString"])]
    names = [r.get("name") if isinstance(r.get("name"), str) else None for _, r in rail.iterrows()]
    write("rail", "lines", line_feats(list(rail.geometry), names=names, tol=15.0))

    # ---- Buildings --------------------------------------------------------
    # ponytail: whole-island footprints are the size ceiling. If the total
    # passes 8 MB, raise min_area or drop footprints outside a central bbox.
    b = features({"building": True})
    b = b[b.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    def levels(v):
        try:
            return max(1, int(float(str(v).split(";")[0])))
        except Exception:
            return 4
    lv = [levels(v) for v in b.get("building:levels", [None] * len(b))]
    write("buildings", "polys", poly_feats(list(b.geometry), vals=lv, tol=3.0, min_area=150.0))

    # ---- Density hex grid -------------------------------------------------
    R = 500.0  # metres, hex circumradius
    dx, dy = 1.5 * R, math.sqrt(3) * R
    bx0, by0, bx1, by1 = main.bounds
    cells = []
    col = 0
    x = bx0
    while x < bx1 + R:
        y = by0 - (dy / 2 if col % 2 else 0)
        while y < by1 + R:
            hexagon = shape({"type": "Polygon", "coordinates": [[
                (x + R * math.cos(math.radians(60 * k)), y + R * math.sin(math.radians(60 * k)))
                for k in range(7)]]})
            if hexagon.intersects(main):
                cells.append(hexagon)
            y += dy
        x += dx
        col += 1
    grid = gpd.GeoDataFrame(geometry=cells, crs=CRS)
    b["score"] = b.geometry.area * lv
    joined = gpd.sjoin(b[["score", "geometry"]], grid, how="inner", predicate="intersects")
    score = joined.groupby("index_right")["score"].sum()
    grid["v"] = score.reindex(grid.index).fillna(0.0)
    nz = grid["v"][grid["v"] > 0]
    qs = nz.quantile([0.2, 0.4, 0.6, 0.8]).tolist()
    def quant(v):
        return 0 if v <= 0 else 1 + sum(v > q for q in qs)
    feats = poly_feats(list(grid.geometry), vals=[round(v) for v in grid["v"]], tol=1.0)
    for f, v in zip(feats, grid["v"]):
        f["q"] = quant(v)
    write("density", "polys", feats)

    # ---- Growth areas (hand-authored, indicative) --------------------------
    src = json.loads((OUT / "growth.src.json").read_text())["features"]
    polys = gpd.GeoSeries([shape({"type": "Polygon", "coordinates": [f["ll"] + [f["ll"][0]]]})
                           for f in src], crs="EPSG:4326").to_crs(CRS)
    feats = poly_feats(list(polys), kinds=[f["k"] for f in src], names=[f["n"] for f in src], tol=5.0)
    for f in feats:
        f["indicative"] = True
    write("growth", "polys", feats)

    # ---- Regional context -------------------------------------------------
    bbox = (104.7, 0.75, 103.2, 1.75)  # north, south, east, west order for osmnx<2; see below
    try:
        coast = ox.features_from_bbox(bbox=(103.2, 0.75, 104.7, 1.75), tags={"natural": "coastline"})
    except TypeError:
        coast = ox.features_from_bbox(1.75, 0.75, 104.7, 103.2, tags={"natural": "coastline"})
    coast = coast[coast.geometry.geom_type.isin(["LineString", "MultiLineString"])].to_crs(CRS)
    labels = json.loads((OUT / "region_labels.json").read_text())["labels"]
    pts = gpd.GeoSeries.from_xy([l["lon"] for l in labels], [l["lat"] for l in labels],
                                crs="EPSG:4326").to_crs(CRS)
    lab = [{"t": l["t"], "x": xz(p.x, p.y)[0], "z": xz(p.x, p.y)[1]} for l, p in zip(labels, pts)]
    write("region", "lines", line_feats(list(coast.geometry), tol=60.0), extra={"labels": lab})
    return 0
```

- [ ] **Step 5: Add `tools/requirements.txt` and `.gitignore`**

`tools/requirements.txt`:

```
osmnx>=1.9
geopandas>=0.14
shapely>=2.0
```

Append to `.gitignore` (create if missing):

```
tools/.venv/
tools/.cache/
```

- [ ] **Step 6: Run the bake**

```bash
python3 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements.txt
tools/.venv/bin/python tools/bake_urban.py
```

Expected: `wrote coast … wrote region` lines; contours will print `contours skipped: …` unless `elevation`/`rasterio`/`scikit-image` are installed (that is fine). Whole-island buildings take several minutes and ~1 GB RAM. If `features_from_place` for buildings times out, rerun — osmnx caches responses.

- [ ] **Step 7: Run the check**

Run: `python3 tools/bake_urban.py --check`
Expected: `ok <name>` for all eleven files, `total X.XX MB` ≤ 8, exit 0. If the total exceeds 8 MB, raise `min_area` for buildings to 250 and re-bake.

- [ ] **Step 8: Commit**

```bash
git add tools/ data/urban/ .gitignore
git commit -m "Bake Singapore OSM geometry to scene-unit JSON for the urban board"
```

---

### Task 3: Layer geometry builder

**Files:**
- Create: `js/urban/geo.js` (JSON → three.js geometry helpers, no layer knowledge)
- Create: `js/urban/layers.js` (the seven layer builders)
- Create: `data/urban/layers.js` (SHEET / GROUPS / PARTS / OBSERVATIONS / colours)
- Create: `js/urban/geo.test.html` (browser-run assertion page)

**Interfaces:**
- Consumes: JSON shapes from Task 2.
- Produces (`js/urban/geo.js`): `loadAll(names) → Promise<Record<name, doc>>` (a failed fetch resolves to `{type, features: [], failed: true}`); `polyMesh(doc, { color, y, filter, colorFn }) → THREE.Mesh`; `lineSegments(doc, { color, y, filter }) → THREE.LineSegments`; `ribbonMesh(doc, { color, y, width, filter }) → THREE.Mesh`; `extrudeMesh(doc, { y, heightFn, colorFn }) → THREE.Mesh`; `plateMesh(coastDoc, { color, y }) → THREE.Group` (island fill + outline).
- Produces (`js/urban/layers.js`): `buildLayers(data) → { root, groups }` matching `build(materials)` from Task 1 (materials ignored). Each group has `userData.partId`, `userData.home = Vector3(0,0,0)`, `userData.explode = Vector3(0, i*6, 0)`.
- Produces (`data/urban/layers.js`): `SHEET`, `GROUPS`, `PARTS` (7 entries with `id: 'L-01'…'L-07'`, `group: 'layers'`, `name`, `qty: 1`, `material`, `mass`, `explode`, `spec`, `note`, `legend: [{swatch, label}]`, `files: [names]`), `PART_BY_ID`, `OBSERVATIONS: [{title, text}]`, `COLORS`.

- [ ] **Step 1: Write `data/urban/layers.js`**

```js
/**
 * The seven analytical layers of the Singapore urban analysis board.
 *
 * Geometry comes from OpenStreetMap via tools/bake_urban.py. Analytical
 * classifications (growth areas, the "core" box, density scores) are derived
 * or hand-traced and are marked indicative in the copy below.
 *
 * Layer order: L-01 is the top of the exploded stack, L-07 the bottom.
 */

export const SHEET = {
  designation: 'SINGAPORE',
  type: 'MULTI-DIMENSIONAL URBAN ANALYSIS',
  subtitle: 'Exploded axonometric · Seven analytical layers',
  docNo: 'SG-UA-001',
  rev: 'A',
  scale: '1 : 100 000',
  sheet: '01 / 01',
  status: 'ANALYTICAL',
};

export const COLORS = {
  plate: 0xf3ede2,
  plateRegion: 0xe9ebee,
  outline: 0x6b665c,
  natural: { forest: 0x7fb872, park: 0xa9cf9a, open: 0xcfe3c4, water: 0x8ccfc6, contour: 0xd9d9d9 },
  landuse: {
    residential: 0xe8562a, commercial: 0xf2a08a, mixed: 0x9b6fc3,
    institutional: 0x4a7fd1, park: 0x8cc27a, core: 0xd9480f,
  },
  transport: { primary: 0x111111, rail: 0x8e44ad, secondary: 0x3b6fd1 },
  growth: { recent: 0xf6b87a, future: 0xe8731a, renewal: 0xf29c8a },
  density: [0xdbe9f7, 0x9ec3e6, 0x5e96d1, 0x2f66b3, 0x123c80],
  fabric: 0x111111,
  region: { land: 0xd8dbcf, coast: 0x8a8f99 },
};

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export const GROUPS = [{ id: 'layers', label: 'Analysis layers' }];

export const PARTS = [
  {
    id: 'L-01', group: 'layers', name: 'Natural systems', qty: 1,
    material: 'OSM parks, reserves, water · SRTM contours', mass: 'Layer I',
    explode: [0, 36, 0], files: ['coast', 'water', 'parks', 'contours'],
    spec: 'The green and blue skeleton the city is built around: the central catchment reserves, the coastal parks, the reservoirs and the canalised rivers that drain them.',
    note: 'Contours are decorative and may be absent from the bake. Park kinds follow OSM tagging, which is uneven outside the major reserves.',
    legend: [
      { swatch: hex(0x7fb872), label: 'Nature reserve / forest' },
      { swatch: hex(0xa9cf9a), label: 'Park / garden' },
      { swatch: hex(0xcfe3c4), label: 'Open green' },
      { swatch: hex(0x8ccfc6), label: 'Water body' },
      { swatch: hex(0xd9d9d9), label: 'Contour (20 m)' },
    ],
  },
  {
    id: 'L-02', group: 'layers', name: 'Land use functions', qty: 1,
    material: 'OSM landuse + amenity polygons', mass: 'Layer II',
    explode: [0, 30, 0], files: ['coast', 'landuse', 'parks'],
    spec: 'Functional zoning: the housing estates ringing the island, industrial Jurong and Tuas mapped as mixed, institutional campuses, and the CBD / Marina Bay core in deep orange.',
    note: 'The core box is hand-picked, not an official boundary. OSM landuse coverage is partial for commercial areas.',
    legend: [
      { swatch: hex(0xe8562a), label: 'Residential' },
      { swatch: hex(0xf2a08a), label: 'Commercial / office' },
      { swatch: hex(0x9b6fc3), label: 'Mixed / industrial' },
      { swatch: hex(0x4a7fd1), label: 'Institutional' },
      { swatch: hex(0x8cc27a), label: 'Park / open' },
      { swatch: hex(0xd9480f), label: 'Primary urban core' },
    ],
  },
  {
    id: 'L-03', group: 'layers', name: 'Transportation & connectivity', qty: 1,
    material: 'OSM drive network · MRT / LRT ways', mass: 'Layer III',
    explode: [0, 24, 0], files: ['coast', 'roads', 'rail'],
    spec: 'Expressways stitch the island east–west and north–south; the MRT network radiates from the core and loops through the new towns.',
    note: 'Primary = motorway, trunk and primary tags. Secondary = secondary and tertiary. Local streets are omitted for legibility.',
    legend: [
      { swatch: hex(0x111111), label: 'Expressway / primary road' },
      { swatch: hex(0x3b6fd1), label: 'Secondary road' },
      { swatch: hex(0x8e44ad), label: 'MRT / LRT line' },
    ],
  },
  {
    id: 'L-04', group: 'layers', name: 'Development evolution', qty: 1,
    material: 'Hand-traced from URA Master Plan regions', mass: 'Layer IV',
    explode: [0, 18, 0], files: ['coast', 'growth'],
    spec: 'Where the city is growing: recent completions in the north-east, planned towns in the west, and the renewal corridor along the southern waterfront.',
    note: 'INDICATIVE. Outlines are approximate boxes traced by hand for this board, not planning boundaries.',
    legend: [
      { swatch: hex(0xf6b87a), label: 'Recent growth area' },
      { swatch: hex(0xe8731a), label: 'Future growth area' },
      { swatch: hex(0xf29c8a), label: 'Redevelopment / renewal corridor' },
    ],
  },
  {
    id: 'L-05', group: 'layers', name: 'Building height & density', qty: 1,
    material: 'OSM footprints × building:levels, 500 m hex grid', mass: 'Layer V',
    explode: [0, 12, 0], files: ['coast', 'density', 'buildings'],
    spec: 'Floor-area intensity per hexagonal cell. The deepest blue marks the core and the tallest HDB towns; the periphery fades to pale blue.',
    note: 'Untagged buildings assume four storeys, so the map undercounts towers where OSM lacks level data.',
    legend: [
      { swatch: hex(0xdbe9f7), label: 'Low density' },
      { swatch: hex(0x9ec3e6), label: '' },
      { swatch: hex(0x5e96d1), label: 'Medium' },
      { swatch: hex(0x2f66b3), label: '' },
      { swatch: hex(0x123c80), label: 'Highest density' },
    ],
  },
  {
    id: 'L-06', group: 'layers', name: 'Urban fabric', qty: 1,
    material: 'OSM building footprints', mass: 'Layer VI',
    explode: [0, 6, 0], files: ['coast', 'buildings'],
    spec: 'Figure-ground: fine-grained shophouse blocks in the centre against the coarse slab-and-tower grain of the new towns and the industrial mega-blocks of the west.',
    note: 'Footprints under 150 m² are dropped by the bake to keep the file small.',
    legend: [{ swatch: hex(0x111111), label: 'Building footprint' }],
  },
  {
    id: 'L-07', group: 'layers', name: 'Regional context', qty: 1,
    material: 'OSM coastlines, 120 km box', mass: 'Layer VII',
    explode: [0, 0, 0], files: ['coast', 'region'],
    spec: 'Singapore sits at the tip of the Malay Peninsula, across the Strait of Johor from Johor Bahru and across the Singapore Strait from Batam and Bintan.',
    note: 'Coastlines only; the neighbouring land is not filled.',
    legend: [
      { swatch: hex(0x8a8f99), label: 'Regional coastline' },
      { swatch: hex(0xf3ede2), label: 'Singapore' },
    ],
  },
];

export const PART_BY_ID = Object.fromEntries(PARTS.map((p) => [p.id, p]));

export const OBSERVATIONS = [
  { title: 'Green core, built ring', text: 'The central catchment sits at the centre of every layer; housing, roads and density all wrap around it.' },
  { title: 'Core aligns across layers', text: 'The deep-orange core in II, the road convergence in III and the deepest blue in V all fall on the same footprint.' },
  { title: 'Growth moves outward', text: 'Recent and future areas in IV are on the periphery — Punggol, Tengah, Woodlands — while renewal follows the old waterfront.' },
  { title: 'Grain tells history', text: 'VI reads fine in the centre and coarse in the new towns: the block size is a proxy for era.' },
];
```

- [ ] **Step 2: Write the browser test page `js/urban/geo.test.html`**

A tiny page that imports `geo.js`, builds geometry from an inline fixture and asserts; opened in the Playwright MCP, it writes PASS/FAIL to the document and console.

```html
<!DOCTYPE html>
<meta charset="utf-8" />
<title>geo.js checks</title>
<script type="importmap">
  {"imports": {"three": "https://unpkg.com/three@0.164.0/build/three.module.js",
               "three/addons/": "https://unpkg.com/three@0.164.0/examples/jsm/"}}
</script>
<pre id="out"></pre>
<script type="module">
  import * as THREE from 'three';
  import { polyMesh, lineSegments, ribbonMesh, extrudeMesh } from './geo.js';

  const square = { type: 'polys', features: [
    { p: [[[0, 0], [2, 0], [2, 2], [0, 2]]], k: 'a', v: 3 },
    { p: [[[5, 5], [6, 5], [6, 6], [5, 6]]], k: 'b', v: 1 },
  ]};
  const path = { type: 'lines', features: [{ p: [[0, 0], [1, 0], [1, 1]], k: 'primary' }] };

  const results = [];
  const check = (name, ok) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);

  const m = polyMesh(square, { color: 0xff0000, y: 0.5 });
  check('polyMesh builds a mesh', m.isMesh);
  check('polyMesh sits at y', m.position.y === 0.5);
  m.geometry.computeBoundingBox();
  check('polyMesh spans both squares', m.geometry.boundingBox.max.x >= 6 - 1e-6);

  const f = polyMesh(square, { color: 0xff0000, y: 0, filter: (ft) => ft.k === 'a' });
  f.geometry.computeBoundingBox();
  check('filter drops feature b', f.geometry.boundingBox.max.x <= 2 + 1e-6);

  const ls = lineSegments(path, { color: 0, y: 0 });
  check('lineSegments has 2 segments (4 verts)', ls.geometry.attributes.position.count === 4);

  const rb = ribbonMesh(path, { color: 0, y: 0, width: 0.2 });
  check('ribbon is a mesh with faces', rb.isMesh && rb.geometry.index.count >= 12);

  const ex = extrudeMesh(square, { y: 0, heightFn: (ft) => ft.v, colorFn: () => 0x123456 });
  ex.geometry.computeBoundingBox();
  check('extrude height follows heightFn', Math.abs(ex.geometry.boundingBox.max.y - 3) < 1e-6);
  check('extrude has vertex colours', Boolean(ex.geometry.attributes.color));

  document.getElementById('out').textContent = results.join('\n');
  console.log(results.join('\n'));
</script>
```

- [ ] **Step 3: Open the test page and see it fail**

Navigate the Playwright MCP to `http://127.0.0.1:8080/js/urban/geo.test.html`. Expected: console error "Failed to fetch dynamically imported module" / 404 for `geo.js`.

- [ ] **Step 4: Write `js/urban/geo.js`**

```js
/**
 * Turns the baked scene-unit JSON (see tools/bake_urban.py) into three.js
 * geometry. Knows nothing about layers or colours beyond what it is handed.
 *
 * Every builder merges all features into ONE geometry so a layer costs a
 * handful of draw calls, not thousands.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DATA_DIR = './data/urban/';

export async function loadAll(names) {
  const docs = await Promise.all(
    names.map(async (n) => {
      try {
        const r = await fetch(`${DATA_DIR}${n}.json`);
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

export function plateMesh(coastDoc, { color, outline, y = 0 }) {
  const grp = new THREE.Group();
  grp.add(polyMesh(coastDoc, { color, y }));
  const ring = { type: 'lines', features: coastDoc.features.map((f) => ({ p: [...f.p[0], f.p[0][0]] })) };
  grp.add(lineSegments(ring, { color: outline, y: y + 0.02 }));
  return grp;
}
```

Note on `flat()` + extrude: `rotateX(-π/2)` maps shape `+Z` (depth) to scene `+Y` and shape `+Y` to scene `−Z`; `toShape` already negated Z, so north stays north. The test in Step 2 checks the extrude height lands on `+Y`.

- [ ] **Step 5: Run the test page**

Reload `http://127.0.0.1:8080/js/urban/geo.test.html`. Expected: eight `PASS` lines, no `FAIL`, no console errors.

- [ ] **Step 6: Write `js/urban/layers.js`**

```js
/**
 * Seven analytical layers as exploded groups. Each builder takes the loaded
 * JSON docs and returns a THREE.Group sitting at y = 0; the stack order and
 * spacing come from PARTS[i].explode, which applyDisassembly() in parts.js
 * already knows how to drive.
 */

import * as THREE from 'three';
import { PARTS, COLORS } from '../../data/urban/layers.js';
import { polyMesh, lineSegments, ribbonMesh, extrudeMesh, plateMesh } from './geo.js';

const Z = { plate: 0, poly: 0.05, poly2: 0.08, poly3: 0.11, line: 0.14, line2: 0.17 };

function plate(d, color = COLORS.plate) {
  return plateMesh(d.coast, { color, outline: COLORS.outline, y: Z.plate });
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
      heightFn: (f) => (f.v ?? 4) * 0.0032 * 10,
      colorFn: (f) => COLORS.density[Math.min(4, Math.floor(((f.v ?? 4) - 1) / 8))],
      filter: (f) => (f.v ?? 4) >= 10,
    }));
    return g;
  },
  'L-06': (d) => {
    const g = new THREE.Group();
    g.add(plate(d));
    g.add(polyMesh(d.buildings, { color: COLORS.fabric, y: Z.poly }));
    return g;
  },
  'L-07': (d) => {
    const g = new THREE.Group();
    const size = 240;
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ color: COLORS.plateRegion, side: THREE.DoubleSide })
    );
    bg.rotation.x = -Math.PI / 2;
    bg.position.y = Z.plate - 0.02;
    g.add(bg);
    g.add(lineSegments(d.region, { color: COLORS.region.coast, y: Z.line }));
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
      if (o.isMesh || o.isLineSegments) o.userData.partId = p.id;
    });
    root.add(grp);
    groups.set(p.id, grp);
  });
  return { root, groups };
}

export const LAYER_FILES = [...new Set(PARTS.flatMap((p) => p.files))];
```

Height note: spec says `levels × 0.0032` units; with 1 unit ≈ 1.25 km that makes a 40-storey tower 0.13 units — invisible. The `× 10` exaggeration is deliberate and labelled in the L-05 `note` in Task 4 Step 3. `ponytail:` a single scalar; make it a slider if anyone asks.

- [ ] **Step 7: Commit**

```bash
git add js/urban/geo.js js/urban/geo.test.html js/urban/layers.js data/urban/layers.js
git commit -m "Urban board: geometry helpers, seven layer builders, layer data"
```

---

### Task 4: The urban page, paper theme and legend UI

**Files:**
- Create: `urban.html`
- Create: `css/urban.css`
- Create: `js/urban/app.js`
- Modify: `js/themes.js` (add `URBAN_THEME`)
- Modify: `js/ui.js:60-93` (legend rows, observations empty state)
- Modify: `js/scene.js` (highlight for unlit materials)

**Interfaces:**
- Consumes: `bootSheet`, `buildLayers`, `loadAll`, `LAYER_FILES`, data module from Task 3.
- Produces: `URBAN_THEME`; `createUI` renders `part.legend` and `data.OBSERVATIONS` when present.

- [ ] **Step 1: Add `URBAN_THEME` to `js/themes.js`**

```js
export const URBAN_THEME = {
  clear: 0xffffff,
  fog: null,
  grid: null,
  edge: null,
  camera: [0, 44, 52],
  target: [0, 18, 0],
  minDistance: 30,
  maxDistance: 180,
  maxPolarAngle: Math.PI * 0.48,
  select: { color: 0xd9480f, emissive: 0x000000 },
};
```

- [ ] **Step 2: Make selection highlight work on unlit map materials**

In `js/scene.js` `setSelected`, replace the traverse body with:

```js
    grp.traverse((o) => {
      if (o.isMesh) {
        originalMats.set(o, o.material);
        o.material = o.material.isMeshStandardMaterial
          ? highlightMat
          : flatHighlight;
      }
    });
```

and add next to `highlightMat`:

```js
  const flatHighlight = new THREE.MeshBasicMaterial({
    color: theme.select.color,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
```

Swapping every mesh of a map layer to one tinted material would erase the map; instead, for unlit sheets highlight only the plate: in `setSelected` skip meshes whose `userData.noHighlight` is set, and in `plateMesh` (`js/urban/geo.js`) mark the fill mesh with `userData.noHighlight = false` and everything else in `buildLayers` with `true`:

```js
// js/urban/layers.js, inside buildLayers after BUILDERS[p.id](docs):
grp.traverse((o) => {
  if (o.isMesh || o.isLineSegments) {
    o.userData.partId = p.id;
    o.userData.noHighlight = !o.userData.isPlate;
  }
});
```

and in `plateMesh`: `const fill = polyMesh(coastDoc, { color, y }); fill.userData.isPlate = true; grp.add(fill);`

In `scene.js` `setSelected`: `if (o.isMesh && !o.userData.noHighlight) { … }`.

- [ ] **Step 3: Legend + observations in `js/ui.js`**

After the `bom__qty` span in the row template add (inside the button):

```js
          ${p.legend ? `<span class="bom__legend">${p.legend.slice(0, 3).map((l) =>
            `<i style="background:${l.swatch}" title="${l.label}"></i>`).join('')}</span>` : ''}
```

Replace the `EMPTY` constant and `showPart` body with:

```js
  const legendList = (legend) =>
    `<ul class="legend">${legend.map((l) =>
      `<li><i style="background:${l.swatch}"></i><span>${l.label}</span></li>`).join('')}</ul>`;

  const EMPTY = data.OBSERVATIONS
    ? `
      <section class="data__block">
        <h4>Key observations</h4>
        ${data.OBSERVATIONS.map((o) => `<p><strong>${o.title}.</strong> ${o.text}</p>`).join('')}
      </section>
      <section class="data__block">
        <h4>Legend — all layers</h4>
        ${PARTS.map((p) => `<h5>${p.id} ${p.name}</h5>${legendList(p.legend)}`).join('')}
      </section>`
    : `
    <p class="data__empty">
      Nothing selected. Pick a row from the parts list, click a component in
      the 3D field, or drag the disassembly slider to take the vehicle apart.
    </p>`;

  function showPart(partId) {
    const p = PART_BY_ID[partId];
    if (!p) {
      panel.innerHTML = EMPTY;
      return;
    }
    panel.innerHTML = `
      <header class="data__head">
        <span class="data__ref">${p.id}</span>
        <h3 class="data__title">${p.name}</h3>
      </header>
      <dl class="data__grid">
        <dt>Quantity</dt><dd>${p.qty}</dd>
        <dt>${p.legend ? 'Source' : 'Construction'}</dt><dd>${p.material}</dd>
        <dt>${p.legend ? 'Position' : 'Mass'}</dt><dd>${p.mass}</dd>
      </dl>
      <section class="data__block">
        <h4>${p.legend ? 'Analysis' : 'Function'}</h4>
        <p>${p.spec}</p>
      </section>
      ${p.legend ? `<section class="data__block"><h4>Legend</h4>${legendList(p.legend)}</section>` : ''}
      <section class="data__block data__block--note">
        <h4>${p.legend ? 'Data note' : 'Maintenance note'}</h4>
        <p>${p.note}</p>
      </section>`;
  }
```

- [ ] **Step 4: Write `js/urban/app.js`**

```js
/**
 * Entry point for the Singapore urban analysis board. Loads the baked
 * geometry first, then boots the shared sheet with a builder that closes
 * over it.
 */
import { bootSheet } from '../sheet.js';
import { URBAN_THEME } from '../themes.js';
import { loadAll } from './geo.js';
import { buildLayers, LAYER_FILES } from './layers.js';
import * as data from '../../data/urban/layers.js';

const docs = await loadAll(LAYER_FILES);
data.PARTS.forEach((p) => {
  if (p.files.some((f) => docs[f].failed)) p.name += ' (data unavailable)';
});
bootSheet({ data, build: () => buildLayers(docs), theme: URBAN_THEME });
```

`p.name +=` mutates a module export's object property, which is allowed (the binding is const, the object is not).

- [ ] **Step 5: Write `urban.html`**

Copy `index.html` and change: `<title>Singapore — Multi-dimensional urban analysis · Exploded layers</title>`; description meta to "Seven exploded axonometric map layers of Singapore built from OpenStreetMap: natural systems, land use, transport, growth, density, fabric and regional context."; stylesheet link `./css/urban.css`; the `ident` block texts to `SINGAPORE`, `MULTI-DIMENSIONAL URBAN ANALYSIS`, `Exploded axonometric · Seven analytical layers`; panel headings `Parts list` → `Analysis layers`, `Component data` → `Observations &amp; legend`; canvas aria-label "Exploded axonometric map layers of Singapore"; scale bar label `5 km`; the hint text to "Drag to rotate · scroll to zoom · right-drag to pan · click a layer for its legend · Esc to deselect"; preset labels `Assembled/Service/Full` → `Stacked/Spread/Exploded`; the Blueprint switch label → `Translucent`; script `./js/urban/app.js`. Add a north arrow inside `.field` right after the scale bar:

```html
          <svg class="north" viewBox="0 0 40 60" aria-label="North" role="img">
            <polygon points="20,4 30,40 20,32 10,40" fill="#1a1a1a" />
            <text x="20" y="56" text-anchor="middle" font-size="12" font-family="inherit" fill="#1a1a1a">N</text>
          </svg>
```

Add a cross-link in both pages' `.ident__sub`: in `index.html` append ` · <a href="./urban.html">Urban board →</a>`; in `urban.html` append ` · <a href="./index.html">← TPZ-77 sheet</a>`.

- [ ] **Step 6: Write `css/urban.css`**

Import the sheet styles and override tokens for paper. Minimalist-ui direction: warm monochrome, no gradients, no shadows, typographic contrast does the work.

```css
/* Singapore urban analysis board — paper theme over the shared sheet. */
@import url('./sheet.css');

:root {
  --ink: #ffffff;
  --plate: #faf8f4;
  --plate-2: #faf8f4;
  --rule: #d9d4ca;
  --rule-soft: #e8e4dc;
  --line: #1a1a1a;
  --text: #1a1a1a;
  --dim: #6d6a63;
  --dimmer: #9c988f;
  --amber: #d9480f;
}

body {
  background: var(--ink);
  -webkit-font-smoothing: auto;
}

/* Subtle paper grain, once, behind everything. */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.045;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
}

.sheet__head { background: var(--plate); }
.callout { background: rgba(255, 255, 255, 0.92); border-color: var(--rule); }
.leader { stroke: var(--dim); }
.leader.is-selected { stroke: var(--amber); }
.hint { color: var(--dimmer); }

.north {
  position: absolute;
  right: 20px;
  bottom: 44px;
  width: 28px;
  height: 42px;
}

.bom__legend { display: inline-flex; gap: 3px; margin-left: 6px; }
.bom__legend i,
.legend i {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1px solid var(--rule);
}
.legend { list-style: none; margin: 4px 0 0; padding: 0; }
.legend li { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.data__block h5 { margin: 10px 0 2px; font-size: 11px; color: var(--dim); font-weight: 500; }

@media (prefers-color-scheme: dark) {
  /* The board is a paper artefact; it stays light in every scheme. */
}
```

If `sheet.css` hardcodes colours that leak (check `grep -n '#0\|#1\|rgba' css/sheet.css`), override those selectors here the same way rather than editing `sheet.css`.

- [ ] **Step 7: Verify in the browser**

Navigate to `http://127.0.0.1:8080/urban.html`. Expected:
- console: favicon 404 only;
- `document.querySelectorAll('.callout').length === 7`;
- `document.querySelectorAll('.bom__row').length === 7`;
- screenshot `urban-0.png`: a white page with the beige island visible in the field, seven callouts, observations + legend in the right panel;
- run `document.getElementById('disassembly').value = 100; document.getElementById('disassembly').dispatchEvent(new Event('input'))`, screenshot `urban-100.png`: seven plates spread vertically, regional plate at the bottom;
- click callout `L-05`: the right panel shows its legend and the plate tints orange.

Then reload `http://127.0.0.1:8080/` and confirm the tank sheet still renders with 23 callouts and no new errors.

- [ ] **Step 8: Commit**

```bash
git add urban.html css/urban.css js/urban/app.js js/themes.js js/ui.js js/scene.js js/urban/geo.js js/urban/layers.js index.html
git commit -m "Urban board page: paper theme, legend UI, north arrow, cross-links"
```

---

### Task 5: Polish pass against the brief, README

**Files:**
- Modify: `README.md`
- Modify: `js/urban/layers.js` (only if the screenshot review demands tuning)
- Modify: `js/themes.js` `URBAN_THEME.camera/target` (only if framing is off)

- [ ] **Step 1: Composition review**

Take `urban-100.png` and compare against the brief's composition list: seven layers on one vertical axis, generous gaps, left modules with number/title/description/legend, right observations + full legend, scale bar and north arrow at the bottom. Adjust only `URBAN_THEME.camera`/`target` and the `explode` spacing (`data/urban/layers.js`) if layers overlap at 100 % or the top layer leaves the frame. Re-screenshot after each change.

- [ ] **Step 2: README**

Append to `README.md` after the "Running it" section:

```markdown
## Second sheet: Singapore urban analysis board

`urban.html` shows Singapore as seven exploded analytical map layers built
from OpenStreetMap. Same controls as the tank sheet: the disassembly slider
spreads the stack, callouts and list rows select a layer, the right panel
holds observations and the legend.

Geometry is real; the analytical classifications are not authoritative.
Growth areas are hand-traced boxes, the urban core is a hand-picked box,
and density assumes four storeys wherever OSM has no `building:levels`.

### Re-baking the data

```bash
python3 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements.txt
tools/.venv/bin/python tools/bake_urban.py          # downloads OSM, writes data/urban/*.json
python3 tools/bake_urban.py --check                 # validates the committed outputs
```

Contours need `elevation`, `rasterio` and `scikit-image` installed as well;
without them the bake skips the layer and the board renders without contours.
```

- [ ] **Step 3: Final verification**

Run `python3 tools/bake_urban.py --check` (exit 0). In the browser: both pages load with only the favicon 404; tank callouts 23; urban callouts 7; `git status` shows only intended files.

- [ ] **Step 4: Commit**

```bash
git add README.md js/urban/layers.js js/themes.js data/urban/layers.js
git commit -m "Urban board: framing polish and README"
```
