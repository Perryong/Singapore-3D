"""Run with tools/.venv/bin/python tools/food_data_test.py."""
from fetch_explore import dietary_properties

def record(tags):
    return {'type': 'node', 'id': 123, 'tags': tags}

assert dietary_properties(record({'diet:vegetarian': 'yes'})) == {}
assert dietary_properties(record({'name': 'Vegetarian options'})) == {}
assert dietary_properties(record({'diet:vegetarian': 'only'}))['diet'] == 'vegetarian'
vegan = dietary_properties(record({'diet:vegetarian': 'only', 'diet:vegan': 'only'}))
assert vegan['diet'] == 'vegan'
assert vegan['dietSource'] == 'https://www.openstreetmap.org/node/123'
print('Food dietary checks passed: full-venue tags, vegan precedence and provenance.')

from fetch_explore import merge_verified_venues
import json
from pathlib import Path
venues=json.loads(Path('data/explore/vegetarian-venues.geojson').read_text())['features']
base=[]
merged=merge_verified_venues(base,venues)
assert len(merged)==len(venues)
assert merge_verified_venues(merged,venues)==merged, 'Repeated refresh duplicates venues'
assert all(f['properties']['diet'] in ('vegetarian','vegan') for f in merged)
assert next(f for f in merged if f['properties']['id']=='osm-node-4912365921')['properties']['hours']=='Su-Th 11:30-21:30; Fr-Sa 11:30-22:30'
bad=json.loads(json.dumps(venues));bad[0]['geometry']['coordinates']=[0,0]
try: merge_verified_venues([],bad)
except ValueError: pass
else: raise AssertionError('Invalid venue coordinates accepted')
print('Verified venue merge checks passed')
