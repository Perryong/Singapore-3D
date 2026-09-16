# Urban Poster Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `urban.html?view=poster` renders the Singapore board as the reference poster: portrait, fixed axonometric, seven slab layers on one axis with dashed guides, numbered modules left, live circular thumbnails + legend right, ticked scale bar and compass.

**Architecture:** Poster is a *mode* of the existing page: `body.is-poster` drives CSS; `theme.poster` makes `createScene` use an orthographic fixed camera; `bootSheet` locks explode at 100 %; `callouts.js` draws guides instead of labels; a new `js/urban/thumbs.js` renders per-observation viewports with a second transparent renderer (three.js "multiple elements" pattern). Plates become extruded slabs in both modes.

**Tech Stack:** three.js 0.164 via import map, vanilla ES modules, CSS grid, Playwright MCP for verification, `python3 -m http.server 8080`.

**Spec:** `docs/superpowers/specs/2026-08-31-urban-poster-mode-design.md`

## Global Constraints

- No build step; three.js stays at unpkg 0.164; `urban.html` at repo root.
- `index.html` (tank sheet) must be unchanged in look and behaviour; all poster CSS lives in `css/urban.css`; all poster JS branches are gated on `theme.poster` / `body.is-poster` / `data.OBSERVATIONS`.
- Sheet mode of `urban.html` (no `?view`) must keep today's behaviour: orbit, slider, 7 callouts.
- Colours: paper `#ffffff`, plate top `0xf3ede2`, plate side `0xd9d0bd`, guide `--dimmer`, module number colour = the layer's first legend swatch.
- Scene units unchanged; +X east, +Z south.
- Every commit message ends with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01JVMunbZoeX3K6XM6gRhpLx`
- Never commit `.agents/`, `.claude/`, `skills-lock.json`, `.playwright-mcp/`.
- Browser verification: Playwright MCP; refresh module cache with `fetch(url,{cache:'reload'})` first; `browser_take_screenshot` times out on WebGL pages — capture via nested `requestAnimationFrame` + `canvas.toDataURL`, saved with `browser_evaluate`'s `filename` under `.playwright-mcp/`, decoded with `base64 -d`, then Read; `rm -rf .playwright-mcp` before committing.

---

### Task 1: Slab plates

**Files:**
- Modify: `js/urban/geo.js:143-151` (`plateMesh`)
- Modify: `js/urban/layers.js:12` (`Z` offsets)
- Modify: `js/urban/geo.test.html` (one assertion)

**Interfaces:**
- Produces: `plateMesh(coastDoc, { color, side, outline, y })` → `THREE.Group` whose cap mesh has `userData.isPlate = true`; slab depth constant `PLATE_DEPTH = 0.35` exported from `geo.js`.

- [ ] **Step 1: Add the failing assertion** to `js/urban/geo.test.html` after the extrude checks (import `plateMesh, PLATE_DEPTH` too):

```js
  const pl = plateMesh(square, { color: 0xf3ede2, side: 0xd9d0bd, outline: 0, y: 0 });
  const pb = new THREE.Box3().setFromObject(pl);
  check('plate is a slab of PLATE_DEPTH', Math.abs(pb.max.y - pb.min.y - PLATE_DEPTH) < 0.03);
  check('plate cap is flagged', pl.children.some((c) => c.userData.isPlate));
```

- [ ] **Step 2: Open `http://127.0.0.1:8080/js/urban/geo.test.html`** — expect a console error (`PLATE_DEPTH` not exported) or a FAIL line.

- [ ] **Step 3: Implement** in `js/urban/geo.js`:

