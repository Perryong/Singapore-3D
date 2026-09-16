# Singapore Multi-Dimensional Urban Analysis Board — design

**Date:** 2026-08-30  **Status:** approved in chat, pending spec review

## Goal
A second interactive sheet, `urban.html`, presenting Singapore as seven
vertically exploded axonometric map layers (Natural Systems, Land Use,
Transport, Development Evolution, Height & Density, Urban Fabric, Regional
Context) with left analytical modules, right observations + legend, bottom
scale bar and north arrow. Real geography from OpenStreetMap; derived or
indicative data where no open source exists, labelled as such.

Reference brief: the "Singapore Multi-Dimensional Urban Analysis Map" prompt
(colour spec per layer reproduced in §4).

## Decisions
| Question | Answer |
|---|---|
| Geography | Real (OSM / data.gov.sg), baked once to local files |
| Renderer | three.js, reusing the existing scene/callouts/ui |
| Placement | Second page; tank sheet untouched visually |
| Output | Interactive web board; print export out of scope |
| Missing data | Derive (density from footprints) + hand-traced indicative growth areas |
| Prep tooling | Python, `tools/bake_urban.py`, output committed |

## Non-goals
Print/PNG export, sheet switcher, generic sheet engine, live tile fetching.

## §1 Data pipeline — `tools/bake_urban.py`
- Deps: `osmnx`, `geopandas`, `shapely`. Run once; outputs committed.
- CRS: EPSG:3414 (SVY21). Translate origin to island centroid, scale so the
  main island spans ≈40 scene units (≈1 unit = 1.1 km). Store as plain
  `[x, z]` metres-scaled arrays, not lon/lat, so the browser does no
  projection.
- Simplify with Douglas-Peucker, tolerance 20 m; target < 6 MB total.
- Outputs in `data/urban/`:
  - `coast.json` — main island + offshore islands polygons
  - `water.json` — reservoirs, rivers, canals (polygons)
  - `parks.json` — leisure=park, nature_reserve, landuse=grass/forest, tagged `kind`
  - `contours.json` — 20 m SRTM contours if the `elevation` package is available; otherwise empty array (decorative)
  - `landuse.json` — polygons tagged `residential|commercial|mixed|institutional|park|core`; `core` = CBD/Marina Bay hand-picked bbox
  - `roads.json` — `primary` (motorway/trunk/primary) and `secondary` (secondary/tertiary) linestrings
  - `rail.json` — MRT/LRT linestrings with line name
  - `buildings.json` — footprints + `levels` (default 4 where untagged)
  - `density.json` — 500 m hex grid, `value` = Σ(footprint area × levels), plus quantile rank 0–4
  - `growth.json` — hand-authored polygons (Punggol Digital District, Tengah, Jurong Lake District, Greater Southern Waterfront, Paya Lebar Air Base, Bidadari, Kampong Bugis) tagged `recent|future|renewal`, each `"indicative": true`
  - `region.json` — coastlines for Johor and Riau within a 120 km box, plus island name labels
- `--check` flag: assert each file has ≥1 feature and all coordinates lie within ±80 units (±250 for region).

## §2 Geometry — `js/urban/layers.js`
- `buildLayers(materials) → { root, groups }`, same contract as `buildVehicle` in `js/parts.js`, so `applyDisassembly(t)` is reused unchanged.
- Each layer is a `THREE.Group` with `userData.home = (0,0,0)`, `explode = [0, i*6, 0]` for layer index `i` (layer I top → `i = 6`; layer VII bottom → `i = 0`).
- Base plate: main island polygon as `ShapeGeometry`, beige `#f3ede2`, plus a 0.15-unit dark outline. Layer VII plate is light grey `#e9ebee`, 3× extent, with region coastlines.
- Polygons: `ShapeGeometry` with holes, `MeshBasicMaterial` (unlit — paper board). Y-offset per feature class (0.01, 0.02 …) to avoid z-fighting.
- Lines: `LineSegments` + `LineBasicMaterial` for secondary roads, rail, contours. Primary roads: flat ribbon mesh 0.12 units wide (WebGL line width is 1 px).
- Buildings: layer V extrudes by `levels × 0.0032` units and colours by density quantile; layer VI is flat black footprints.
- Picking: each group's meshes carry `userData.partId` as parts.js does today.

