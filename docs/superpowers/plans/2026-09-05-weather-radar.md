# Weather Radar Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A checkweather.sg-style "Radar" tab — first and default on `weather.html` — animating the last 2 h of NEA rain-radar frames over the map with a play/pause scrubber, plus live temperature/wind station dots.

**Architecture:** `js/weather/radar.js` owns frame timestamps/URLs, preloading, the geo-positioned `<img>` overlay and the scrubber; `js/weather/obs.js` fetches and joins the three observation APIs into station records; `js/weather/app.js` adds the radar tab (default) with °C/wind toggle chips, reusing the existing marker/dataset positioning and error-block patterns. Forecast tabs untouched.

**Tech Stack:** vanilla ES modules (no build), NEA radar PNGs as `<img>` (display-only — CORS forbids pixel reads), data.gov.sg v2 real-time APIs (CORS `*`, no key), fixture-driven test page, Playwright MCP.

**Spec:** `docs/superpowers/specs/2026-09-05-weather-radar-design.md`

## Global Constraints

- Branch `weather-forecast` (continues); no build step; no API key.
- Radar URL exactly: `https://www.weather.gov.sg/files/rainarea/50km/v2/dpsri_70km_{YYYYMMDDHHmm}0000dBR.dpsri.png`, minutes ≡ 0 mod 5, timestamps in **SGT (UTC+8) regardless of client timezone**.
- Radar bounds exactly: lat 1.156–1.475, lon 103.565–104.130 (cheeaun/rain-geojson-sg).
- **NEVER draw radar PNGs into a canvas or three.js texture** (CORS-tainted) — `<img>` element only.
- Observation endpoints: `https://api-open.data.gov.sg/v2/real-time/api/{air-temperature,wind-speed,wind-direction}`; payload shape `{data:{stations:[{id,name,location:{latitude,longitude}}], readings:[{timestamp,data:[{stationId,value}]}]}}`; fixtures committed at `js/weather/fixtures/`. Wind speed unit is **knots**; direction is degrees the wind comes FROM.
- Existing conventions: `fetchForecast`-style errors (`AbortSignal.timeout(10000)`, throw with message); the shared `placeEl`/dataset-lon-lat marker positioning and the single `map.onResize` subscriber in app.js; error blocks via `errBlock`-style DOM (textContent for messages); commit trailer:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01JVMunbZoeX3K6XM6gRhpLx`
- Never commit `.agents/`, `.claude/`, `skills-lock.json`, `.playwright-mcp/` (`rm -rf .playwright-mcp` pre-commit).
- Browser verification: Playwright MCP; cache-refresh changed files first; hide `#field` for DOM screenshots (WebGL stalls them); Read every screenshot. Dev server `python3 -m http.server 8080 --bind 127.0.0.1`.

---

### Task 1: Radar timeline + observations parsing + tests (`radar.js` pure parts, `obs.js`, test additions)

**Files:**
- Create: `js/weather/radar.js`, `js/weather/obs.js`
- Modify: `js/weather/wx.test.html` (append checks)

**Interfaces:**
- Produces (`radar.js`): `frameTimestamps(now = new Date()) → string[25]` (newest first, `YYYYMMDDHHmm` in SGT, minutes mod 5, descending 5-min steps); `frameUrl(ts) → string`; `createRadar({ field, project, onResize }) → { setVisible(bool), refresh() }` (Task 2 consumes; the DOM parts are implemented here but only exercised live in Task 2).
- Produces (`obs.js`): `parseObservations(tempJson, speedJson, dirJson) → { updated: Date, stations: [{id, name, lat, lon, tempC?, windKt?, windDeg?}] }` (joined by station id across payloads; a station missing from a payload just lacks that metric); `fetchObservations() → Promise<parsed>` (three parallel fetches, `AbortSignal.timeout(10000)`, any failure throws).

- [ ] **Step 1: Append the failing checks** to `js/weather/wx.test.html` (before the final two `document.getElementById`/`console.log` lines; also add the two imports at the top of the module script):

```js
  import { frameTimestamps, frameUrl } from './radar.js';
  import { parseObservations } from './obs.js';
```