```js
export const PLATE_DEPTH = 0.35;

export function plateMesh(coastDoc, { color, side = 0xd9d0bd, outline, y = 0 }) {
  const grp = new THREE.Group();
  const geos = coastDoc.features.map((f) =>
    new THREE.ExtrudeGeometry(toShape(f.p), { depth: PLATE_DEPTH, bevelEnabled: false })
  );
  const merged = geos.length ? flat(mergeGeometries(geos, true)) : empty();
  geos.forEach((g) => g.dispose());
  // ExtrudeGeometry groups: 0 = caps, 1 = sides. useGroups=true keeps them.
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
```

`flat()` rotates X by −90°, so the extrusion (+Z in shape space) lands on +Y; shifting the mesh down by `PLATE_DEPTH` keeps the top face at `y` so existing content offsets in `layers.js` still sit on the plate. `Z` in `js/urban/layers.js` stays as is. In `js/scene.js` `setSelected`, the highlight swap assigns a single material to `o.material` — a multi-material mesh gets replaced wholesale and restored from `originalMats`, which already stores the original value, so no change needed.

- [ ] **Step 4: Run the test page** — 10 PASS, no console errors. Then load `urban.html`, set the slider to 100 % and capture the canvas: plates show a darker side face under each beige top.

- [ ] **Step 5: Commit** `git add js/urban/geo.js js/urban/geo.test.html` — "Urban board: extruded slab plates".

---

### Task 2: Poster camera, explode lock, guides

**Files:**
- Modify: `js/urban/app.js` (view param → body class, theme select)
- Modify: `js/themes.js` (`URBAN_THEME.poster`)
- Modify: `js/scene.js:22-31, 201-208` (ortho camera branch, resize)
- Modify: `js/sheet.js:59-84, 184` (poster boot)
- Modify: `js/callouts.js:57-100` (guides branch)
- Modify: `css/urban.css` (minimal: hide labels/slider in poster; body.is-poster canvas tall)

**Interfaces:**
- Consumes: `createScene(canvas,{build,theme})`, `bootSheet`, `createCallouts`.
- Produces: `theme.poster = { azimuth, elevation, explodeStep, fit }`; `api.poster === true` when active; `callouts.update()` draws `.guide` polylines in poster mode.

- [ ] **Step 1: `js/themes.js`** — add to `URBAN_THEME`:

```js
  poster: { azimuth: 30, elevation: 35, explodeStep: 5.2, fit: 1.12 },
```

- [ ] **Step 2: `js/urban/app.js`** — before `bootSheet`:

```js
const poster = new URLSearchParams(location.search).get('view') === 'poster';
document.body.classList.toggle('is-poster', poster);
const theme = poster ? URBAN_THEME : { ...URBAN_THEME, poster: null };
bootSheet({ data, build: () => buildLayers(docs), theme });
```

- [ ] **Step 3: `js/scene.js`** — replace the camera/controls block (lines 22–31) with:

```js
  const poster = theme.poster || null;
  const camera = poster
    ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600)
    : new THREE.PerspectiveCamera(34, 1, 0.1, 400);
  if (poster) {
    const az = THREE.MathUtils.degToRad(poster.azimuth);
    const el = THREE.MathUtils.degToRad(poster.elevation);
    const stackH = 6 * poster.explodeStep;
    const centre = new THREE.Vector3(0, stackH / 2, 0);
    camera.position.set(
      centre.x + 200 * Math.cos(el) * Math.sin(az),
      centre.y + 200 * Math.sin(el),
      centre.z + 200 * Math.cos(el) * Math.cos(az)
    );
    camera.lookAt(centre);
    camera.userData.halfH = ((stackH + 30) / 2) * poster.fit;
  } else {
    camera.position.set(...theme.camera);
  }

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = theme.minDistance;
  controls.maxDistance = theme.maxDistance;
  controls.maxPolarAngle = theme.maxPolarAngle;
  controls.target.set(...(poster ? [0, 3 * poster.explodeStep, 0] : theme.target));
  controls.enabled = !poster;
```

and `resize()`:

