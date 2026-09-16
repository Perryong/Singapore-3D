# Singapore Weather Forecast Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `weather.html` shows live data.gov.sg forecasts on the site's Singapore map: 47-area 2-hour forecasts, 5-region 24-hour forecast with period chips, and 4-day outlook cards, in three tabs.

**Architecture:** A thin standalone page: `js/weather/wx.js` fetches/parses the three real-time APIs; `js/weather/icons.js` maps NEA forecast texts to glyphs; `js/weather/map.js` renders a static top-down Singapore (reusing `js/urban/geo.js` and the baked coast/satellite data) and exposes lon/lat→screen projection; `js/weather/app.js` wires tabs, markers, badges, cards, refresh and per-endpoint error blocks. Nothing under `js/urban/`, `js/sheet.js` or `js/scene.js` changes.

**Tech Stack:** three.js 0.164 via import map (no build), vanilla ES modules, data.gov.sg real-time v2 APIs (CORS `*`, no key), fixture-driven browser test page, Playwright MCP for live verification.

**Spec:** `docs/superpowers/specs/2026-09-05-weather-forecast-design.md`

## Global Constraints

- Branch `weather-forecast`; no build step; three.js stays at unpkg 0.164 via the import map copied from `index.html`.
- **No API key anywhere in the code** — the endpoints are open; a key on GitHub Pages would be public.
- Endpoints (exact): `https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast`, `.../twenty-four-hr-forecast`, `.../four-day-outlook`. Fetch timeout 10 s via `AbortSignal.timeout(10000)`.
- Fixtures already committed at `js/weather/fixtures/{two-hr-forecast,twenty-four-hr-forecast,four-day-outlook}.json` — raw API responses (`{code, data, errorMsg}` wrapper).
- Lon/lat↔scene mapping constants (from `data/urban/satellite.json`, exact): lon 103.55→x −19.89, lon 104.15→x 22.70, lat 1.53→z −15.16, lat 1.13→z 13.05. Linear interpolation; comment that the residual error at this extent is < 0.1 %.
- Paper theme: reuse `css/sheet.css` tokens/chrome via `css/weather.css` `@import` + overrides mirroring `css/urban.css`'s approach (light tokens: `--ink #ffffff`, `--text #1a1a1a`, `--amber #d9480f`, etc. — copy the `:root` block from `css/urban.css`).
- `index.html` gains ONLY one header link; behaviour otherwise unchanged.
- Every commit ends with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01JVMunbZoeX3K6XM6gRhpLx`
- Never commit `.agents/`, `.claude/`, `skills-lock.json`, `.playwright-mcp/`.
- Browser verification: Playwright MCP; refresh module cache with `fetch(url,{cache:'reload'})` before judging; `browser_take_screenshot` times out while a WebGL canvas is visible — hide `#field` first for DOM shots, or capture the canvas via nested `requestAnimationFrame` + `toDataURL` (saved with browser_evaluate's `filename` under `.playwright-mcp/`, decoded with `base64 -d`, then Read). `rm -rf .playwright-mcp` before committing. Dev server: `python3 -m http.server 8080 --bind 127.0.0.1` from the repo root.

---

### Task 1: Data + icons + fixture tests (`wx.js`, `icons.js`, `wx.test.html`)

**Files:**
- Create: `js/weather/wx.js`, `js/weather/icons.js`, `js/weather/wx.test.html`

**Interfaces:**
- Produces (`wx.js`): `parseTwoHr(json) → { updated: Date, validity: string, areas: [{name, lon, lat, forecast}] }` (47 areas); `parseTwentyFourHr(json) → { updated: Date, general: {tempLow, tempHigh, humidityLow, humidityHigh, windDir, windLow, windHigh, forecast}, periods: [{label, regions: {north, south, east, west, central}}] }` (region values = forecast text); `parseFourDay(json) → { updated: Date, days: [{day, date, forecast, tempLow, tempHigh, humidityLow, humidityHigh, windDir, windLow, windHigh}] }` (4 days); `fetchForecast(kind) → Promise<parsed>` where kind ∈ `'2h' | '24h' | '4d'` (fetches the matching endpoint with `AbortSignal.timeout(10000)`, throws on non-200 or `json.code !== 0`).
- Produces (`icons.js`): `iconFor(text) → string` (emoji; `'❓'` + one `console.warn` per unknown text); `LONLAT`/scene helpers live in map.js, not here.

