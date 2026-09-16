#!/usr/bin/env python3
"""
Bake Singapore geometry from OpenStreetMap into scene-unit JSON for the
urban analysis board. Run once; the outputs in data/urban/ are committed.

    python3 tools/bake_urban.py          # bake from the local extracts
    python3 tools/bake_urban.py --check  # validate existing outputs only

Source is a local OSM PBF extract parsed with pyrosm (no Overpass: the public
mirrors rate-limit this workload), plus Natural Earth land polygons for the
regional context layer. Fetch both into tools/.cache/ once:

    curl -L -o tools/.cache/msb.osm.pbf https://download.geofabrik.de/asia/malaysia-singapore-brunei-latest.osm.pbf
    curl -L -o tools/.cache/ne_10m_land.zip https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip

The Malaysia-Singapore-Brunei extract, not a Singapore-only one, because the
Singapore-only BBBike extract clips off the real south coast (Tuas, the
south/southwest shore) -- `bake()` passes pyrosm a bounding_box to keep the
read scoped to the working area. The scene's origin/scale still come from
osmnx's Nominatim geocode, served from the osmnx cache in tools/.cache/; the
bake needs no network once that is warm.

Scene units: the main island spans 40 units east-west, origin at the main
island centroid, +x east, +z south (three.js Y-up right-handed). All files
share one {type, features} shape; see FILES below.
"""
import argparse
import json
import math
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "urban"
ISLAND_WIDTH_UNITS = 40.0
BOUND = 80.0
REGION_BOUND = 260.0

FILES = {
    "coast": "polys", "water": "polys", "parks": "polys", "contours": "lines",
    "landuse": "polys", "roads": "lines", "rail": "lines", "buildings": "polys",
    "density": "polys", "growth": "polys", "region": "lines", "fabric": "polys",
}

# Layers whose "k" is an enumeration the renderer switches on.
KINDS = {
    "parks": {"forest", "park", "open"},
    "landuse": {"residential", "commercial", "mixed", "institutional", "core"},
    "roads": {"primary", "secondary"},
    "growth": {"recent", "future", "renewal"},
}
QUANTILES = {0, 1, 2, 3, 4}


# Per-file coordinate-bound overrides; anything not listed uses BOUND.
BOUNDS = {"region": REGION_BOUND, "coast": 30.0}


def check() -> int:
    bad = 0
    for name, kind in FILES.items():
        path = OUT / f"{name}.json"
        if not path.exists():
            print(f"MISSING {path}")
            bad += 1
            continue
        file_bad = 0
        doc = json.loads(path.read_text())
        feats = doc.get("features", [])
        if doc.get("type") != kind:
            print(f"{name}: type {doc.get('type')!r} != {kind!r}")
            file_bad += 1
        if not feats and name != "contours":
            print(f"{name}: no features")
            file_bad += 1
        limit = BOUNDS.get(name, BOUND)
        for f in feats:
            rings = f["p"] if kind == "polys" else [f["p"]]
            for ring in rings:
                for x, z in ring:
                    if abs(x) > limit or abs(z) > limit:
                        print(f"{name}: coordinate ({x}, {z}) outside ±{limit}")
                        file_bad += 1
                        break
        if name in KINDS:
            for k in sorted({f.get("k") for f in feats} - KINDS[name], key=repr):
                print(f"{name}: kind {k!r} not one of {sorted(KINDS[name])}")
                file_bad += 1
        if name == "density":
            for q in sorted({f.get("q") for f in feats} - QUANTILES, key=repr):
                print(f"density: q {q!r} outside 0-4")
                file_bad += 1
        if name == "growth" and any(not f.get("indicative") for f in feats):
            print("growth: every feature must be indicative")
            file_bad += 1
        size = path.stat().st_size / 1e6
        print(f"{'FAIL' if file_bad else 'ok':4s} {name:10s} {len(feats):6d} features {size:5.2f} MB")
        bad += file_bad
    total = sum((OUT / f"{n}.json").stat().st_size for n in FILES if (OUT / f"{n}.json").exists()) / 1e6
    print(f"total {total:.2f} MB")
    # ponytail: fabric.json is one big file loaded up front like every other
    # layer; split by tile or lazy-load it if load time ever becomes a
    # problem. Ceiling raised 8 -> 30 MB, not 12: a dry replay of this chain
    # against the local PBF (min_area=40 -> escalated to 80, both still
    # ~15 MB) showed Singapore's real OSM building inventory is far denser
    # than a 12 MB budget assumes -- 100k+ footprints survive even an
    # 80 m2 floor, and area filtering alone can't buy back the difference
    # without landing above the existing 500 m2 buildings.json cutoff, which
    # would make L-06 sparser, not denser. The full MSB extract (south strip
    # included, Johor excluded via the content clip) measured ~28-29 MB; 30
    # covers that with a little headroom. Only the 4 MB-target escalation
    # inside bake() adjusts fabric's min_area -- one escalation mechanism,
    # not two; a second, total-triggered one used to live here and got
    # deleted (it couldn't converge: 40->80 already barely moves the needle,
    # so re-baking fabric again off a total that's still over just repeats
    # the same small shave for nothing).
    if total > 30:
        print("total exceeds 30 MB")
        bad += 1
    return 1 if bad else 0