```js
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    if (camera.isOrthographicCamera) {
      const hh = camera.userData.halfH;
      camera.top = hh; camera.bottom = -hh;
      camera.right = hh * (w / h); camera.left = -camera.right;
    } else {
      camera.aspect = w / h;
    }
    camera.updateProjectionMatrix();
  }
```

Add `poster: Boolean(poster)` to the returned api object. `focusOn`/`resetView` keep working (they move position/target; harmless when controls are disabled).

- [ ] **Step 4: `js/sheet.js`** — explode spacing is data (`explode` per part, currently `i*5`); in poster mode the theme's `explodeStep` must win. After `createScene`, before `createCallouts`:

```js
  if (api.poster) {
    const step = theme.poster.explodeStep;
    PARTS.forEach((p, i) => {
      api.groups.get(p.id)?.userData.explode.set(0, (PARTS.length - 1 - i) * step, 0);
    });
  }
```

At the end of boot (line 184 area) replace `setDisassembly(0, { updateSlider: true });` with:

```js
  setDisassembly(api.poster ? 100 : 0, { updateSlider: true });
  if (api.poster) slider.disabled = true;
```

`callouts.setEnabled(!api.poster)` is NOT called — guides need `update()` to run; instead the callout layer is hidden by CSS and `update()` branches (Step 5).

- [ ] **Step 5: `js/callouts.js`** — in `createCallouts`, after the `nodes` map is built, add two guide polylines:

```js
  const guides = ['left', 'right'].map(() => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    g.setAttribute('class', 'guide');
    svg.appendChild(g);
    return g;
  });
```

In `update()`, at the top after the `w/h` checks:

```js
    if (api.poster) return updateGuides(w, h);
```

and add:

```js
  // Poster mode: no labels; two dashed guides through the plates' left- and
  // right-most projected corners, like the reference board's alignment lines.
  const corner = new THREE.Vector3();
  function updateGuides(w, h) {
    const pts = { left: [], right: [] };
    api.groups.forEach((grp) => {
      anchorBox.setFromObject(grp);
      if (anchorBox.isEmpty()) return;
      const y = anchorBox.max.y;
      const xs = [anchorBox.min.x, anchorBox.max.x];
      const zs = [anchorBox.min.z, anchorBox.max.z];
      let minSx = Infinity, maxSx = -Infinity, minP, maxP;
      xs.forEach((x) => zs.forEach((z) => {
        corner.set(x, y, z).project(api.camera);
        const sx = ((corner.x + 1) / 2) * w;
        const sy = ((1 - corner.y) / 2) * h;
        if (sx < minSx) { minSx = sx; minP = `${sx},${sy}`; }
        if (sx > maxSx) { maxSx = sx; maxP = `${sx},${sy}`; }
      }));
      pts.left.push(minP);
      pts.right.push(maxP);
    });
    guides[0].setAttribute('points', pts.left.join(' '));
    guides[1].setAttribute('points', pts.right.join(' '));
  }
```

Label nodes are left untouched (hidden via CSS in poster mode).

- [ ] **Step 6: `css/urban.css`** — append:

```css
/* ── Poster mode: camera/explode plumbing only (layout lands in Task 3) ── */
body.is-poster .callouts { display: none; }
body.is-poster .control--slider,
body.is-poster .control--presets,
body.is-poster .control--toggles .switch { display: none; }
.guide { fill: none; stroke: var(--dimmer); stroke-width: 1; stroke-dasharray: 4 6; }
```

- [ ] **Step 7: Verify** — `urban.html?view=poster`: `document.body.classList.contains('is-poster')`; slider disabled and hidden; `document.querySelectorAll('.guide').length === 2` and both have non-empty `points`; canvas capture shows a fixed axonometric stack (no perspective convergence), all seven plates in frame. `urban.html` (no param): orbit works, slider works, 7 callouts. `index.html`: 23 callouts, no console errors.

- [ ] **Step 8: Commit** — "Urban board: poster camera, explode lock, dashed guides".

---