```js
  // Radar timeline (pure; fixed instant 2026-09-05T06:17:30Z = 14:17:30 SGT)
  const ts = frameTimestamps(new Date('2026-09-05T06:17:30Z'));
  check('radar: 25 frames', ts.length === 25);
  check('radar: newest is 202609051415', ts[0] === '202609051415');
  check('radar: oldest is 202609051215', ts[24] === '202609051215');
  check('radar: all mod-5 minutes', ts.every((t) => Number(t.slice(10)) % 5 === 0));
  check('radar: strictly descending 5-min steps', ts.every((t, i) =>
    i === 0 || (Number(ts[i - 1].slice(8, 10)) * 60 + Number(ts[i - 1].slice(10))) -
               (Number(t.slice(8, 10)) * 60 + Number(t.slice(10))) === 5 ||
               t.slice(0, 8) !== ts[i - 1].slice(0, 8)));
  check('radar: url pattern', frameUrl('202609051415') ===
    'https://www.weather.gov.sg/files/rainarea/50km/v2/dpsri_70km_2026090514150000dBR.dpsri.png');
  // SGT is client-TZ independent: same instant expressed differently
  check('radar: TZ-independent', frameTimestamps(new Date('2026-09-04T23:59:59Z'))[0] === '202609050755');

  // Observations (fixtures)
  const [tj, sj, dj] = await Promise.all([
    load('air-temperature'), load('wind-speed'), load('wind-direction'),
  ]);
  const obs = parseObservations(tj, sj, dj);
  check('obs: >=15 stations', obs.stations.length >= 15);
  check('obs: finite coords', obs.stations.every((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon)));
  check('obs: some temps', obs.stations.some((s) => Number.isFinite(s.tempC)));
  check('obs: some wind joined', obs.stations.some((s) => Number.isFinite(s.windKt) && Number.isFinite(s.windDeg)));
  check('obs: updated is a date', obs.updated instanceof Date && !isNaN(obs.updated));
```

- [ ] **Step 2: Open the test page** — expected: module 404 for `radar.js`.

- [ ] **Step 3: Write `js/weather/radar.js`:**

```js
/**
 * NEA rain-radar frames: the last 2 h as 5-minute snapshots, displayed as a
 * geo-positioned <img> overlay with a play/pause scrubber.
 *
 * The PNGs are CORS-locked to weather.gov.sg — displaying them in an <img>
 * is fine, but they must NEVER be drawn into a canvas or texture.
 * Bounds (cheeaun/rain-geojson-sg): lat 1.156–1.475, lon 103.565–104.130.
 */

const RADAR_BASE = 'https://www.weather.gov.sg/files/rainarea/50km/v2/dpsri_70km_';
const BOUNDS = { west: 103.565, east: 104.13, north: 1.475, south: 1.156 };
const FRAMES = 25; // 2 h of 5-min steps
const TICK_MS = 500;
const HOLD_NEWEST_MS = 1500;

// SGT (UTC+8) wall-clock digits for an instant, independent of client TZ.
function sgt(ts) {
  const d = new Date(ts.getTime() + 8 * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

export function frameTimestamps(now = new Date()) {
  const floored = new Date(Math.floor(now.getTime() / 300e3) * 300e3);
  return Array.from({ length: FRAMES }, (_, i) => sgt(new Date(floored.getTime() - i * 300e3)));
}

export function frameUrl(ts) {
  return `${RADAR_BASE}${ts}0000dBR.dpsri.png`;
}

export function createRadar({ field, project, onResize }) {
  const img = document.createElement('img');
  img.className = 'radar';
  img.alt = 'Rain radar';
  img.hidden = true;
  field.appendChild(img);

  const bar = document.createElement('div');
  bar.className = 'radar-bar';
  bar.hidden = true;
  bar.innerHTML = `
    <button type="button" class="radar-bar__play" aria-label="Play or pause">▶</button>
    <input type="range" class="radar-bar__scrub" min="0" max="0" step="1" value="0" aria-label="Radar frame" />
    <span class="radar-bar__time">—</span>`;
  field.appendChild(bar);
  const playBtn = bar.querySelector('.radar-bar__play');
  const scrub = bar.querySelector('.radar-bar__scrub');
  const timeEl = bar.querySelector('.radar-bar__time');

  function place() {
    const tl = project(BOUNDS.west, BOUNDS.north);
    const br = project(BOUNDS.east, BOUNDS.south);
    img.style.left = `${tl.x}px`;
    img.style.top = `${tl.y}px`;
    img.style.width = `${br.x - tl.x}px`;
    img.style.height = `${br.y - tl.y}px`;
  }
  onResize(place);
  place();

  // Timeline: oldest→newest for scrubbing; frames whose Image errors drop out.
  let frames = []; // [{ts, url}]
  let idx = 0;
  let timer = null;

  function label(ts) {
    return `${ts.slice(8, 10)}:${ts.slice(10)}`;
  }

  function setFrame(i) {
    if (!frames.length) return;
    idx = Math.max(0, Math.min(i, frames.length - 1));
    img.src = frames[idx].url;
    img.hidden = false;
    scrub.value = String(idx);
    timeEl.textContent = label(frames[idx].ts);
  }

  function tick() {
    const atEnd = idx >= frames.length - 1;
    setFrame(atEnd ? 0 : idx + 1);
    timer = setTimeout(tick, idx === frames.length - 1 ? HOLD_NEWEST_MS : TICK_MS);
  }

  function play() { if (!timer && frames.length > 1) { playBtn.textContent = '❚❚'; tick(); } }
  function pause() { clearTimeout(timer); timer = null; playBtn.textContent = '▶'; }

  playBtn.addEventListener('click', () => (timer ? pause() : play()));
  scrub.addEventListener('input', () => { pause(); setFrame(Number(scrub.value)); });

  async function refresh() {
    pause();
    const candidates = frameTimestamps();
    const loads = candidates.map((ts) => new Promise((res) => {
      const probe = new Image();
      probe.onload = () => res({ ts, url: frameUrl(ts) });
      probe.onerror = () => res(null);
      probe.src = frameUrl(ts);
    }));
    const loaded = (await Promise.all(loads)).filter(Boolean);
    frames = loaded.reverse(); // oldest → newest
    if (!frames.length) throw new Error('no radar frames available');
    scrub.max = String(frames.length - 1);
    setFrame(frames.length - 1);
    play();
    return frames.length;
  }

  function setVisible(on) {
    bar.hidden = !on;
    img.hidden = !on || !frames.length;
    if (!on) pause();
    else if (frames.length) play();
  }

  return { setVisible, refresh };
}
```

