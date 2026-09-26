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