### Task 3: Poster layout, modules, scale bar, compass, print/PNG

**Files:**
- Modify: `urban.html` (footer link + PNG button, scale ticks, compass, head title layout)
- Modify: `css/urban.css` (poster grid + modules + strip + print)
- Modify: `js/ui.js:24-38` (module content when `data.OBSERVATIONS`)
- Modify: `js/sheet.js` (PNG button handler, poster-gated)

**Interfaces:**
- Consumes: `body.is-poster`, `api.renderer.domElement`.
- Produces: DOM: `.module__num`, `.module__spec`, `#btn-png`, `.scale`, `.compass`.

- [ ] **Step 1: `js/ui.js`** row template — replace the row `innerHTML` with:

```js
      const rich = Boolean(data.OBSERVATIONS);
      const num = rich ? `<span class="module__num" style="color:${p.legend?.[0]?.swatch ?? 'inherit'}">${String(p.id).replace(/\D/g, '').replace(/^0/, '')}</span>` : '';
      row.innerHTML = `
        <button type="button" class="bom__btn" data-part-id="${p.id}">
          ${num}
          <span class="bom__id">${p.id}</span>
          <span class="bom__name">${p.name}</span>
          <span class="bom__qty">${p.qty}</span>
          ${p.legend ? `<span class="bom__legend">${p.legend.slice(0, 3).map((l) =>
            `<i style="background:${l.swatch}" title="${l.label}" aria-hidden="true"></i>`).join('')}</span>` : ''}
          ${rich ? `<span class="module__spec">${p.spec}</span>${legendList(p.legend)}` : ''}
        </button>`;
```

(`legendList` must be hoisted above the loop — move its `const` definition to before `GROUPS.forEach`.) In sheet mode `.module__num`, `.module__spec` and the row's `.legend` are hidden by CSS; in poster mode `.bom__id`, `.bom__qty`, `.bom__legend` are hidden. The tank dataset has no `OBSERVATIONS`, so its rows are byte-identical to today.

- [ ] **Step 2: `urban.html`** —
  - In `.ident`, keep as is (CSS restyles it).
  - Replace the `.scalebar` block with:

```html
          <div class="scale" aria-label="Scale bar, 0 to 25 kilometres">
            <span class="scale__rule"><i></i><i></i><i></i><i></i><i></i></span>
            <span class="scale__ticks"><b>0</b><b>5</b><b>10</b><b>15</b><b>20</b><b>25 km</b></span>
          </div>
          <svg class="compass" viewBox="0 0 60 60" role="img" aria-label="North">
            <circle cx="30" cy="30" r="26" fill="none" stroke="#1a1a1a" stroke-width="1.2" />
            <polygon points="30,6 36,30 30,26 24,30" fill="#1a1a1a" />
            <polygon points="30,54 36,30 30,34 24,30" fill="none" stroke="#1a1a1a" stroke-width="1" />
            <text x="30" y="17" text-anchor="middle" font-size="9" fill="#ffffff">N</text>
          </svg>
```

  and delete the old `.north` svg.
  - In the footer's `.control--toggles`, before `#btn-reset`, add:

```html
          <a id="view-link" class="reset" href="?view=poster">Poster</a>
          <button type="button" id="btn-png" class="reset" hidden>Save PNG</button>
```

  - `js/urban/app.js` after the body-class toggle: `const link = document.getElementById('view-link'); if (poster) { link.href = 'urban.html'; link.textContent = 'Sheet'; document.getElementById('btn-png').hidden = false; }`

- [ ] **Step 3: `js/sheet.js`** — after the reset button handler:

```js
  document.getElementById('btn-png')?.addEventListener('click', () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const a = document.createElement('a');
      a.download = 'singapore-urban-analysis.png';
      a.href = api.renderer.domElement.toDataURL('image/png');
      a.click();
    }));
  });
```

- [ ] **Step 4: `css/urban.css`** — append the poster layout (this is the bulk of the task; values are the design):

