"""Run with tools/.venv/bin/python tools/rail_data_test.py."""
import geopandas as gpd
from shapely.geometry import Polygon, Point
from rail_data import build_stations, build_exits, build_lines

footprints = gpd.GeoDataFrame([
 {'STN_NAM_DE': 'WOODLANDS MRT STATION', 'TYP_CD_DES': 'MRT', 'geometry': Polygon([(103.78,1.43),(103.79,1.43),(103.79,1.44),(103.78,1.44)])},
 {'STN_NAM_DE': 'WOODLANDS MRT STATION ', 'TYP_CD_DES': 'MRT', 'geometry': Polygon([(103.79,1.43),(103.80,1.43),(103.80,1.44),(103.79,1.44)])},
 {'STN_NAM_DE': 'FUTURE MRT STATION', 'TYP_CD_DES': 'MRT', 'geometry': Point(103.81,1.43)},
 {'STN_NAM_DE': 'DEPOT', 'TYP_CD_DES': 'MRT', 'geometry': Point(103.82,1.43)},
], crs=4326)
rows = [['NS9', 'Woodlands'], ['TE2', 'Woodlands '], ['BP1', 'LRT only']]
previous = [{'properties': {'id': 'mrt-193358375', 'name': 'Woodlands'}}]
stations = build_stations(footprints, rows, previous)
assert len(stations) == 1
assert stations[0]['properties']['codes'] == 'NS9-TE2'
assert stations[0]['properties']['source'] == 'LTA DataMall'
assert stations[0]['properties']['legacyId'] == 'mrt-193358375'
assert stations[0]['properties']['id'] == 'mrt-woodlands'
exits_frame = gpd.GeoDataFrame([
 {'stn_name': 'WOODLANDS MRT STATION', 'exit_code': 'Exit A', 'geometry': Point(103.79,1.43)},
 {'stn_name': 'WOODLANDS MRT STATION', 'exit_code': 'Exit A', 'geometry': Point(103.791,1.43)},
 {'stn_name': 'WOODLANDS LRT STATION', 'exit_code': 'Exit C', 'geometry': Point(103.80,1.44)},
 {'stn_name': 'OTHER LRT STATION', 'exit_code': 'Exit B', 'geometry': Point(103.80,1.44)},
], crs=4326)
exits = build_exits(exits_frame, stations)
assert len(exits) == 2 and exits[0]['properties']['stationId'] == 'mrt-woodlands'
# Exclude platform geometry, deduplicate track ways and never join disjoint tracks.
raw = {'elements': [
 {'type':'node','id':1,'lon':103.8,'lat':1.3}, {'type':'node','id':2,'lon':103.81,'lat':1.31},
 {'type':'way','id':10,'nodes':[1,2]}, {'type':'way','id':11,'nodes':[2,1]},
 {'type':'relation','id':123,'tags':{'type':'route','route':'subway'},'members':[
 {'type':'way','ref':10,'role':''},{'type':'way','ref':10,'role':''},{'type':'way','ref':11,'role':'platform'}]},
]}
lines = build_lines({'NS': {123:raw}})
assert len(lines) == 1 and len(lines[0]['geometry']['coordinates']) == 1
assert lines[0]['properties']['source'] == 'OpenStreetMap'
bad = {'elements': [e for e in raw['elements'] if e['type'] != 'node']}
try: build_lines({'NS': {123:bad}})
except ValueError: pass
else: raise AssertionError('Missing track coordinates must fail, not silently omit segments')
print('Rail import checks passed: official station merge, code matching, exit links, route geometry and missing data rejection.')
