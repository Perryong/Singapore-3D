# Weather radar tab (checkweather.sg-style) — design

**Date:** 2026-09-05  **Status:** approved in chat  **Branch:** `weather-forecast` (continues)
**Reference:** github.com/cheeaun/checkweather-sg / checkweather.sg — its essence adopted: animated 2-hour rain radar + live station observations over a clean map with a time scrubber. Their vector/GeoJSON pipeline and notifications need servers — out of scope; the raw NEA radar PNG is overlaid directly instead.

## Data (verified 2026-09-05)
- **Radar frames:** `https://www.weather.gov.sg/files/rainarea/50km/v2/dpsri_70km_{YYYYMMDDHHmm}0000dBR.dpsri.png` — one per 5 minutes (SGT, minutes ≡ 0 mod 5), all recent marks returned 200. CORS header restricts *reads* (`access-control-allow-origin: https://www.weather.gov.sg`) — display via `<img>` is allowed; NO canvas/texture use of these pixels anywhere. Newest frame can lag ~5–10 min: walk back until one loads.
- **Radar image geographic bounds** (from cheeaun/rain-geojson-sg `index.js`): lat 1.156–1.475, lon 103.565–104.130.
- **Observations:** `https://api-open.data.gov.sg/v2/real-time/api/{air-temperature,wind-speed,wind-direction}` — all CORS `*`, no key; station readings with lat/lon (fixtures committed under `js/weather/fixtures/`).

## Decisions
| Question | Answer |
|---|---|
| Scope | New "Radar" tab on weather.html — first and default; forecast tabs unchanged |
| Radar rendering | Geo-positioned `<img>` overlay (opacity .75, `mix-blend-mode: multiply`), repositioned via the existing shared resize path |
| Animation | 25 five-min frames (2 h), preloaded `Image`s, 404s dropped; play/pause + range scrubber + SGT time label; ~2 fps, hold the newest frame, loop |
| Observations | Toggle chips: °C dots and wind (speed + direction arrow) at station coords; fetched on first radar-tab open; Refresh refetches |
| Non-goals | Notifications, PWA, vectorised radar, 3D, dark redesign, rainfall-station dots |

## §1 Files
New: `js/weather/radar.js` (`frameTimestamps(now) → [ts…25]`, `frameUrl(ts)`, `createRadar(field, project, onResize) → {show, hide, setFrame(i), play, pause, timeline}` — plus the scrubber DOM), `js/weather/obs.js` (`fetchObservations() → {stations:[{id,name,lat,lon,tempC?,windKt?,windDeg?}], updated}` joining the three APIs by station), fixtures `air-temperature.json`, `wind-speed.json`, `wind-direction.json`.
Modified: `weather.html` (Radar tab button first + scrubber bar markup), `js/weather/app.js` (radar tab wiring, obs toggles, default tab 'radar'), `css/weather.css` (overlay, scrubber, chips, dots), `js/weather/wx.test.html` (timestamp + obs parser checks), README (one paragraph), attribution line gains "Radar © NEA / weather.gov.sg".

## §2 Radar overlay geometry
`project(103.565, 1.475)` = top-left, `project(104.130, 1.156)` = bottom-right; the `<img>` is absolutely positioned/sized from those two points and re-placed by the same shared resize callback that moves markers. The bounds sit within the satellite quad, so alignment inherits the map's calibration.

## §3 Timeline behaviour
`frameTimestamps` rounds now-SGT down to a 5-min mark, then lists 25 marks backward. Preload newest-first; a frame whose Image errors is dropped. If the newest k frames all 404 (publish lag), the timeline simply starts at the newest that loaded. All frames failed → error block with Retry. While playing, `setInterval` 500 ms advances; the last (newest) frame holds 1.5 s. Scrubber input pauses playback.

## §4 Observations
Stations joined across the three payloads by station id; missing metrics leave the dot partial (temp-only or wind-only). Dots reuse the marker positioning (dataset lon/lat + shared resize). Wind arrow = a `↑` span rotated `windDeg + 180` (direction = where wind comes FROM; arrow shows where it blows TO — comment this). Chips toggle each layer independently; both off by default except °C on.

## §5 Errors
Radar and observations fail independently (own error blocks in the panel, Retry each). Frame `Image` errors are silent drops. The forecast tabs are untouched by any radar failure.

## §6 Testing
`wx.test.html` additions (fixture/pure-function, no network): `frameTimestamps(fixed Date)` → 25 entries, all mod-5 minutes, descending 5-min steps, correct SGT formatting; `frameUrl` pattern; obs parser: stations have finite coords, joined metrics present for stations that appear in multiple fixtures. Playwright live: radar tab is default with ≥1 frame image visible and a moving scrubber label; °C dots appear; toggling wind adds arrows; forecast tabs behave exactly as before; zero console errors.
