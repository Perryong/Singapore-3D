#!/usr/bin/env python3
"""
Fetch an Esri World Imagery mosaic for the Singapore urban board's regional
context layer (L-07): 12 tiles (4x3) at z11 covering lon 103.55-104.15,
lat 1.13-1.53, stitched and cropped to data/urban/satellite.jpg plus the
scene-unit bbox in data/urban/satellite.json.

    tools/.venv/bin/python tools/fetch_satellite.py          # fetch + write
    tools/.venv/bin/python tools/fetch_satellite.py --check  # validate only

Uses `requests`, not urllib: the framework Python has no CA bundle for TLS.
Needs network for the tile server; the scene-unit transform below does not
(it replays tools/bake_urban.py's xz() constants off the Nominatim geocode
that is already cached in tools/.cache/, so it works offline once that cache
is warm -- which it is in this repo).

Not imported from tools/bake_urban.py: that script's cx/cy/scale live inline
in one monolithic bake() function, not an importable helper, so refactoring
it just for a three-line reuse is a bigger diff than recomputing the same
three lines here. Both must be kept in sync if ISLAND_WIDTH_UNITS or the
main-island selection ever changes.
"""
import io
import json
import math
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "urban"
CACHE = Path(__file__).resolve().parent / ".cache"

Z = 11
LON_MIN, LON_MAX = 103.55, 104.15
LAT_MIN, LAT_MAX = 1.13, 1.53
TILE = 256
TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
ISLAND_WIDTH_UNITS = 40.0  # must match tools/bake_urban.py


def lonlat_to_tilexy(lon, lat, z):
    """Standard slippy-map tile coordinates (fractional); WebMercator y is
    nonlinear in latitude, which is exactly why cropping must use this, not
    a straight lat interpolation across the mosaic's pixel rows."""
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    lat_rad = math.radians(lat)
    y = (1.0 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2.0 * n
    return x, y


def scene_bbox():
    """Corners of the fetch bbox in scene units, via the same cx/cy/scale
    formula as bake_urban.py's xz(): geocode "Singapore" (osmnx, served from
    the cached Nominatim result -- no network needed here), reproject to
    EPSG:3414, take the main island's centroid and east-west scale.

    This mosaic is WebMercator; the scene grid is SVY21 (EPSG:3414, a
    transverse mercator centred on Singapore). Over this ~70 km extent the
    two projections' scale/shape distortion relative to each other is well
    under 0.5%, so treating the bbox corners as a plain rectangle in both is
    acceptable and matches what the rest of the board already assumes.
    """
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

    corners = [(LON_MIN, LAT_MIN), (LON_MAX, LAT_MAX)]
    pts = gpd.GeoSeries.from_xy([c[0] for c in corners], [c[1] for c in corners], crs="EPSG:4326").to_crs(crs)
    xs = [(p.x - cx) * scale for p in pts]
    zs = [-(p.y - cy) * scale for p in pts]  # +z is south, so max lat -> min z
    return [round(min(xs), 2), round(max(xs), 2)], [round(min(zs), 2), round(max(zs), 2)]


def fetch_mosaic():
    import requests
    from PIL import Image

    x0f, y0f = lonlat_to_tilexy(LON_MIN, LAT_MAX, Z)  # NW corner (min lon, max lat)
    x1f, y1f = lonlat_to_tilexy(LON_MAX, LAT_MIN, Z)  # SE corner (max lon, min lat)
    xt0, xt1 = math.floor(x0f), math.floor(x1f)
    yt0, yt1 = math.floor(y0f), math.floor(y1f)
    nx, ny = xt1 - xt0 + 1, yt1 - yt0 + 1
    print(f"fetching {nx}x{ny} = {nx * ny} tiles at z{Z}")

    mosaic = Image.new("RGB", (nx * TILE, ny * TILE))
    sess = requests.Session()
    for row, ty in enumerate(range(yt0, yt1 + 1)):
        for col, tx in enumerate(range(xt0, xt1 + 1)):
            r = sess.get(TILE_URL.format(z=Z, y=ty, x=tx), timeout=30)
            r.raise_for_status()
            tile = Image.open(io.BytesIO(r.content)).convert("RGB")
            mosaic.paste(tile, (col * TILE, row * TILE))

    # Crop in tile-space (Mercator) pixel coordinates, not by linear lat
    # interpolation -- Mercator y is nonlinear in latitude, so a lat-linear
    # crop would put the wrong rows at the top/bottom edge.
    box = (
        round((x0f - xt0) * TILE), round((y0f - yt0) * TILE),
        round((x1f - xt0) * TILE), round((y1f - yt0) * TILE),
    )
    cropped = mosaic.crop(box)
    out_path = OUT / "satellite.jpg"
    cropped.save(out_path, quality=80)
    print(f"wrote {out_path.name} {cropped.size} {out_path.stat().st_size / 1e3:.0f} KB")


def write_json():
    x, z = scene_bbox()
    doc = {"x": x, "z": z, "attribution": "Imagery © Esri — Source: Esri, Maxar, Earthstar Geographics"}
    path = OUT / "satellite.json"
    path.write_text(json.dumps(doc))
    print(f"wrote {path.name} {doc}")


def check():
    from PIL import Image

    ok = True
    img_path = OUT / "satellite.jpg"
    try:
        with Image.open(img_path) as im:
            im.load()
            print(f"ok   satellite.jpg {im.size} {img_path.stat().st_size / 1e3:.0f} KB")
    except Exception as e:
        print(f"FAIL satellite.jpg: {e}")
        ok = False

    doc = json.loads((OUT / "satellite.json").read_text())
    for axis in ("x", "z"):
        for v in doc[axis]:
            if abs(v) > 90:
                print(f"FAIL satellite.json: {axis} {v} outside +-90")
                ok = False
    if ok:
        print(f"ok   satellite.json {doc}")
    return 0 if ok else 1


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if "--check" in sys.argv:
        return check()
    fetch_mosaic()
    write_json()
    return check()


if __name__ == "__main__":
    sys.exit(main())
