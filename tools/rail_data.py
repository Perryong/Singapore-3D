"""LTA station/exit imports and direct OpenStreetMap route geometry."""
import json
import re
import subprocess
import zipfile
from pathlib import Path

import geopandas as gpd
import xlrd
from shapely import union_all

LTA_PAGE = 'https://datamall.lta.gov.sg/content/datamall/en/static-data.html'
LTA_FILES = {
    'stations': 'https://datamall.lta.gov.sg/content/dam/datamall/datasets/Geospatial/TrainStation_Mar2026.zip',
    'exits': 'https://datamall.lta.gov.sg/content/dam/datamall/datasets/Geospatial/TrainStationExit.zip',
    'codes': 'https://datamall.lta.gov.sg/content/dam/datamall/datasets/Geospatial/Train%20Station%20Codes%20and%20Chinese%20Names.zip',
}
# One direction per route plus the airport/Circle branches; sourced from the OSM Singapore/Rail_Transport wiki.
ROUTES = {'NS': [2312797], 'EW': [2312796, 7981690], 'NE': [2293545], 'CC': [2076291, 7981669], 'DT': [2313458], 'TE': [2383439]}
LINE_INFO = {'NS': ('North South Line', '#f05d69'), 'EW': ('East West Line', '#57c28a'), 'NE': ('North East Line', '#b28bea'), 'CC': ('Circle Line', '#ffc857'), 'DT': ('Downtown Line', '#5a9ff2'), 'TE': ('Thomson–East Coast Line', '#c99573')}


def point(id_, name, coordinates, **props):
    return {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(float(n), 6) for n in coordinates]}, 'properties': {'id': id_, 'name': name.strip(), **props}}


def station_key(name):
    return re.sub(r'\s+', ' ', re.sub(r'\s+(MRT|LRT)\s+STATION$', '', str(name).strip(), flags=re.I)).casefold()


def build_stations(footprints, code_rows, previous=()):
    names, codes = {}, {}
    for row in code_rows:
        code, name = str(row[0]).strip(), str(row[1]).strip()
        if not re.fullmatch(r'(NS|EW|CG|NE|CC|CE|DT|TE)\d+[A-Z]?', code):
            continue
        key = station_key(name)
        names.setdefault(key, name)
        if code not in codes.setdefault(key, []):
            codes[key].append(code)
    legacy = {station_key(f['properties']['name']): f['properties'].get('legacyId') or f['properties']['id'] for f in previous}
    groups = {}
    for _, row in footprints.to_crs(3414).iterrows():
        key = station_key(row['STN_NAM_DE'])
        if row['TYP_CD_DES'] == 'MRT' and key in codes:
            if row.geometry is None or row.geometry.is_empty:
                raise ValueError('Empty LTA station footprint: ' + key)
            groups.setdefault(key, []).append(row.geometry)
    stations = []
    for key, shapes in sorted(groups.items()):
        # An interior point of the dissolved footprint, not a surveyed platform/entrance position.
        p = gpd.GeoSeries([union_all(shapes).representative_point()], crs=3414).to_crs(4326).iloc[0]
        id_ = 'mrt-' + re.sub(r'[^a-z0-9]+', '-', key).strip('-')
        extra = {'legacyId': legacy[key]} if key in legacy and legacy[key] != id_ else {}
        stations.append(point(id_, names[key], [p.x, p.y], category='station', codes='-'.join(codes[key]), source='LTA DataMall', **extra))
    return stations


def build_exits(frame, stations):
    lookup = {station_key(f['properties']['name']): f['properties'] for f in stations}
    features, seen = [], set()
    for _, row in frame.to_crs(4326).iterrows():
        if not str(row['stn_name']).strip().upper().endswith(' MRT STATION'):
            continue
        station = lookup.get(station_key(row['stn_name']))
        if not station:
            continue  # Exclude LRT and stations absent from the matched LTA MRT snapshot.
        label = str(row['exit_code']).strip()
        if not label or label.lower() in {'none', 'nan'} or row.geometry is None or row.geometry.geom_type != 'Point':
            raise ValueError('Invalid LTA exit record')
        p = row.geometry
        id_ = station['id'] + '-' + re.sub(r'[^a-z0-9]+', '-', label.casefold()).strip('-') + f'-{p.x:.6f}-{p.y:.6f}'
        if id_ in seen:
            continue  # Identical labelled entrance coordinates are one map point.
        seen.add(id_)
        features.append(point(id_, station['name'] + ' · ' + label, [p.x, p.y], category='exit', stationId=station['id'], exit=label, codes=station['codes'], source='LTA DataMall'))
    return features


def build_lines(raw_routes):
    lines = []
    for code, documents in raw_routes.items():
        segments, seen = [], set()
        for relation_id, doc in documents.items():
            elements = doc.get('elements', [])
            nodes = {e['id']: [e['lon'], e['lat']] for e in elements if e['type'] == 'node'}
            ways = {e['id']: e for e in elements if e['type'] == 'way'}
            route = next((e for e in elements if e['type'] == 'relation' and e['id'] == relation_id), None)
            if not route or route.get('tags', {}).get('route') != 'subway':
                raise ValueError('Missing subway relation: ' + str(relation_id))
            for member in route['members']:
                if member['type'] != 'way' or member.get('role', '') not in {'', 'forward', 'backward'}:
                    continue
                way_id = member['ref']
                if way_id in seen:
                    continue
                way = ways.get(way_id)
                if not way or len(way.get('nodes', [])) < 2 or any(n not in nodes for n in way['nodes']):
                    raise ValueError('Incomplete route geometry: ' + str(way_id))
                seen.add(way_id)
                segments.append([nodes[n] for n in way['nodes']])
        if not segments:
            raise ValueError('No tracks for ' + code)
        name, color = LINE_INFO[code]
        lines.append({'type': 'Feature', 'geometry': {'type': 'MultiLineString', 'coordinates': segments}, 'properties': {'id': code, 'name': name, 'color': color, 'source': 'OpenStreetMap', 'relations': list(documents)}})
    return lines


def fetch_rail(directory, cached=False, previous=()):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    def download(url, path):
        if not cached:
            subprocess.run(['curl', '-fsSL', '--retry', '2', '--max-time', '90', url, '-o', str(path)], check=True)
        if not path.is_file():
            raise FileNotFoundError(path)
    for name, url in LTA_FILES.items():
        download(url, directory / f'lta-{name}.zip')
    def shape(name):
        path = directory / f'lta-{name}.zip'
        with zipfile.ZipFile(path) as archive:
            member = next(n for n in archive.namelist() if n.endswith('.shp'))
        return gpd.read_file(f'zip://{path.resolve()}!{member}')
    with zipfile.ZipFile(directory / 'lta-codes.zip') as archive:
        name = next(n for n in archive.namelist() if n.endswith('.xls'))
        sheet = xlrd.open_workbook(file_contents=archive.read(name)).sheet_by_index(0)
        rows = [sheet.row_values(i) for i in range(1, sheet.nrows)]
    stations = build_stations(shape('stations'), rows, previous)
    exits = build_exits(shape('exits'), stations)
    raw = {}
    for code, ids in ROUTES.items():
        raw[code] = {}
        for id_ in ids:
            path = directory / f'osm-route-{id_}.json'
            download(f'https://api.openstreetmap.org/api/0.6/relation/{id_}/full.json', path)
            raw[code][id_] = json.loads(path.read_text())
    return stations, exits, build_lines(raw)
