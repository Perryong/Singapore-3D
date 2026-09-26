#!/usr/bin/env python3
"""Refresh checked-in explorer snapshots. Uses the existing geospatial Python environment and curl.
Run: tools/.venv/bin/python tools/fetch_explore.py
Use --rail-only to preserve food data; --cached DIR reuses downloaded inputs.
"""
import argparse
import datetime
import json
import math
from pathlib import Path
import subprocess
import tempfile
from rail_data import point, fetch_rail, LTA_PAGE, LTA_FILES, ROUTES

ROOT = Path(__file__).resolve().parents[1]
HAWKERS = 'https://api-open.data.gov.sg/v1/public/api/datasets/d_4a086da0a5553be1d89383cd90d07ecd/poll-download'
QUERY = '[out:json][timeout:90];area["ISO3166-1"="SG"][admin_level=2]->.sg;nwr[amenity~"^(restaurant|cafe|fast_food|food_court|ice_cream)$"](area.sg);out center tags;'



def fetch(url, *args):
    return json.loads(subprocess.check_output(['curl', '-fsSL', '--retry', '2', '--max-time', '120', *args, url]))


def dietary_properties(element):
    tags = element.get('tags', {})
    diet = 'vegan' if tags.get('diet:vegan') == 'only' else 'vegetarian' if tags.get('diet:vegetarian') == 'only' else None
    if not diet:
        return {}
    return {'diet': diet, 'dietSource': f"https://www.openstreetmap.org/{element['type']}/{element['id']}", 'dietEvidence': 'OpenStreetMap dietary tag (community reported)'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cached', type=Path)
    parser.add_argument('--rail-only', action='store_true')
    args = parser.parse_args()
    output = ROOT / 'data/explore'
    previous = json.loads((output / 'stations.geojson').read_text())['features'] if (output / 'stations.geojson').exists() else []
    with tempfile.TemporaryDirectory(prefix='sg-rail-') as temporary:
        stations, exits, lines = fetch_rail(args.cached or temporary, cached=bool(args.cached), previous=previous)
    if args.rail_only:
        food = json.loads((output / 'food.geojson').read_text())['features']
        metadata = json.loads((output / 'metadata.json').read_text())
        hawkers, osm = {'features': []}, {'elements': []}
    elif args.cached:
        hawkers, osm = [json.loads((args.cached / name).read_text()) for name in ['sg-hawkers.json', 'sg-food-osm.json']]
        food, metadata = [], {}
    else:
        hawkers = fetch(fetch(HAWKERS)['data']['url'])
        osm = fetch('https://overpass.kumi.systems/api/interpreter', '--get', '--data-urlencode', 'data=' + QUERY)
        food, metadata = [], {}
    if osm.get('remark'):
        raise ValueError('Incomplete Overpass response: ' + osm['remark'])
    for f in hawkers['features']:
        p = f['properties']
        if p.get('STATUS') not in {'Existing', 'Existing (new)', 'Existing (replacement)', 'Interim Centre'} or not p.get('NAME'):
            continue
        food.append(point('nea-' + str(p['OBJECTID']), p['NAME'], f['geometry']['coordinates'], category='hawker', address=p.get('ADDRESS_MYENV') or '', stalls=p.get('NUMBER_OF_COOKED_FOOD_STALLS') or 0, source='NEA'))
    seen = set()
    for e in osm['elements']:
        t = e.get('tags', {})
        name = t.get('name:en') or t.get('name')
        c = e.get('center', e)
        if not name or not {'lat', 'lon'} <= c.keys():
            continue
        coords = [c['lon'], c['lat']]
        key = (name.casefold(), round(c['lon'], 4), round(c['lat'], 4))
        if key in seen:
            continue
        seen.add(key)
        # OSM centres may duplicate authoritative NEA records; keep individual stalls.
        if t.get('amenity') == 'food_court' and any(math.hypot(coords[0] - f['geometry']['coordinates'][0], coords[1] - f['geometry']['coordinates'][1]) < .0006 for f in food if f['properties']['source'] == 'NEA'):
            continue
        category = {'restaurant': 'restaurant', 'cafe': 'cafe'}.get(t.get('amenity'), 'other')
        address = ' '.join(filter(None, [t.get('addr:housenumber'), t.get('addr:street'), t.get('addr:unit'), t.get('addr:postcode')]))
        food.append(point(f"osm-{e['type']}-{e['id']}", name, coords, category=category, address=address, cuisine=t.get('cuisine', '').replace(';', ', ').replace('_', ' '), hours=t.get('opening_hours', ''), source='OpenStreetMap', **dietary_properties(e)))
    output.mkdir(exist_ok=True)
    # Validate every complete snapshot before replacing any existing output.
    datasets = {'food': food, 'stations': stations, 'exits': exits, 'lines': lines}
    assert len(food) > 100 and len(stations) > 100 and len(exits) > 300 and len(lines) == 6
    def valid(c):
        return len(c) >= 2 and all(isinstance(n, (int, float)) and math.isfinite(n) for n in c[:2]) and 103.5 <= c[0] <= 104.2 and 1.15 <= c[1] <= 1.5
    for name, features in datasets.items():
        assert len({f['properties']['id'] for f in features}) == len(features)
        for f in features:
            g = f['geometry']
            coords = [g['coordinates']] if g['type'] == 'Point' else g['coordinates'] if g['type'] == 'LineString' else [c for line in g['coordinates'] for c in line]
            assert f['properties']['name'].strip() and all(valid(c) for c in coords)
    for name, features in datasets.items():
        if args.rail_only and name == 'food':
            continue
        (output / (name + '.geojson')).write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False, separators=(',', ':')) + '\n')
        print(name, len(features))
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if not args.rail_only:
        metadata.update(fetched=now, osmTimestamp=osm.get('osm3s', {}).get('timestamp_osm_base'))
    metadata.update(railFetched=now, counts={k: len(v) for k, v in datasets.items()},
        sources={'hawkers': 'https://data.gov.sg/datasets/d_4a086da0a5553be1d89383cd90d07ecd/view', 'food': 'https://www.openstreetmap.org/copyright', 'stations': LTA_PAGE, 'exits': LTA_PAGE, 'rail': 'https://www.openstreetmap.org/copyright'},
        railInputs={'lta': LTA_FILES, 'osmRelations': ROUTES, 'ltaStationEdition': 'March 2026', 'ltaCodeEdition': 'January 2025', 'ltaExitEdition': 'July 2026'},
        coverage='Named food places mapped by NEA and OpenStreetMap; not an exhaustive stall directory. MRT markers are interior points of LTA footprints matched to its code list; only matched stations and exits are included. OSM routes may be newer than LTA station coverage. Not live service information.')
    (output / 'metadata.json').write_text(json.dumps(metadata, indent=2) + '\n')


if __name__ == '__main__':
    main()