- [ ] **Step 1: Write the failing test page** `js/weather/wx.test.html`:

```html
<!DOCTYPE html>
<meta charset="utf-8" />
<title>weather checks</title>
<pre id="out"></pre>
<script type="module">
  import { parseTwoHr, parseTwentyFourHr, parseFourDay } from './wx.js';
  import { iconFor } from './icons.js';

  const load = (n) => fetch(`./fixtures/${n}.json`).then((r) => r.json());
  const [twoHr, dayFc, fourDay] = await Promise.all([
    load('two-hr-forecast'), load('twenty-four-hr-forecast'), load('four-day-outlook'),
  ]);

  const results = [];
  const check = (name, ok) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);

  const t = parseTwoHr(twoHr);
  check('2h: 47 areas', t.areas.length === 47);
  check('2h: finite coords', t.areas.every((a) => Number.isFinite(a.lon) && Number.isFinite(a.lat)));
  check('2h: every area has a forecast', t.areas.every((a) => typeof a.forecast === 'string' && a.forecast.length > 0));
  check('2h: updated is a date', t.updated instanceof Date && !isNaN(t.updated));

  const d = parseTwentyFourHr(dayFc);
  check('24h: >=1 period', d.periods.length >= 1);
  check('24h: all five regions each period', d.periods.every((p) =>
    ['north', 'south', 'east', 'west', 'central'].every((r) => typeof p.regions[r] === 'string')));
  check('24h: general temps', Number.isFinite(d.general.tempLow) && d.general.tempHigh >= d.general.tempLow);

  const f = parseFourDay(fourDay);
  check('4d: 4 days', f.days.length === 4);
  check('4d: temp ranges sane', f.days.every((x) => x.tempHigh >= x.tempLow));

  const texts = new Set([
    ...t.areas.map((a) => a.forecast),
    ...d.periods.flatMap((p) => Object.values(p.regions)),
    d.general.forecast,
    ...f.days.map((x) => x.forecast),
  ]);
  check('icons: no unknown forecast text in fixtures', [...texts].every((x) => iconFor(x) !== '❓'));

  // Icon table sanity beyond today's fixtures (today may be all "Fair (Day)")
  for (const known of ['Thundery Showers', 'Light Rain', 'Cloudy', 'Windy', 'Partly Cloudy (Night)', 'Showers'])
    check(`icons: ${known}`, iconFor(known) !== '❓');

  document.getElementById('out').textContent = results.join('\n');
  console.log(results.join('\n'));
</script>
```

- [ ] **Step 2: Open `http://127.0.0.1:8080/js/weather/wx.test.html`** (Playwright; start the server if down). Expected: console error — `wx.js` 404.

- [ ] **Step 3: Write `js/weather/wx.js`:**

```js
/**
 * data.gov.sg real-time weather APIs: fetch + parse.
 * All three endpoints are open (CORS *, no key) — verified 2026-09-05.
 * Raw response wrapper: { code, errorMsg, data }.
 */

const BASE = 'https://api-open.data.gov.sg/v2/real-time/api/';
const ENDPOINTS = { '2h': 'two-hr-forecast', '24h': 'twenty-four-hr-forecast', '4d': 'four-day-outlook' };
const PARSERS = { '2h': parseTwoHr, '24h': parseTwentyFourHr, '4d': parseFourDay };

export async function fetchForecast(kind) {
  const res = await fetch(BASE + ENDPOINTS[kind], { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`${ENDPOINTS[kind]}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(`${ENDPOINTS[kind]}: ${json.errorMsg || 'API error'}`);
  return PARSERS[kind](json);
}

export function parseTwoHr(json) {
  const d = json.data;
  const item = d.items[0];
  const byArea = new Map(item.forecasts.map((f) => [f.area, f.forecast]));
  return {
    updated: new Date(item.update_timestamp ?? item.timestamp),
    validity: item.valid_period?.text ?? '',
    areas: d.area_metadata.map((a) => ({
      name: a.name,
      lon: a.label_location.longitude,
      lat: a.label_location.latitude,
      forecast: byArea.get(a.name) ?? '',
    })),
  };
}