## §3 Scene seam — `js/scene.js`
- `createScene(canvas, { build, theme })`. `build` replaces the hardcoded `buildVehicle` import; `theme = { clear, fog, grid, edge, camera, target }`.
- `index.html`/`app.js` pass `{ build: buildVehicle, theme: TANK_THEME }` with today's constants — no visible change.
- Urban theme: `clear #ffffff`, `fog: null`, `grid: null`, `edge: null` (skips the EdgesGeometry overlay), camera at (0, 42, 46) looking at (0, 18, 0), `maxPolarAngle` 0.48π, min/max distance 30/160.
- Selection highlight: reuse the existing orange emissive swap; for `MeshBasicMaterial` set `color` blend instead of `emissive` (guard on `material.emissive`).

## §4 Page & panels — `urban.html`, `css/urban.css`, `data/urban/layers.js`
- `urban.html` mirrors `index.html` structure; title block: "SINGAPORE", "MULTI-DIMENSIONAL URBAN ANALYSIS", doc no `SG-UA-001`, scale "1 : 100 000", status "ANALYTICAL".
- `data/urban/layers.js` exports `SHEET`, `GROUPS = [{id:'layers', label:'Analysis layers'}]`, `PARTS` — seven entries `{id:'L-01'…'L-07', name, explode, spec, note, legend:[{swatch, label}]}` plus `OBSERVATIONS = [{title, text}]` for the right panel's empty state.
- `ui.js`: if `part.legend` exists, render swatch rows under the description in both the list row (collapsed: first 3) and the data panel (all). Empty-state panel renders `OBSERVATIONS` then the union of all legends when the dataset provides them.
- Bottom bar: keep slider, mode buttons, callouts toggle; add a static north-arrow SVG beside the scale bar; scale bar labelled "5 km".
- Colours (from the brief):
  - I Natural: greens `#cfe3c4 / #a9cf9a / #7fb872`, water `#8ccfc6`, contours `#d9d9d9`
  - II Land use: residential `#e8562a`, commercial `#f2a08a`, mixed `#9b6fc3`, institutional `#4a7fd1`, park `#8cc27a`, core `#d9480f`
  - III Transport: primary `#111111` (ribbon), rail `#8e44ad`, secondary `#3b6fd1`
  - IV Evolution: recent `#f6b87a`, future `#e8731a`, renewal `#f29c8a`
  - V Density ramp: `#dbe9f7 → #9ec3e6 → #5e96d1 → #2f66b3 → #123c80`
  - VI Fabric: `#111111` on beige
  - VII Region: plate `#e9ebee`, land `#d8dbcf`, coast line `#8a8f99`
- Page theme: white `#ffffff` body with an inline SVG `feTurbulence` noise at 4 % opacity; ink `#1a1a1a`; panel chrome light grey.

## §5 Error handling
- Missing/failed fetch of a data file: layer renders its base plate only and the callout name gets a "(data unavailable)" suffix. No throw.
- Empty `contours.json` is expected and silent.

## §6 Testing
- `python tools/bake_urban.py --check` — bounds and non-empty assertions.
- Playwright smoke (manual via the run skill): zero console errors except favicon; 7 `.callout` nodes; after setting the slider to 100, layer `L-01` group `position.y ≈ 36`.
- Visual: screenshots at 0 % and 100 %, compared against the brief's composition.

## Files
New: `urban.html`, `css/urban.css`, `js/urban/app.js`, `js/urban/layers.js`, `data/urban/layers.js`, `data/urban/*.json`, `tools/bake_urban.py`, `tools/requirements.txt`.
Modified: `js/scene.js` (builder/theme seam), `js/app.js` (pass builder/theme), `js/ui.js` (legend rows, observations), `README.md` (second sheet + bake instructions).