def bake() -> int:
    import geopandas as gpd
    import osmnx as ox
    from pyrosm import OSM
    from shapely.geometry import box, shape
    from shapely.ops import linemerge, unary_union

    CACHE = Path(__file__).resolve().parent / ".cache"
    ox.settings.use_cache = True
    ox.settings.cache_folder = str(CACHE)
    ox.settings.log_console = True

    CRS = "EPSG:3414"  # SVY21 / Singapore TM, metres
    OUT.mkdir(parents=True, exist_ok=True)

    # ---- Projection basis (Nominatim geocode) ------------------------------
    # `main` is used ONLY to fix cx/cy/scale below -- coast.json's own
    # polygons now come from the PBF's place=island tags (see ~line 240),
    # not from this geocode, but satellite.json and fetch_terrain.py replay
    # these same constants, so they must keep coming from this exact geocode.
    sg = ox.geocode_to_gdf("Singapore").to_crs(CRS)
    land = sg.geometry.iloc[0]
    main = sorted(getattr(land, "geoms", [land]), key=lambda g: -g.area)[0]
    # cx, cy, scale are fixed HERE, once, from this original Nominatim `main`
    # polygon, and every later section's xz() call closes over these same
    # three names -- `main` itself must never be reassigned after this point.
    cx, cy = main.centroid.x, main.centroid.y
    minx, _, maxx, _ = main.bounds
    scale = ISLAND_WIDTH_UNITS / (maxx - minx)

    def xz(x, y):  # projected metres -> scene units; +z is south
        return [round((x - cx) * scale, 2), round(-(y - cy) * scale, 2)]

    def ring(coords):
        # 2 dp in scene units is ~12 m on the ground, so neighbouring source
        # vertices routinely round to the same point; drop the repeats.
        out = []
        for x, y in coords:
            p = xz(x, y)
            if not out or p != out[-1]:
                out.append(p)
        return out

    def merge(geoms):
        """Contiguous segments -> long polylines (pyrosm emits per-node edges)."""
        merged = linemerge([l for g in geoms if g is not None and not g.is_empty
                            for l in getattr(g, "geoms", [g])])
        return list(getattr(merged, "geoms", [merged]))

    def poly_feats(geoms, kinds=None, vals=None, names=None, tol=20.0, min_area=0.0):
        out = []
        for i, g in enumerate(geoms):
            if g is None or g.is_empty:
                continue
            g = g.simplify(tol, preserve_topology=True)
            for p in getattr(g, "geoms", [g]):
                if p.geom_type != "Polygon" or p.area < min_area:
                    continue
                rings = [r for r in ([ring(p.exterior.coords)]
                          + [ring(h.coords) for h in p.interiors]) if len(r) >= 4]
                if not rings:
                    continue
                out.append({
                    "p": rings,
                    "k": kinds[i] if kinds is not None else None,
                    "v": vals[i] if vals is not None else None,
                    "n": names[i] if names is not None else None,
                })
        return out

    def line_feats(geoms, kinds=None, names=None, tol=20.0):
        out = []
        for i, g in enumerate(geoms):
            if g is None or g.is_empty:
                continue
            g = g.simplify(tol, preserve_topology=True)
            for l in getattr(g, "geoms", [g]):
                if l.geom_type != "LineString":
                    continue
                pts = ring(l.coords)
                if len(pts) < 2:
                    continue
                out.append({
                    "p": pts,
                    "k": kinds[i] if kinds is not None else None,
                    "n": names[i] if names is not None else None,
                })
        return out

    def write(name, kind, feats, extra=None):
        doc = {"type": kind, "features": feats}
        if extra:
            doc.update(extra)
        (OUT / f"{name}.json").write_text(json.dumps(doc, separators=(",", ":")))
        print(f"wrote {name}: {len(feats)} features")

    # The BBBike Singapore-only extract clipped the real south coast (Tuas,
    # the south/southwest shore) out of its own bounding rectangle -- every
    # PBF-sourced layer fell short of the true island there. The Geofabrik
    # Malaysia-Singapore-Brunei extract covers it; `bounding_box` limits
    # pyrosm's read to the working area instead of parsing all three
    # countries.
    osm = OSM(str(CACHE / "msb.osm.pbf"), bounding_box=[103.55, 1.13, 104.12, 1.53])

    def prep(gdf, geom_types):
        """Any pyrosm result -> non-null wanted geometry, projected, 0..n indexed.
        pyrosm returns None when a query matches nothing."""
        if gdf is None or gdf.empty:
            return gpd.GeoDataFrame({"geometry": []}, crs=CRS)
        gdf = gdf[gdf.geometry.notna()]
        gdf = gdf[gdf.geometry.geom_type.isin(geom_types)]
        return gdf.to_crs(CRS).reset_index(drop=True)

    def features(custom_filter, geom_types):
        """Tagged features from the local PBF."""
        return prep(osm.get_data_by_custom_criteria(custom_filter=custom_filter,
                                                    filter_type="keep"), geom_types)

    def col(gdf, name):
        """Positional list for a tag pyrosm may expose as a column or only inside
        its catch-all `tags` JSON blob."""
        if name in gdf.columns:
            return list(gdf[name])
        if "tags" not in gdf.columns:
            return [None] * len(gdf)
        return [json.loads(t).get(name) if isinstance(t, str) else None for t in gdf["tags"]]

    POLYS = ["Polygon", "MultiPolygon"]
    LINES = ["LineString", "MultiLineString"]

    # Coastline: every place=island polygon from the PBF (main island plus
    # Sentosa, Tekong, Ubin, Jurong Island, ...), not the Nominatim geocode --
    # that's the country's *territorial* extent (a bulge into the Strait that
    # reaches Batam), not a tight coastline. area >= 0.5 km2 drops slivers;
    # the centroid bound drops territorial-water / neighbouring-country
    # candidates (Batam among them) that clear the area bar but sit outside
    # the plausible island field; overlaps between what's left (two of the
    # candidates here share a boundary) are deduped via unary_union, then
    # min_area again to drop the sub-threshold sliver that split can leave
    # behind at a trimmed edge. Largest (the main island) gets the coarser
    # coastline tolerance; the rest, being small, get the finer one.
    candidates = [g for g in features({"place": ["island"]}, POLYS).geometry if g.area >= 500_000]
    islands = []
    for g in candidates:
        ix, iz = xz(g.centroid.x, g.centroid.y)
        if -22 <= ix <= 23 and -13 <= iz <= 13:
            islands.append(g)
    if islands:
        merged = unary_union(islands)
        islands = list(getattr(merged, "geoms", [merged]))
    islands.sort(key=lambda g: -g.area)

    write("coast", "polys",
          poly_feats(islands[:1], tol=25.0, min_area=500_000)
          + poly_feats(islands[1:], tol=15.0, min_area=500_000))

    # ---- Content clip -------------------------------------------------------
    # Everything below is sourced from the wider Malaysia-Singapore-Brunei
    # extract, which reaches across the Strait into Johor Bahru -- clip every
    # PBF-sourced layer to Singapore's own islands (buffered 300 m so a
    # feature that merely touches the coast isn't dropped for sitting a few
    # metres over the line) so nothing floats off the plate. Growth/region/
    # satellite are untouched: hand-authored or already scoped to their own
    # boxes. Contours are clipped separately, by z bound, in fetch_terrain.py.
    singapore = unary_union(islands).buffer(300)

    def clip(gdf):
        return gdf[gdf.geometry.intersects(singapore)].reset_index(drop=True)

    # ---- Water ------------------------------------------------------------
    water = clip(features({"natural": ["water"], "waterway": ["river", "canal"]}, POLYS))
    write("water", "polys", poly_feats(list(water.geometry), min_area=20_000))

    # ---- Parks ------------------------------------------------------------
    parks = clip(features({"leisure": ["park", "nature_reserve", "garden"],
                           "landuse": ["forest", "grass", "recreation_ground"]}, POLYS))
    kinds = []
    for leisure, landuse in zip(col(parks, "leisure"), col(parks, "landuse")):
        if leisure == "nature_reserve" or landuse == "forest":
            kinds.append("forest")
        elif leisure in ("park", "garden"):
            kinds.append("park")
        else:
            kinds.append("open")
    write("parks", "polys", poly_feats(list(parks.geometry), kinds=kinds, min_area=15_000))

    # ---- Contours -----------------------------------------------------------
    # Baked separately by tools/fetch_terrain.py (AWS Terrarium tiles -> SRTM
    # contours), which writes data/urban/contours.json directly. Nothing to
    # do here -- and nothing must overwrite that file, so this bake leaves
    # contours.json alone rather than re-touching it with a stub.

    # ---- Land use ---------------------------------------------------------
    # "government" is tagged office=government on this PBF, not amenity=government
    # (amenity=government matches 0 features here) -- keep both keys queried.
    lu = clip(features({"landuse": ["residential", "commercial", "retail", "industrial"],
                        "amenity": ["university", "hospital", "school", "college",
                                    "clinic", "place_of_worship"],
                        "office": ["government"]}, POLYS))
    kmap = {"residential": "residential", "commercial": "commercial",
            "retail": "commercial", "industrial": "mixed"}
    kinds = []
    for amenity, landuse, office in zip(col(lu, "amenity"), col(lu, "landuse"), col(lu, "office")):
        is_institutional = isinstance(amenity, str) or isinstance(office, str)
        kinds.append("institutional" if is_institutional else kmap.get(landuse, "mixed"))
    lu_feats = poly_feats(list(lu.geometry), kinds=kinds, min_area=8_000)
    # Primary urban core: CBD + Marina Bay, one hand-picked box (lon/lat).
    core_ll = box(103.840, 1.270, 103.870, 1.300)
    core = gpd.GeoSeries([core_ll], crs="EPSG:4326").to_crs(CRS).iloc[0].intersection(main)
    lu_feats += poly_feats([core], kinds=["core"], names=["Central Business District"], tol=10.0)
    write("landuse", "polys", lu_feats)

    # ---- Roads ------------------------------------------------------------
    edges = clip(prep(osm.get_network(network_type="driving"), LINES))
    def road_kind(h):
        h = h[0] if isinstance(h, list) else h
        if h in ("motorway", "trunk", "primary", "motorway_link", "trunk_link"):
            return "primary"
        if h in ("secondary", "tertiary"):
            return "secondary"
        return None
    edges["k"] = [road_kind(h) for h in col(edges, "highway")]
    edges = edges[edges["k"].notna()]
    road_geoms, road_kinds = [], []
    for k, grp in edges.groupby("k"):
        lines = merge(list(grp.geometry))
        road_geoms += lines
        road_kinds += [k] * len(lines)
    write("roads", "lines", line_feats(road_geoms, kinds=road_kinds, tol=15.0))

    # ---- Rail -------------------------------------------------------------
    rail = clip(features({"railway": ["subway", "light_rail"]}, LINES))
    rail["n"] = [n if isinstance(n, str) else "" for n in col(rail, "name")]
    rail_geoms, rail_names = [], []
    for n, grp in rail.groupby("n"):
        lines = merge(list(grp.geometry))
        rail_geoms += lines
        rail_names += [n or None] * len(lines)
    write("rail", "lines", line_feats(rail_geoms, names=rail_names, tol=15.0))

    # ---- Buildings --------------------------------------------------------
    # ponytail: whole-island footprints are the size ceiling. min_area is the
    # knob that keeps the bundle under 8 MB (150 m2 -> 13 MB, 500 m2 -> 6.2 MB);
    # for finer footprints, split buildings.json by tile and load on demand.
    b = clip(prep(osm.get_buildings(), POLYS))
    def levels(v):
        try:
            return max(1, int(float(str(v).split(";")[0])))
        except Exception:
            return 4
    lv = [levels(v) for v in col(b, "building:levels")]
    write("buildings", "polys", poly_feats(list(b.geometry), vals=lv, tol=3.0, min_area=500.0))

    # ---- Fabric (dense figure-ground, all buildings) -----------------------
    # Same building GeoDataFrame as above, far less filtered: a fine-grain
    # footprint layer for L-06, dropping only slivers under 40 m2. No `v` --
    # this layer is silhouette-only, so levels don't matter.
    #
    # ponytail: the 4 MB target below is aspirational, not a hard floor --
    # a dry replay against the local PBF found ~127k buildings clear a 40 m2
    # floor (~15 MB) and barely fewer (~123k, ~15 MB) clear 80 m2, because
    # most of Singapore's mapped footprints already sit well above that
    # size; the escalation step is kept for whatever future extract it does
    # help on, but check()'s ceiling (see check() above) is sized for the
    # real ~15 MB outcome, not this target.
    fabric_feats = poly_feats(list(b.geometry), tol=2.0, min_area=40.0)
    fabric_bytes = len(json.dumps({"type": "polys", "features": fabric_feats}, separators=(",", ":")))
    if fabric_bytes > 4_000_000:
        print(f"fabric: {fabric_bytes / 1e6:.2f} MB over the 4 MB target at min_area=40, "
              f"raising min_area to 80")
        fabric_feats = poly_feats(list(b.geometry), tol=2.0, min_area=80.0)
        fabric_bytes = len(json.dumps({"type": "polys", "features": fabric_feats}, separators=(",", ":")))
    print(f"fabric: {len(fabric_feats)} features, {fabric_bytes / 1e6:.2f} MB")
    write("fabric", "polys", fabric_feats)

    # ---- Density hex grid -------------------------------------------------
    R = 500.0  # metres, hex circumradius
    dx, dy = 1.5 * R, math.sqrt(3) * R
    bx0, by0, bx1, by1 = main.bounds
    cells = []
    col_i = 0
    x = bx0
    while x < bx1 + R:
        y = by0 - (dy / 2 if col_i % 2 else 0)
        while y < by1 + R:
            hexagon = shape({"type": "Polygon", "coordinates": [[
                (x + R * math.cos(math.radians(60 * k)), y + R * math.sin(math.radians(60 * k)))
                for k in range(7)]]})
            if hexagon.intersects(main):
                cells.append(hexagon)
            y += dy
        x += dx
        col_i += 1
    grid = gpd.GeoDataFrame(geometry=cells, crs=CRS)
    b["score"] = b.geometry.area * lv
    joined = gpd.sjoin(b[["score", "geometry"]], grid, how="inner", predicate="intersects")
    score = joined.groupby("index_right")["score"].sum()
    grid["v"] = score.reindex(grid.index).fillna(0.0)
    # q is 0 for cells with no built form, then quartiles 1-4 of the rest,
    # so the contract's 0-4 range holds.
    nz = grid["v"][grid["v"] > 0]
    qs = nz.quantile([0.25, 0.5, 0.75]).tolist()
    def quant(v):
        return 0 if v <= 0 else 1 + sum(v > q for q in qs)
    feats = poly_feats(list(grid.geometry), vals=[round(v) for v in grid["v"]], tol=1.0)
    for f, v in zip(feats, grid["v"]):
        f["q"] = quant(v)
    write("density", "polys", feats)

    # ---- Growth areas (hand-authored, indicative) --------------------------
    src = json.loads((OUT / "growth.src.json").read_text())["features"]
    polys = gpd.GeoSeries([shape({"type": "Polygon", "coordinates": [f["ll"] + [f["ll"][0]]]})
                           for f in src], crs="EPSG:4326").to_crs(CRS)
    feats = poly_feats(list(polys), kinds=[f["k"] for f in src], names=[f["n"] for f in src], tol=5.0)
    for f in feats:
        f["indicative"] = True
    write("growth", "polys", feats)

    # ---- Regional context --------------------------------------------------
    # The PBF extract stops at the Indonesian border, so the surrounding
    # landmasses come from Natural Earth 10m land.
    box_ll = box(103.2, 0.75, 104.7, 1.75)
    ne = gpd.read_file("zip://" + str(CACHE / "ne_10m_land.zip"))
    ne = ne[ne.intersects(box_ll)].copy()
    ne["geometry"] = ne.intersection(box_ll)
    ne = ne.to_crs(CRS)
    labels = json.loads((OUT / "region_labels.json").read_text())["labels"]
    pts = gpd.GeoSeries.from_xy([l["lon"] for l in labels], [l["lat"] for l in labels],
                                crs="EPSG:4326").to_crs(CRS)
    lab = [{"t": l["t"], "x": xz(p.x, p.y)[0], "z": xz(p.x, p.y)[1]} for l, p in zip(labels, pts)]
    write("region", "lines", line_feats(list(ne.boundary), tol=60.0), extra={"labels": lab})
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.check:
        return check()
    return bake()


if __name__ == "__main__":
    sys.exit(main())