- [ ] **Step 4: Write `js/weather/obs.js`:**

```js
/**
 * Live station observations: air temperature (°C), wind speed (knots) and
 * wind direction (degrees, FROM which the wind blows), joined by station id.
 */

const BASE = 'https://api-open.data.gov.sg/v2/real-time/api/';

async function get(name) {
  const res = await fetch(BASE + name, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(`${name}: ${json.errorMsg || 'API error'}`);
  return json;
}

export function parseObservations(tempJson, speedJson, dirJson) {
  const stations = new Map();
  let updated = null;

  function fold(json, key) {
    const d = json.data;
    const reading = d.readings?.[0];
    if (!reading) return;
    const t = new Date(reading.timestamp);
    if (!updated || t > updated) updated = t;
    const meta = new Map(d.stations.map((s) => [s.id, s]));
    for (const { stationId, value } of reading.data) {
      const m = meta.get(stationId);
      if (!m) continue;
      const rec = stations.get(stationId) ?? {
        id: stationId, name: m.name, lat: m.location.latitude, lon: m.location.longitude,
      };
      rec[key] = value;
      stations.set(stationId, rec);
    }
  }

  fold(tempJson, 'tempC');
  fold(speedJson, 'windKt');
  fold(dirJson, 'windDeg');
  return { updated, stations: [...stations.values()] };
}

export async function fetchObservations() {
  const [t, s, w] = await Promise.all([get('air-temperature'), get('wind-speed'), get('wind-direction')]);
  return parseObservations(t, s, w);
}
```

- [ ] **Step 5: Run the test page** — all PASS (38 previous + 12 new = 50), no console errors.

- [ ] **Step 6: Commit** — `git add js/weather` — "Weather: radar timeline, observation parsing, tests".

---

### Task 2: Radar tab wiring, styles, verification

**Files:**
- Modify: `js/weather/app.js`, `weather.html`, `css/weather.css`, `README.md`

**Interfaces:**
- Consumes: `createRadar({field, project, onResize})`, `frameTimestamps` (indirectly), `fetchObservations()`, `iconFor` unused here; existing `map`, `marker()`/`placeEl`, `errBlock`, `state`.

- [ ] **Step 1: `weather.html`** — in the tablist, add as the FIRST tab: `<button type="button" class="tab is-on" data-tab="radar" role="tab" aria-selected="true">Radar</button>` and change the 2-hour tab's `is-on`/`aria-selected` to off/false. Update the attrib line to end with ` · Radar © NEA / weather.gov.sg`.

- [ ] **Step 2: `js/weather/app.js`** —
  - Imports: `import { createRadar } from './radar.js'; import { fetchObservations } from './obs.js';`
  - After `map` is created: `const radar = createRadar({ field: document.querySelector('.field'), project: map.project, onResize: map.onResize });`
  - State: `state.tab = 'radar'; state.obs = null; state.obsErr = null; state.radarErr = null; state.show = { temp: true, wind: false };`
  - New loader (called on first radar render and from Refresh):

```js
async function loadRadarTab() {
  radar.refresh().then(() => { state.radarErr = null; }).catch((e) => {
    state.radarErr = e.message;
    if (state.tab === 'radar') renderTab();
  });
  try {
    state.obs = await fetchObservations();
    state.obsErr = null;
  } catch (e) {
    state.obsErr = e.message;
  }
  if (state.tab === 'radar') renderTab();
}
```

  - `loadAllKinds()` also calls `loadRadarTab()`.
  - `renderTab()` gains a first branch; `radar.setVisible(state.tab === 'radar')` runs on every call (before the branches):