```css
/* ── Poster mode layout ────────────────────────────────────────────────── */
body.is-poster { overflow: auto; }
body.is-poster .sheet {
  height: auto; min-height: 100dvh; max-width: 1240px; margin: 24px auto;
  border: none; grid-template-rows: auto 1fr auto;
}
body.is-poster .sheet__head { border-bottom: none; padding: 24px 32px 8px; background: none; }
body.is-poster .ident__designation { font-size: 30px; letter-spacing: 0.04em; }
body.is-poster .ident__type { font-size: 20px; letter-spacing: 0.06em; }
body.is-poster .titleblock, body.is-poster .mobile-tabs { display: none; }
body.is-poster .sheet__body { grid-template-columns: 300px minmax(520px, 1fr) 320px; gap: 24px; padding: 0 32px; }
body.is-poster .panel { border: none; background: none; overflow: visible; }
body.is-poster .panel__head { display: none; }
body.is-poster .field { aspect-ratio: 1 / 2.1; min-height: 1200px; background: none; }
body.is-poster #field { background: transparent; }

/* modules (left) */
body.is-poster .bom__group { display: none; }
body.is-poster .bom__row { margin: 0 0 28px; }
body.is-poster .bom__btn {
  display: grid; grid-template-columns: 44px 1fr; grid-auto-rows: auto; gap: 2px 10px;
  padding: 0; background: none; border: none; border-left: 2px solid var(--rule); padding-left: 12px;
  text-align: left; white-space: normal;
}
body.is-poster .bom__btn.is-active { border-left-color: var(--amber); }
body.is-poster .bom__id, body.is-poster .bom__qty, body.is-poster .bom__legend { display: none; }
.module__num, .module__spec { display: none; }
body.is-poster .module__num { display: block; grid-row: 1 / span 2; font: 700 40px/1 var(--display); }
body.is-poster .bom__name { grid-column: 2; font: 600 15px/1.2 var(--display); letter-spacing: 0.06em; text-transform: uppercase; }
body.is-poster .module__spec { display: block; grid-column: 2; font-size: 12px; line-height: 1.45; color: var(--dim); }
body.is-poster .bom__btn .legend { grid-column: 2; margin-top: 6px; }
body.is-poster .bom__btn .legend li { font-size: 11px; }

/* observations (right) */
body.is-poster .data { padding: 0; }
body.is-poster .data__block h4 { font: 600 14px/1.2 var(--display); letter-spacing: 0.08em; text-transform: uppercase; border-bottom: 1px solid var(--rule); padding-bottom: 6px; }
body.is-poster .panel__actions { display: none; }

/* bottom strip */
.scale { position: absolute; left: 24px; bottom: 20px; width: 220px; font-size: 10px; color: var(--text); }
.scale__rule { display: flex; height: 6px; border: 1px solid var(--text); }
.scale__rule i { flex: 1; }
.scale__rule i:nth-child(odd) { background: var(--text); }
.scale__ticks { display: flex; justify-content: space-between; margin-top: 3px; }
.scale__ticks b { font-weight: 400; transform: translateX(-50%); }
.scale__ticks b:first-child { transform: none; }
.scale__ticks b:last-child { transform: translateX(15%); }
.compass { position: absolute; right: 24px; bottom: 16px; width: 44px; height: 44px; }
body:not(.is-poster) .scale { display: none; }
body:not(.is-poster) .compass { width: 30px; height: 30px; }
body.is-poster .hint { display: none; }
body.is-poster .sheet__foot { border: none; justify-content: flex-end; }

@media print {
  @page { size: A2 portrait; margin: 12mm; }
  body.is-poster .sheet__foot { display: none; }
  body.is-poster .sheet { margin: 0; max-width: none; }
}
```

  Delete the old `.scalebar` rule if it lives in `urban.css`; the one in `sheet.css` no longer matches anything on this page (its markup is gone) — leave sheet.css alone.

