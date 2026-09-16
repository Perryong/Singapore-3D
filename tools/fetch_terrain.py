#!/usr/bin/env python3
"""
Fetch AWS Terrarium elevation tiles for the Singapore urban board's contour
layer (L-01): z11 covering lon 103.60-104.05, lat 1.15-1.48, decoded to
elevation, contoured at 20 m intervals (20-160 m), and written to
data/urban/contours.json in the `lines` contract ({type:"lines", features:
[{p, k, n}]}, k = str(level)).

    tools/.venv/bin/python tools/fetch_terrain.py          # fetch + write
    tools/.venv/bin/python tools/fetch_terrain.py --check   # validate only

Uses `requests`, not urllib: the framework Python has no CA bundle for TLS.
Needs network for the tile server; the scene-unit transform below does not
(it replays tools/bake_urban.py's xz() constants off the Nominatim geocode
that is already cached in tools/.cache/, so it works offline once that cache
is warm -- which it is in this repo).

Not imported from tools/bake_urban.py: that script's cx/cy/scale live inline
in one monolithic bake() function, not an importable helper, so refactoring
it just for a three-line reuse is a bigger diff than recomputing the same
three lines here (same pattern as tools/fetch_satellite.py). Both must be
kept in sync if ISLAND_WIDTH_UNITS or the main-island selection ever changes.
"""
import io
import json
import math
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "urban"
CACHE = Path(__file__).resolve().parent / ".cache"

Z = 11
LON_MIN, LON_MAX = 103.60, 104.05
LAT_MIN, LAT_MAX = 1.15, 1.48
TILE = 256
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
ISLAND_WIDTH_UNITS = 40.0  # must match tools/bake_urban.py
LEVELS = list(range(20, 180, 20))  # 20, 40, ..., 160
DOWNSAMPLE = 3        # keep every 3rd contour point
MIN_POINTS = 6        # drop contours shorter than this (after downsampling)
# Drop contours with any point outside these -- whole-feature drop, not a
# clip: a contour that dips outside the box is discarded entirely rather
# than trimmed at the boundary. X is a plain +-bound; Z is asymmetric
# because the fetched tile grid is z11-tile-aligned, not bbox-aligned, so
# the stitched mosaic naturally overshoots the requested lat range on both
# edges (e.g. its southern edge reaches into Batam/Bintan, whose hills would
# otherwise show up on L-01 south of the Singapore plate). [-13, 13.5] keeps
# contours to Singapore + a thin margin (lat 1.15 -> z=~12.6, lat 1.48 ->
# z=~-12.4), matching the real bake_urban.py coastline instead of the wider
# tile-grid fetch box.
X_BOUND = 25.0
Z_MIN, Z_MAX = -13.0, 13.5


def lonlat_to_tilexy(lon, lat, z):
    """Standard slippy-map tile coordinates (fractional); WebMercator y is
    nonlinear in latitude (same formula fetch_satellite.py uses)."""
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    lat_rad = math.radians(lat)
    y = (1.0 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2.0 * n
    return x, y


def tilexy_to_lonlat(x, y, z):
    """Inverse of lonlat_to_tilexy: fractional tile coords -> lon/lat."""
    n = 2 ** z
    lon = x / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * y / n)))
    return lon, math.degrees(lat_rad)


def make_xz():
    """Same cx/cy/scale formula as bake_urban.py's xz(): geocode "Singapore"
    (osmnx, served from the cached Nominatim result -- no network needed
    here), reproject to EPSG:3414, take the main island's centroid and
    east-west scale. Returns a batch fn (lons, lats) -> list of [x, z]."""
    import geopandas as gpd
    import osmnx as ox

    ox.settings.use_cache = True
    ox.settings.cache_folder = str(CACHE)
    crs = "EPSG:3414"
    sg = ox.geocode_to_gdf("Singapore").to_crs(crs)
    land = sg.geometry.iloc[0]
    main = sorted(getattr(land, "geoms", [land]), key=lambda g: -g.area)[0]
    cx, cy = main.centroid.x, main.centroid.y
    minx, _, maxx, _ = main.bounds
    scale = ISLAND_WIDTH_UNITS / (maxx - minx)

    def xz(lons, lats):
        pts = gpd.GeoSeries.from_xy(lons, lats, crs="EPSG:4326").to_crs(crs)
        return [[round((p.x - cx) * scale, 2), round(-(p.y - cy) * scale, 2)] for p in pts]

    return xz