```js
  if (state.tab === 'radar') {
    panelTitle.textContent = 'Rain radar';
    if (state.radarErr) {
      const div = document.createElement('div');
      div.className = 'wx-error';
      div.append(document.createTextNode(`Radar unavailable (${state.radarErr}). `));
      const b = document.createElement('button'); b.type = 'button'; b.className = 'reset'; b.textContent = 'Retry';
      b.addEventListener('click', loadRadarTab);
      div.appendChild(b);
      panelBody.appendChild(div);
    }
    if (state.obsErr) panelBody.appendChild(errBlock2('Observations', state.obsErr));
    const chips = document.createElement('div');
    chips.className = 'wx-card';
    chips.innerHTML = '<h3>Stations</h3><div id="obs-chips"></div>';
    panelBody.appendChild(chips);
    const chipBox = chips.querySelector('#obs-chips');
    [['temp', '°C'], ['wind', 'Wind']].forEach(([key, lab]) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = `chip${state.show[key] ? ' is-on' : ''}`;
      c.textContent = lab;
      c.addEventListener('click', () => { state.show[key] = !state.show[key]; renderTab(); });
      chipBox.appendChild(c);
    });
    const info = document.createElement('p');
    info.textContent = 'Past 2 hours of rain radar · 5-minute frames. Drag the timeline or let it play.';
    panelBody.appendChild(info);
    for (const s of state.obs?.stations ?? []) {
      if (state.show.temp && Number.isFinite(s.tempC))
        marker(s.lon, s.lat, `${s.tempC.toFixed(1)}°`, s.name, 'wx--obs');
      if (state.show.wind && Number.isFinite(s.windKt) && Number.isFinite(s.windDeg))
        // direction = where the wind comes FROM; arrow points where it blows TO
        marker(s.lon, s.lat, `<i class="wx__arrow" style="transform:rotate(${s.windDeg + 180}deg)">↑</i>${Math.round(s.windKt)}kt`, s.name, 'wx--obs wx--wind');
    }
  } else if (state.tab === '2h') {
```

    (`errBlock2(label, msg)` = a tiny helper mirroring `errBlock` but taking a message string and a retry of `loadRadarTab`; OR generalise `errBlock(kind, label)` — implementer's choice, keep it one helper if trivial.)
  - `marker()`: allow HTML icons — it already sets `innerHTML` for the icon span; pass-through works. Keep the icon span's content as given.
  - Updated line: radar tab shows `state.obs?.updated` via the existing guarded write (extend the guard: `state.tab === 'radar' ? (state.obs || state.obsErr) : (state.data[state.tab] || state.err[state.tab])`).
  - Refresh button already calls `loadAllKinds` → now refreshes radar + obs too.

- [ ] **Step 3: `css/weather.css`** — append:

```css
/* ── Radar tab ─────────────────────────────────────────────────────────── */
.radar { position: absolute; pointer-events: none; opacity: 0.75; mix-blend-mode: multiply; }
.radar-bar {
  position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%);
  display: flex; gap: 10px; align-items: center; padding: 8px 12px;
  background: rgba(255,255,255,0.92); border: 1px solid var(--rule);
}
.radar-bar__play { border: none; background: none; font-size: 14px; width: 24px; }
.radar-bar__scrub { width: 220px; }
.radar-bar__time { font-size: 12px; min-width: 42px; }
.wx--obs .wx__icon { font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.9); padding: 1px 3px; filter: none; }
.wx--obs .wx__name { font-size: 8px; }
.wx__arrow { display: inline-block; font-style: normal; margin-right: 2px; }
```

- [ ] **Step 4: README** — extend the Weather section: "The Radar tab (default) animates the last two hours of NEA rain-radar frames (5-minute snapshots, © NEA / weather.gov.sg) with live temperature and wind readings from island-wide stations."

- [ ] **Step 5: Verify live** (Playwright, cache-refreshed): `weather.html` — Radar tab active by default; `document.querySelector('.radar')` visible with a non-empty `src` matching the URL pattern; scrubber `max ≥ 20`; time label changes over ~2 s of playback; `.wx--obs` dots ≥ 10 with °C on; toggling Wind adds `.wx--wind` markers; forecast tabs still behave exactly as before (47/5+3/4); wx.test.html 50 PASS; zero console errors EXCEPT possible transient radar-frame 404s during probing — those must NOT appear as uncaught errors (Image.onerror handles them; browser network-log 404s for probed frames are acceptable, console errors are not: confirm the console shows none). DOM screenshot of the radar tab (hide `#field`), Read it.

- [ ] **Step 6: Commit + push** — "Weather: rain radar tab with 2-hour animation and station observations"; `git push origin weather-forecast`.
