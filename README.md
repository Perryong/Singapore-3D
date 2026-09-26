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

## Food and MRT explorer

`explore.html` is a full-screen food directory and geographic MRT map. Search
food names, cuisines, addresses or station codes; filter food categories;
select places for nearby MRT stations (or stations for nearby food). The
MRT overlay can be switched off and the current view can be shared by URL.
On small screens, the results become a collapsible bottom panel.

The page uses pinned MapLibre GL JS 5.12.0 from UNPKG and OpenFreeMap's dark
basemap. It needs an internet connection for map tiles; the directory uses
checked-in snapshots and remains usable if the basemap fails. No API key,
React migration or build step is required. ThreeUI remains installed but is
not needed for this page's native HTML controls.

Data in `data/explore/` contains 8,386 named food places, 143 MRT stations,
528 entrance points and six MRT lines. NEA records are combined with mapped
OpenStreetMap restaurants, cafés and other food outlets. Coverage is not a
complete list of individual stalls. `metadata.json` records the download
date and source links; source records may be older. Rail data is a snapshot,
not a statement of current operational service. Nearby distances are
straight-line distances, not walking routes. Opening hours are source text,
not a live open/closed indication.

Refresh snapshots and run the regression/data check:

```bash
tools/.venv/bin/python -m pip install -r tools/requirements.txt
tools/.venv/bin/python tools/fetch_explore.py --rail-only
tools/.venv/bin/python tools/rail_data_test.py
node js/explore/core.test.mjs
```

Omit `--rail-only` to also refresh food. The importer uses the existing geospatial
Python environment plus xlrd for LTA’s XLS code list, and `curl` with verified HTTPS;
Overpass may time out or rate-limit large queries. Snapshots are validated
before replacing the existing datasets. Source attribution:

- [NEA hawker centres](https://data.gov.sg/datasets/d_4a086da0a5553be1d89383cd90d07ecd/view), Singapore Open Data Licence.
- [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL; food data fetched through Overpass.
- [LTA DataMall](https://datamall.lta.gov.sg/content/datamall/en/static-data.html): March 2026 station footprints, January 2025 code list and July 2026 exits. Markers use interior footprint points; only code-matched MRT stations and their entrances are included. Repeated exit labels may represent distinct entrances.
- Rail geometry comes directly from eight OpenStreetMap route relations (including branches), recorded in metadata. OSM routes may be newer than LTA station coverage. No SG Rail Data dependency remains.
- Basemap © OpenFreeMap, OpenMapTiles and OpenStreetMap contributors.

The Vegetarian filter beside More food includes 75 existing venues tagged
`diet:vegetarian=only` or `diet:vegan=only` in the OSM food snapshot. It retains
restaurant/café categories and links each dietary label to its OSM source.
Venues offering only some vegetarian options are excluded. This is community
data, not dietary certification or an exhaustive current directory. Full food
refreshes preserve these tags automatically. Test the importer with
`tools/.venv/bin/python tools/food_data_test.py`.

### Last-train preview

Use **Last trains** beside the map controls to browse scheduled departures with
an evening timeline (21:00–02:00 Singapore time). Select a station, choose the
service date, or use Play/Now. Times after midnight belong to the preceding
service date. Turning the mode off restores the previous food/MRT filters,
selection, camera and panel visibility. Shared previews open paused.

The snapshot covers all 143 mapped MRT stations across six lines, with 707
directional records (including rows without a last departure). Downtown and
North East schedules use [SBS Transit's published tables](https://www.sbstransit.com.sg/first-train-last-train),
with editions dated 28 February 2025 and 10 December 2024. The 106 stations
served by SMRT use [SGTrains station tables](https://www.sgtrains.com/guide-traintiming),
a secondary source citing LTA and SMRT, captured on 26 September 2026.
Each departure links to its source; short services and connection notes are retained.
SGTrains does not supply a timetable edition date, so it is left unknown.
Its current Circle Line schedules use the completed loop; the map's older LTA
station geometry retains CE1/CE2 and excludes the three newer loop stations.
Holiday extensions, temporary changes and live delays are unverified; the map
shows a regular-schedule preview, not transfer feasibility or live train tracking.

Refresh and verify without adding dependencies:

```bash
python3 tools/fetch_last_trains.py
python3 tools/last_trains_test.py
node js/explore/last-trains.test.mjs
```

`--cached path/to/sbs.html` reuses a downloaded operator page. Changed source
editions/layouts, unknown station codes and duplicate records require review
before replacing the snapshot. The importer writes the validated snapshot
atomically. Last-train data loads on demand and failure leaves the explorer usable.

SMRT refresh input is `tools/fixtures/last-trains/sgtrains.json`, a capture of
public station tables, not a live feed. Update those tables and their retrieval
date from SGTrains, then run the importer; `--smrt-capture path.json` selects an
alternative capture. The importer requires every mapped SMRT station and line,
checks daily last-train headers, and rejects malformed times or duplicate pages.
SBS refreshes preserve this captured SMRT coverage. CG/CE station codes map to
East-West/Circle lines without changing the map geometry. LRT is out of scope.

### Researched vegetarian additions

The Vegetarian filter also includes 11 official Greendot listings reviewed on
26 September 2026: ten new food/bakery locations and the existing Tampines 1
venue with its missing dietary tag restored. These bring the filter to 86
vegetarian/vegan places. Sources are the official outlet map and ordering
directory; the new pins use operator-supplied coordinates, not shop entrances.
Addresses include unit numbers where published. Hours are left blank unless
already available, rather than inferred.

`data/explore/vegetarian-venues.geojson` preserves these curated records across
food refreshes. Records replace matching IDs, making repeated imports idempotent;
when adding a venue already mapped, reuse its existing OSM ID to avoid duplicate
pins. Each record carries dietary evidence, a source link and review date.

A follow-up review corrected six existing records (17 records now have website review dates). See [vegetarian review](docs/data-audits/2026-09-26-vegetarian-review.md) for evidence and the 69 records still awaiting fresh operator review. The map contains 86 vegetarian/vegan storefront records, including two separately identified Pine Tree Cafe units.
