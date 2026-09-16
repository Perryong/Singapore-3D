# Singapore weather forecast page — design

**Date:** 2026-09-05  **Status:** approved in chat  **Branch:** `weather-forecast`

## Goal
A live weather dashboard, `weather.html`, showing Singapore's official
forecasts on the site's map: 2-hour forecasts for the 47 NEA areas, the
24-hour forecast for the five regions, and the 4-day outlook — fetched in the
browser from data.gov.sg's real-time APIs on load.

## Data (verified 2026-09-05: HTTP 200, `access-control-allow-origin: *`, no key)
- `https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast` — `data.area_metadata[47]` (name + label_location lat/lon), `data.items[0].forecasts[]` (area → forecast text), `valid_period`.
- `https://api-open.data.gov.sg/v2/real-time/api/twenty-four-hr-forecast` — `data.records[0]`: `general` (temperature, humidity, wind, forecast) and `periods[]` with `timePeriod` + `regions.{north,south,east,west,central}` (text + code).
- `https://api-open.data.gov.sg/v2/real-time/api/four-day-outlook` — `data.records[0].forecasts[4]`: day, forecast text+code, temperature low/high, relativeHumidity, wind.
- **No API key anywhere.** A key on a static Pages site is public; the open
  endpoints suffice. (The key pasted in chat is treated as exposed; rotate it.)
- Captured fixtures for tests: `js/weather/fixtures/*.json` (one per endpoint,
  trimmed to the fields used).

## Decisions
| Question | Answer |
|---|---|
| Map | Reuse the three.js pipeline (coast slab + satellite quad, top-down north-up ortho, fixed camera — no orbit) |
| Layout | Tabs over one map: 2 h / 24 h / 4-day |
| Fetching | Live on load per tab’s needs (all three fetched once, in parallel); manual Refresh button; no polling, no caching |
| Theme | Paper theme; `css/sheet.css` shared chrome + small `css/weather.css` |
| Branch | `weather-forecast` off `main`; merges deploy via the existing Pages workflow |

## Non-goals
Region boundary polygons (badges at region anchor points instead), rainfall/PSI
readings, historical data, mobile app chrome, API key handling.

## §1 Files
New: `weather.html`, `css/weather.css`, `js/weather/app.js`, `js/weather/map.js`,
`js/weather/wx.js` (API fetch + parse), `js/weather/icons.js` (code/text → glyph),
`js/weather/fixtures/*.json`, `js/weather/wx.test.html`.
Modified: `index.html` (a "Weather →" link in the header next to the existing CTA/link
conventions), `README.md` (one section).
Untouched: everything under `js/urban/`, `js/sheet.js`, `js/scene.js` (the weather
page has its own thin app; it imports only `js/urban/geo.js` helpers and data files).

## §2 Map (`js/weather/map.js`)
- `createWeatherMap(canvas) → { project(lon, lat) → {x, y}, resize() }`.
- Loads `data/urban/coast.json` + `data/urban/satellite.json`/`.jpg` via `loadAll`
  from `js/urban/geo.js`; draws the satellite quad beneath the coast slab
  (`plateMesh`) on a white ground; OrthographicCamera straight down, north up,
  frustum fitted to the coast bbox + margin; renders on demand (`render()` after
  load/resize — the scene is static, no rAF loop).
- Lon/lat → scene units: linear interpolation against `satellite.json`'s known
  lon/lat↔scene bbox mapping (bbox corners lon 103.55→x −19.89, lon 104.15→x 22.70,
  lat 1.53→z −15.16, lat 1.13→z 13.05). Error at this extent < 0.1 % — comment it.
- `project` composes lon/lat→scene→screen (camera.project + canvas rect) so the
  HTML overlay positions markers; recomputed on resize only (static camera).

## §3 Tabs (`js/weather/app.js`, `weather.html`)
- Header: SINGAPORE / WEATHER FORECAST title block, "← Analysis board" link,
  Refresh button, "Updated HH:MM" line (from each payload's timestamp).
- Tab strip: `2-hour` | `24-hour` | `4-day` (buttons toggling `body[data-tab]`;
  CSS shows/hides the overlays and side panel content).
- **2-hour:** one absolutely-positioned marker per area in `#marker-layer`
  (`<button class="wx"><span class="wx__icon">🌧️</span><span class="wx__name">Bedok</span></button>`),
  placed via `project()`; hover/tap raises the label (CSS); clicking pins a small
  detail card (area, forecast text, valid period). Marker density is fine at 47.
- **24-hour:** five `.region-badge` elements at fixed anchor lon/lats
  (N 103.82/1.418, S 103.82/1.27, E 103.94/1.35, W 103.70/1.35, C 103.82/1.36)
  showing the selected period's icon + text per region; period chips built from
  `periods[].timePeriod.text`; a summary strip (temp low–high, humidity, wind)
  from `general`.
- **4-day:** side panel cards (day, icon, text, temp range, humidity, wind);
  the map dims (`.field` opacity via CSS) since the outlook is not spatial.
- All three payloads fetched once in parallel at boot (`Promise.allSettled`);
  Refresh refetches all.

## §4 Icons (`js/weather/icons.js`)
- `iconFor(codeOrText) → glyph` mapping NEA codes/texts to emoji:
  Fair/Fair (Day/Night) ☀️/🌙, Partly/Cloudy 🌤️/☁️, Hazy 🌫️, Windy 🌬️,
  Rain/Showers (light/moderate/heavy, passing) 🌦️/🌧️, Thundery showers ⛈️,
  Fair & warm 🌞 — falls back to ❓ plus a console.warn for unknown codes so
  gaps surface. Text is always shown beside the icon, so an unknown glyph never
  hides information.

## §5 Error handling
- Each fetch failing independently → its tab renders an inline "Forecast
  unavailable — Retry" block (button refetches just that endpoint); the map and
  the other tabs are unaffected. Fetch timeout 10 s via `AbortSignal.timeout`.
- Map data failing (coast/satellite) → grey plate fallback (existing geo.js
  behaviour) and markers still position (projection needs only the bbox constants).

## §6 Testing
- `js/weather/wx.test.html` (fixture-driven, no network): parses the three
  fixtures with `wx.js`, asserts 47 areas with finite lat/lon, ≥1 24-h period
  with all five regions, 4 outlook days; asserts `iconFor` returns a non-❓
  glyph for every forecast text in the fixtures; asserts the lon/lat→scene
  conversion round-trips the satellite bbox corners exactly.
- Playwright: `weather.html` live — 47 markers on the 2-h tab, five badges +
  period chips on 24-h, 4 cards on 4-day, no console errors; `index.html`
  unaffected.