- [ ] **Step 5: Verify** — `urban.html?view=poster`: three columns visible; 7 modules each with a coloured `.module__num` (1…7) and a legend; observations on the right; scale bar with six tick labels and the compass at the bottom of the field; "Sheet" link and "Save PNG" button in the footer; clicking Save PNG triggers a download (Playwright: listen for `download` event via `browser_run_code_unsafe` or just confirm no console error). Sheet mode: layout unchanged, "Poster" link present, `.scale` hidden. `index.html`: unchanged.

- [ ] **Step 6: Commit** — "Urban board: poster layout, numbered modules, scale bar, compass, PNG".

---

### Task 4: Live thumbnails

**Files:**
- Create: `js/urban/thumbs.js`
- Modify: `data/urban/layers.js` (`AREAS`, `OBSERVATIONS` → 7 with `layer`/`area`)
- Modify: `js/ui.js:56-64` (thumb placeholder in the observations block)
- Modify: `js/sheet.js` (create + tick thumbs when `api.poster && data.OBSERVATIONS`)
- Modify: `urban.html` (`<canvas id="thumb-canvas">`), `css/urban.css` (circle + overlay canvas)
- Modify: `README.md` (poster paragraph)

**Interfaces:**
- Consumes: `api.scene`, `api.groups`, `api.renderer` size.
- Produces: `createThumbs(api, data) → { update() }`.

- [ ] **Step 1: `data/urban/layers.js`** — add:

```js
// Named areas in scene units (x east, z south) for the observation thumbnails.
export const AREAS = {
  island: { x: [-20, 22], z: [-12, 14] },     // whole main island
  central: { x: [-6, 8], z: [-6, 8] },        // catchment + city
  cbd: { x: [0, 5], z: [4, 9] },              // Marina Bay / Raffles Place
  punggol: { x: [7, 14], z: [-11, -5] },      // north-east new town
  jurong: { x: [-16, -8], z: [-2, 6] },       // west industrial + lake district
};
```

and replace `OBSERVATIONS` with seven entries carrying `layer` and `area`:

```js
export const OBSERVATIONS = [
  { layer: 'L-01', area: 'central', title: 'Strong ecological base', text: 'The central catchment sits at the centre of every layer; parks and reservoirs form a connected green core.' },
  { layer: 'L-02', area: 'cbd', title: 'Concentrated core functions', text: 'Commercial and civic functions cluster on the southern waterfront around Marina Bay; the deep-orange core is the pivot of the polycentric plan.' },
  { layer: 'L-03', area: 'central', title: 'Efficient transport network', text: 'Expressways stitch the island east–west; MRT lines radiate from the core and loop through the new towns.' },
  { layer: 'L-04', area: 'punggol', title: 'Continuous growth & renewal', text: 'Recent and future areas sit on the periphery — Punggol, Tengah, Woodlands — while renewal follows the old waterfront.' },
  { layer: 'L-05', area: 'cbd', title: 'High central density', text: 'Floor-area intensity peaks in the core and the tallest HDB towns, fading toward the coast.' },
  { layer: 'L-06', area: 'cbd', title: 'Compact & diverse fabric', text: 'Fine shophouse grain in the centre against the coarse slab-and-tower grain of the new towns.' },
  { layer: 'L-07', area: 'island', title: 'Strong regional connectivity', text: 'Singapore sits at the tip of the peninsula between the Johor and Singapore straits, a hub for the region.' },
];
```

- [ ] **Step 2: `js/ui.js`** — in the `EMPTY` observations block, render each observation as:

```js
        ${data.OBSERVATIONS.map((o, i) => `
          <div class="obs">
            <div class="thumb" data-layer="${o.layer ?? ''}" data-area="${o.area ?? 'island'}"></div>
            <p><strong>${i + 1} · ${o.title}.</strong> ${o.text}</p>
          </div>`).join('')}
```