export function parseTwentyFourHr(json) {
  const r = json.data.records[0];
  const g = r.general;
  return {
    updated: new Date(r.updatedTimestamp),
    general: {
      forecast: g.forecast?.text ?? '',
      tempLow: g.temperature?.low, tempHigh: g.temperature?.high,
      humidityLow: g.relativeHumidity?.low, humidityHigh: g.relativeHumidity?.high,
      windDir: g.wind?.direction ?? '', windLow: g.wind?.speed?.low, windHigh: g.wind?.speed?.high,
    },
    periods: r.periods.map((p) => ({
      label: p.timePeriod.text,
      regions: Object.fromEntries(
        ['north', 'south', 'east', 'west', 'central'].map((k) => [k, p.regions[k]?.text ?? ''])
      ),
    })),
  };
}

export function parseFourDay(json) {
  const r = json.data.records[0];
  return {
    updated: new Date(r.updatedTimestamp),
    days: r.forecasts.map((f) => ({
      day: f.day, date: f.timestamp?.slice(0, 10) ?? '',
      forecast: f.forecast?.text ?? '',
      tempLow: f.temperature?.low, tempHigh: f.temperature?.high,
      humidityLow: f.relativeHumidity?.low, humidityHigh: f.relativeHumidity?.high,
      windDir: f.wind?.direction ?? '', windLow: f.wind?.speed?.low, windHigh: f.wind?.speed?.high,
    })),
  };
}
```

Check the 2-hr fixture's actual item field names (`update_timestamp` vs `updated_timestamp` vs `updatedTimestamp`, `valid_period.text`) with `python3 -c "import json; i=json.load(open('js/weather/fixtures/two-hr-forecast.json'))['data']['items'][0]; print(i.keys(), i.get('valid_period'))"` and adjust the parser to what the fixture really holds — the fixture is the contract.

- [ ] **Step 4: Write `js/weather/icons.js`:**

```js
/**
 * NEA forecast text → glyph. Text always accompanies the icon in the UI, so
 * an unknown glyph never hides information. Full code list:
 * https://data.gov.sg (two-hr forecast documentation).
 */
const TABLE = [
  [/thundery|thunder/i, '⛈️'],
  [/heavy rain/i, '🌧️'],
  [/moderate rain|^rain$/i, '🌧️'],
  [/light rain|drizzle/i, '🌦️'],
  [/showers/i, '🌦️'],
  [/fair.*night|clear.*night|partly cloudy \(night\)/i, '🌙'],
  [/partly cloudy/i, '🌤️'],
  [/cloudy|overcast/i, '☁️'],
  [/hazy|haze|mist|fog/i, '🌫️'],
  [/windy|wind/i, '🌬️'],
  [/fair|sunny|warm/i, '☀️'],
];

const warned = new Set();

