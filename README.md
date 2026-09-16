# Singapore — multi-dimensional urban analysis

A poster-first analysis board: Singapore as seven exploded axonometric map
layers (natural systems, land use, transport, development evolution, building
height & density, urban fabric, regional context) built from real
OpenStreetMap data. The disassembly slider spreads the stack, callouts and
list rows select a layer, the right panel holds observations and the legend.

Geometry is real; the analytical classifications are not authoritative.
Growth areas are hand-traced boxes, the urban core is a hand-picked box,
and density assumes four storeys wherever OSM has no `building:levels`.

## Running it

The page uses ES modules and an import map, so it needs to be served over
HTTP rather than opened from the filesystem:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

There is no build step and no dependency install. Three.js is pulled from a
CDN by the import map in `index.html`.

Deployment: pushes to `main` publish to GitHub Pages via
`.github/workflows/deploy.yml`.

## Views

The root (`index.html`) is the portrait analysis poster: fixed axonometric
stack with alignment guides, numbered modules on the left, key observations
with live thumbnails on the right, scale bar and compass. "Save PNG" exports
the 3D field; use the browser's print for the whole board.

`index.html?view=sheet` is the interactive sheet behind the poster's
"Explore Singapore in 3D" button: orbit the stack, drive the disassembly
slider, click layers/callouts for their data.

## Weather

`weather.html` shows live official forecasts on the same map: the 2-hour
forecast for all 47 NEA areas, the 24-hour regional forecast with its time
periods, and the 4-day outlook — fetched in the browser from data.gov.sg's
open real-time APIs (no key). Forecasts © data.gov.sg. The Radar tab
(default) animates the last two hours of NEA rain-radar frames (5-minute
snapshots, © NEA / weather.gov.sg) with live temperature and wind readings
from island-wide stations.

## Re-baking the data

The bake reads the full Geofabrik Malaysia–Singapore–Brunei PBF extract via `pyrosm`
(bbox-filtered to Singapore; a Singapore-only extract truncates the south coast), plus a
Natural Earth 10m land extract for the regional context layer — no Overpass
calls, since the public mirrors rate-limit this workload. Fetch both once
(see the docstring in `tools/bake_urban.py` for the exact commands):

```bash
curl -L -o tools/.cache/msb.osm.pbf https://download.geofabrik.de/asia/malaysia-singapore-brunei-latest.osm.pbf
curl -L -o tools/.cache/ne_10m_land.zip https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip
```

Then bake and validate:

```bash
python3 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements.txt
tools/.venv/bin/python tools/bake_urban.py          # parses the local extracts, writes data/urban/*.json
python3 tools/bake_urban.py --check                 # validates the committed outputs
```

`tools/requirements.txt` covers everything above. L-06's dense fabric layer
(`data/urban/fabric.json`) is baked in the same pass, from the same building
GeoDataFrame as L-05, at a much lower 40 m² area floor than
`buildings.json`'s 500 m².

L-01's contours are a separate fetch, since they come from AWS Terrarium
elevation tiles rather than the local PBF: `tools/.venv/bin/python
tools/fetch_terrain.py` decodes SRTM elevation, contours it at 20 m
intervals (20–160 m), and writes `data/urban/contours.json`.

L-07's satellite backdrop is likewise a separate fetch, since it hits the
Esri tile server rather than the local PBF: `tools/.venv/bin/python
tools/fetch_satellite.py` writes `data/urban/satellite.jpg` and
`satellite.json`.

## How it fits together

| File | Job |
| --- | --- |
| `data/urban/layers.js` | The seven layers' copy: names, analysis text, legends, observation thumbnails' areas, colours. |
| `data/urban/*.json` | Baked geometry in scene units (coast, water, parks, contours, land use, roads, rail, buildings, density, fabric, growth, region, satellite bbox). |
| `js/urban/geo.js` | Turns the baked JSON into merged three.js geometry (polygons, lines, ribbons, extrusions, slab plates, textured quads). |
| `js/urban/layers.js` | One builder per layer; returns the exploded groups the scene drives. |
| `js/urban/thumbs.js` | Live circular observation thumbnails via scissor viewports. |
| `js/urban/app.js` | Entry point: loads the data, picks sheet vs poster mode, boots the sheet. |
| `js/sheet.js` | Page wiring shared state: selection, slider, callouts, poster boot. |
| `js/scene.js` | Scene, cameras (orbit + poster orthographic), picking, disassembly. |
| `js/callouts.js` | Margin callouts with leader lines; dashed alignment guides in poster mode. |
| `js/ui.js` | Layer list, modules, data panel, legends, observations. |
| `js/themes.js` | Scene colours and camera settings. |
| `css/sheet.css` / `css/urban.css` | Shared drawing-sheet chrome / the board's paper theme and poster layout. |
| `tools/` | Data pipeline: `bake_urban.py`, `fetch_terrain.py`, `fetch_satellite.py`. |

Imagery © Esri — Source: Esri, Maxar, Earthstar Geographics. Map data ©
OpenStreetMap contributors.
# Singapore-3D