- [ ] **Step 3: `js/urban/thumbs.js`**:

```js
/**
 * Live observation thumbnails: the same scene rendered top-down into small
 * circular viewports, one layer visible at a time. One transparent renderer
 * covers the page; each .thumb element is a scissor rect into it
 * (three.js "multiple elements" pattern).
 */
import * as THREE from 'three';
import { AREAS } from '../../data/urban/layers.js';

export function createThumbs(api, canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setScissorTest(true);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  cam.up.set(0, 0, -1); // north up on the thumbnail

  function update() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    const thumbs = document.querySelectorAll('.thumb[data-layer]');
    if (!thumbs.length) return;
    const saved = new Map();
    api.groups.forEach((g, id) => saved.set(id, g.visible));
    thumbs.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > h || r.width === 0) return;
      const grp = api.groups.get(el.dataset.layer);
      if (!grp) return;
      const area = AREAS[el.dataset.area] ?? AREAS.island;
      api.groups.forEach((g, id) => { g.visible = id === el.dataset.layer; });
      const cx = (area.x[0] + area.x[1]) / 2;
      const cz = (area.z[0] + area.z[1]) / 2;
      const half = Math.max(area.x[1] - area.x[0], area.z[1] - area.z[0]) / 2;
      const y = grp.position.y;
      cam.position.set(cx, y + 100, cz);
      cam.lookAt(cx, y, cz);
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
      cam.updateProjectionMatrix();
      const x = r.left, yTop = h - r.bottom;
      renderer.setViewport(x, yTop, r.width, r.height);
      renderer.setScissor(x, yTop, r.width, r.height);
      renderer.render(api.scene, cam);
    });
    saved.forEach((v, id) => { api.groups.get(id).visible = v; });
  }
  return { update };
}
```

  `ponytail:` re-renders every thumb every frame; throttle to on-scroll/resize if it ever matters.

- [ ] **Step 4: Wire it** — `urban.html`: add `<canvas id="thumb-canvas" aria-hidden="true"></canvas>` right before the module script. `css/urban.css`:

```css
#thumb-canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 5; display: none; }
body.is-poster #thumb-canvas { display: block; }
.obs { display: grid; grid-template-columns: 96px 1fr; gap: 12px; align-items: start; margin: 0 0 18px; }
.thumb { width: 96px; height: 96px; border-radius: 50%; background: var(--plate); border: 1px solid var(--rule); }
```

  `js/sheet.js`: import `createThumbs` lazily only when needed to keep the tank path free of it:

```js
  let thumbs = null;
  if (api.poster && data.OBSERVATIONS) {
    import('./urban/thumbs.js').then(({ createThumbs }) => {
      thumbs = createThumbs(api, document.getElementById('thumb-canvas'));
    });
  }
```

  and in `tick()` after `callouts.update();`: `thumbs?.update();`.

  Because the slab plate is beige, the thumb's background circle shows plate colour where the layer has no content; the CSS `background: var(--plate)` matches.

- [ ] **Step 5: README** — append under the urban section:

```markdown
### Poster view

`urban.html?view=poster` lays the board out as a portrait analysis poster: fixed
axonometric stack with alignment guides, numbered modules on the left, key
observations with live thumbnails on the right, scale bar and compass. "Save
PNG" exports the 3D field; use the browser's print for the whole board.
```

- [ ] **Step 6: Verify** — poster mode: `document.querySelectorAll('.thumb').length === 7`; capture `#thumb-canvas` via nested rAF `toDataURL` (it is a separate canvas — read it directly) and confirm the seven circles are drawn (centre pixels non-transparent); capture the main canvas too and compare the whole page against the reference: layers on one axis, guides, modules, observations, scale, compass. Sheet mode and `index.html` unchanged (counts, console).

- [ ] **Step 7: Commit** — "Urban board: live observation thumbnails, README".