export function iconFor(text) {
  for (const [re, glyph] of TABLE) if (re.test(text)) return glyph;
  if (!warned.has(text)) { warned.add(text); console.warn(`iconFor: unknown forecast "${text}"`); }
  return '❓';
}
```

Order matters: night variants and rain intensities are matched before the generic `partly cloudy`/`fair` patterns; keep new entries above the generic ones.

- [ ] **Step 5: Run the test page** — all PASS (38 checks), no console errors (a `console.warn` from `iconFor` counts as a FAIL of the no-unknown check, not an error).

- [ ] **Step 6: Commit** — `git add js/weather` — "Weather: API parsers, icon table, fixture tests".

---

### Task 2: Static map (`map.js`, `weather.html`, `css/weather.css`)

**Files:**
- Create: `js/weather/map.js`, `weather.html`, `css/weather.css`

**Interfaces:**
- Consumes: `loadAll`, `plateMesh`, `texturedQuad` from `js/urban/geo.js` (`loadAll(names)` fetches `data/urban/<name>.json`, tolerates failures; `plateMesh(coastDoc, {color, side, outline, y})`; `texturedQuad(bboxDoc, url, {y})`).
- Produces: `createWeatherMap(canvas) → Promise<{ project(lon, lat) → {x, y}, onResize(cb), render() }>` — `project` returns canvas-CSS-pixel coordinates; `onResize` re-fires positioning callbacks after a resize re-render.

- [ ] **Step 1: Write `js/weather/map.js`:**

```js
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

  const HALF = 23; // island z-extent ~25.4 units + margin fits the tighter axis

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
```

- [ ] **Step 2: Write `weather.html`** — copy `index.html`'s `<head>` (fonts, import map) but stylesheet `./css/weather.css`, title `Singapore weather — live forecasts`, description "Live 2-hour, 24-hour and 4-day Singapore weather forecasts from data.gov.sg on an interactive map."; body:

```html
  <body>
    <div class="sheet">
      <header class="sheet__head">
        <div class="ident">
          <h1 class="ident__designation">SINGAPORE</h1>
          <p class="ident__type">WEATHER FORECAST</p>
          <p class="ident__sub">
            Live from data.gov.sg · <span id="updated">loading…</span>
            · <a href="./index.html">← Analysis board</a>
          </p>
        </div>
        <div class="tabs" role="tablist">
          <button type="button" class="tab is-on" data-tab="2h" role="tab">2-hour</button>
          <button type="button" class="tab" data-tab="24h" role="tab">24-hour</button>
          <button type="button" class="tab" data-tab="4d" role="tab">4-day</button>
          <button type="button" id="btn-refresh" class="reset">Refresh</button>
        </div>
      </header>

      <main class="wx-body">
        <section class="field">
          <canvas id="field" aria-label="Map of Singapore with weather forecasts"></canvas>
          <div id="marker-layer" aria-live="polite"></div>
          <p class="attrib">Imagery © Esri — Source: Esri, Maxar, Earthstar Geographics · Forecasts © data.gov.sg</p>
        </section>
        <aside id="panel" class="panel panel--data">
          <div class="panel__head"><h2 id="panel-title">2-hour forecast</h2></div>
          <div id="panel-body" class="data"></div>
        </aside>
      </main>
    </div>
    <script type="module" src="./js/weather/app.js"></script>
  </body>