def fetch_elevation_grid():
    """Download and stitch the tile grid; return (elevation array, xt0, yt0)
    where xt0/yt0 are the integer tile coords of the mosaic's top-left tile
    (needed to map mosaic pixel rows/cols back to fractional tile space)."""
    import numpy as np
    import requests
    from PIL import Image

    x0f, y0f = lonlat_to_tilexy(LON_MIN, LAT_MAX, Z)  # NW corner
    x1f, y1f = lonlat_to_tilexy(LON_MAX, LAT_MIN, Z)  # SE corner
    xt0, xt1 = math.floor(x0f), math.floor(x1f)
    yt0, yt1 = math.floor(y0f), math.floor(y1f)
    nx, ny = xt1 - xt0 + 1, yt1 - yt0 + 1
    print(f"fetching {nx}x{ny} = {nx * ny} terrain tiles at z{Z}")

    mosaic = np.zeros((ny * TILE, nx * TILE), dtype=float)
    sess = requests.Session()
    for row, ty in enumerate(range(yt0, yt1 + 1)):
        for col, tx in enumerate(range(xt0, xt1 + 1)):
            r = sess.get(TILE_URL.format(z=Z, x=tx, y=ty), timeout=30)
            r.raise_for_status()
            im = np.asarray(Image.open(io.BytesIO(r.content)).convert("RGB"), dtype=float)
            elev = im[:, :, 0] * 256 + im[:, :, 1] + im[:, :, 2] / 256 - 32768
            mosaic[row * TILE:(row + 1) * TILE, col * TILE:(col + 1) * TILE] = elev
    return mosaic, xt0, yt0


def build_contours():
    from skimage import measure

    xz = make_xz()
    arr, xt0, yt0 = fetch_elevation_grid()

    features = []
    for level in LEVELS:
        kept = 0
        for c in measure.find_contours(arr, level):
            pts_px = c[::DOWNSAMPLE]
            if len(pts_px) < MIN_POINTS:
                continue
            # pixel (row, col) -> fractional tile coords -> lon/lat
            lonlat = [tilexy_to_lonlat(xt0 + col / TILE, yt0 + row / TILE, Z) for row, col in pts_px]
            scene = xz([ll[0] for ll in lonlat], [ll[1] for ll in lonlat])
            if any(abs(x) > X_BOUND or zc < Z_MIN or zc > Z_MAX for x, zc in scene):
                continue
            features.append({"p": scene, "k": str(level), "n": None})
            kept += 1
        print(f"level {level:3d} m: {kept} features")
    return features


def write_json(features):
    doc = {"type": "lines", "features": features}
    path = OUT / "contours.json"
    path.write_text(json.dumps(doc, separators=(",", ":")))
    print(f"wrote {path.name}: {len(features)} features {path.stat().st_size / 1e3:.0f} KB")


def check() -> int:
    ok = True
    path = OUT / "contours.json"
    doc = json.loads(path.read_text())
    feats = doc.get("features", [])
    if doc.get("type") != "lines":
        print(f"FAIL contours.json: type {doc.get('type')!r} != 'lines'")
        ok = False
    if len(feats) < 1:
        print("FAIL contours.json: no features")
        ok = False
    for f in feats:
        for x, zc in f["p"]:
            if abs(x) > 40 or abs(zc) > 40:
                print(f"FAIL contours.json: coordinate ({x}, {zc}) outside +-40")
                ok = False
                break
    size = path.stat().st_size
    if size > 1_000_000:
        print(f"FAIL contours.json: {size / 1e6:.2f} MB exceeds 1 MB")
        ok = False
    if ok:
        print(f"ok   contours.json {len(feats)} features {size / 1e3:.0f} KB")
    return 0 if ok else 1


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    if "--check" in sys.argv:
        return check()
    write_json(build_contours())
    return check()


if __name__ == "__main__":
    sys.exit(main())