```

- [ ] **Step 3: Write `css/weather.css`** — `@import url('./sheet.css');` then the light `:root` token block copied from `css/urban.css`, plus:

```css
body { background: var(--ink); overflow: hidden; }
.wx-body { display: grid; grid-template-columns: 1fr 340px; height: 100%; min-height: 0; }
.sheet { display: grid; grid-template-rows: auto 1fr; height: 100dvh; }
.field { position: relative; min-width: 0; }
#field { position: absolute; inset: 0; width: 100%; height: 100%; }
#marker-layer { position: absolute; inset: 0; pointer-events: none; }
.tabs { display: flex; gap: 8px; align-items: center; }
.tab { padding: 8px 14px; border: 1px solid var(--rule); background: none; font: 600 12px/1 var(--display); letter-spacing: 0.08em; text-transform: uppercase; }
.tab.is-on { background: var(--amber); color: #fff; border-color: var(--amber); }
.wx { position: absolute; transform: translate(-50%, -50%); pointer-events: auto; display: flex; flex-direction: column; align-items: center; gap: 0; background: none; border: none; padding: 2px; }
.wx__icon { font-size: 17px; line-height: 1; filter: drop-shadow(0 0 2px #fff); }
.wx__name { font-size: 9px; background: rgba(255,255,255,0.85); padding: 0 3px; display: none; }
.wx:hover .wx__name, .wx.is-pinned .wx__name { display: block; }
.wx--region .wx__icon { font-size: 30px; }
.wx--region .wx__name { display: block; font-size: 10px; }
.wx--dim { opacity: 0.35; }
.chip { padding: 5px 10px; border: 1px solid var(--rule); background: none; font-size: 11px; }
.chip.is-on { background: var(--text); color: var(--ink); }
.wx-card { border-top: 1px solid var(--rule); padding: 10px 0; }
.wx-card h3 { margin: 0 0 4px; font: 600 13px/1.2 var(--display); text-transform: uppercase; letter-spacing: 0.06em; }
.wx-error { border: 1px solid var(--amber); padding: 10px; margin: 10px 0; font-size: 12px; }
.attrib { position: absolute; left: 12px; bottom: 8px; margin: 0; font-size: 9px; color: var(--dimmer); }
```

- [ ] **Step 4: Verify the map alone** — temporarily `app.js` does not exist yet, so verify via the test route: add nothing; open `weather.html` expecting a module 404 for `app.js` (fine), OR verify `map.js` from `wx.test.html`? Simplest: create a five-line placeholder `js/weather/app.js`:

```js
import { createWeatherMap } from './map.js';
const map = await createWeatherMap(document.getElementById('field'));
window.__map = map; // placeholder until Task 3 replaces this file
```

Open `http://127.0.0.1:8080/weather.html`, capture the canvas (nested-rAF `toDataURL`), Read it: satellite + coast slab, north up, island filling the field. Then in `browser_evaluate` assert the projection: `window.__map.project(103.85, 1.29)` (city centre) lands inside the canvas rect and further south (larger y) than `project(103.85, 1.42)` (north). Zero console errors.

- [ ] **Step 5: Commit** — "Weather: static top-down map, page skeleton, theme".

---

### Task 3: Tabs, markers, cards, refresh, link, README (`app.js`)

**Files:**
- Create: `js/weather/app.js` (replaces the placeholder)
- Modify: `index.html` (header link), `README.md` (section)

**Interfaces:**
- Consumes: `fetchForecast(kind)` (Task 1), `iconFor(text)` (Task 1), `createWeatherMap(canvas)` (Task 2).

- [ ] **Step 1: Write `js/weather/app.js`:**

```js
/**
 * Weather page wiring: three tabs over one static map.
 * All three forecasts are fetched once at boot (independently — one failing
 * endpoint only breaks its own tab); Refresh refetches everything.
 */
import { fetchForecast } from './wx.js';
import { iconFor } from './icons.js';
import { createWeatherMap } from './map.js';

const REGION_ANCHORS = {
  north: [103.82, 1.418], south: [103.82, 1.27], east: [103.94, 1.35],
  west: [103.7, 1.35], central: [103.82, 1.36],
};

const map = await createWeatherMap(document.getElementById('field'));
const markerLayer = document.getElementById('marker-layer');
const panelTitle = document.getElementById('panel-title');
const panelBody = document.getElementById('panel-body');
const updatedEl = document.getElementById('updated');

const state = { tab: '2h', data: { '2h': null, '24h': null, '4d': null }, err: {}, period: 0 };

async function load(kind) {
  try {
    state.data[kind] = await fetchForecast(kind);
    delete state.err[kind];
  } catch (e) {
    state.err[kind] = e.message;
  }
  if (state.tab === kind || kind === '2h') renderTab();
}

function loadAllKinds() {
  updatedEl.textContent = 'loading…';
  ['2h', '24h', '4d'].forEach(load);
}

// ---- Rendering ----------------------------------------------------------

function fmtTime(d) {
  return d ? d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }) : '—';
}

function marker(lon, lat, icon, name, cls = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `wx ${cls}`;
  b.innerHTML = `<span class="wx__icon">${icon}</span><span class="wx__name">${name}</span>`;
  const place = () => {
    const p = map.project(lon, lat);
    b.style.left = `${p.x}px`;
    b.style.top = `${p.y}px`;
  };
  place();
  map.onResize(place);
  markerLayer.appendChild(b);
  return b;
}

function errBlock(kind, label) {
  const div = document.createElement('div');
  div.className = 'wx-error';
  div.innerHTML = `${label} unavailable (${state.err[kind]}). <button type="button" class="reset">Retry</button>`;
  div.querySelector('button').addEventListener('click', () => load(kind));
  return div;
}

function renderTab() {
  markerLayer.textContent = '';
  panelBody.textContent = '';
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-on', t.dataset.tab === state.tab));

  const d2 = state.data['2h'];
  updatedEl.textContent = `updated ${fmtTime(state.data[state.tab]?.updated)}`;

  if (state.tab === '2h') {
    panelTitle.textContent = '2-hour forecast';
    if (state.err['2h']) return panelBody.appendChild(errBlock('2h', '2-hour forecast'));
    if (!d2) return;
    panelBody.innerHTML = `<p>${d2.validity || 'Next 2 hours'} · tap an area for details.</p>`;
    d2.areas.forEach((a) => {
      const b = marker(a.lon, a.lat, iconFor(a.forecast), a.name);
      b.addEventListener('click', () => {
        document.querySelectorAll('.wx.is-pinned').forEach((x) => x.classList.remove('is-pinned'));
        b.classList.add('is-pinned');
        panelBody.innerHTML = `<div class="wx-card"><h3>${a.name}</h3><p>${iconFor(a.forecast)} ${a.forecast}</p><p>${d2.validity}</p></div>`;
      });
    });
  } else if (state.tab === '24h') {
    panelTitle.textContent = '24-hour forecast';
    if (state.err['24h']) return panelBody.appendChild(errBlock('24h', '24-hour forecast'));
    const d = state.data['24h'];
    if (!d) return;
    const p = d.periods[Math.min(state.period, d.periods.length - 1)];
    Object.entries(REGION_ANCHORS).forEach(([region, [lon, lat]]) => {
      marker(lon, lat, iconFor(p.regions[region]), region.toUpperCase(), 'wx--region');
    });
    const g = d.general;
    panelBody.innerHTML = `
      <div class="wx-card"><h3>General</h3>
        <p>${iconFor(g.forecast)} ${g.forecast}</p>
        <p>${g.tempLow}–${g.tempHigh} °C · ${g.humidityLow}–${g.humidityHigh} % RH · wind ${g.windDir} ${g.windLow}–${g.windHigh} km/h</p></div>
      <div class="wx-card"><h3>Period</h3><div id="chips"></div></div>`;
    const chips = panelBody.querySelector('#chips');
    d.periods.forEach((q, i) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = `chip${i === state.period ? ' is-on' : ''}`;
      c.textContent = q.label;
      c.addEventListener('click', () => { state.period = i; renderTab(); });
      chips.appendChild(c);
    });
  } else {
    panelTitle.textContent = '4-day outlook';
    if (state.err['4d']) return panelBody.appendChild(errBlock('4d', '4-day outlook'));
    const d = state.data['4d'];
    if (!d) return;
    if (d2) d2.areas.forEach((a) => marker(a.lon, a.lat, iconFor(a.forecast), a.name, 'wx--dim'));
    panelBody.innerHTML = d.days.map((x) => `
      <div class="wx-card"><h3>${x.day} <small>${x.date}</small></h3>
        <p>${iconFor(x.forecast)} ${x.forecast}</p>
        <p>${x.tempLow}–${x.tempHigh} °C · ${x.humidityLow}–${x.humidityHigh} % RH · wind ${x.windDir} ${x.windLow}–${x.windHigh} km/h</p></div>`).join('');
  }
}

document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => { state.tab = t.dataset.tab; state.period = 0; renderTab(); })
);
document.getElementById('btn-refresh').addEventListener('click', loadAllKinds);
loadAllKinds();
```

- [ ] **Step 2: `index.html` link** — in the `.ident__sub` span area, after the existing content of the poster hint block insert nothing; instead append to the `.ident__sub` paragraph (inside it, after the subtitle span): ` · <a href="./weather.html">Weather →</a>`. One line; the sheet/poster JS does not touch this element beyond `#sheet-subtitle`'s textContent (verify the anchor survives a reload in both modes).

- [ ] **Step 3: README** — add before "Re-baking the data":

```markdown
## Weather

`weather.html` shows live official forecasts on the same map: the 2-hour
forecast for all 47 NEA areas, the 24-hour regional forecast with its time
periods, and the 4-day outlook — fetched in the browser from data.gov.sg's
open real-time APIs (no key). Forecasts © data.gov.sg.
```

- [ ] **Step 4: Verify live** (Playwright, cache-refreshed): `weather.html` — 47 `.wx` markers on 2-h (count `document.querySelectorAll('#marker-layer .wx').length`), clicking one pins its card; 24-h tab: 5 `.wx--region` badges + ≥1 `.chip`, chip click re-renders; 4-day: 4 `.wx-card`s in the panel; Refresh works (updated line changes or stays sane); zero console errors (besides favicon). Hide `#field` for a DOM screenshot of each tab and Read them. `index.html` sheet + poster modes still fine with the new Weather link. `wx.test.html` still all PASS.

- [ ] **Step 5: Commit** — "Weather: tabs, area markers, region badges, outlook cards, refresh". Push branch: `git push -u origin weather-forecast`.
