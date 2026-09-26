import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterPlaces, nearest, cameraFromURL, validPoint, validateCollection } from './core.mjs';
const point = (id, name, category, coordinates, extra = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { id, name, category, ...extra } });
const food = [point('a', 'Maxwell Food Centre', 'hawker', [103.844, 1.28], { cuisine: 'chicken rice' }), point('b', 'Coffee shop', 'cafe', [103.9, 1.33])];
const dietary = [point('veg', 'Vegetarian kitchen', 'restaurant', [103.8, 1.3], { diet: 'vegetarian' }), point('vegan', 'Plant café', 'cafe', [103.8, 1.3], { diet: 'vegan' }), point('options', 'Vegetarian options', 'restaurant', [103.8, 1.3])];
assert.deepEqual(filterPlaces(dietary, '', 'vegetarian').map(f => f.properties.id), ['veg', 'vegan']);
assert.equal(filterPlaces(dietary, 'plant', 'vegetarian')[0].properties.id, 'vegan');
assert.equal(filterPlaces(dietary, '', 'cafe').length, 1);
const stations = [point('s1', 'Maxwell', 'station', [103.844, 1.2801], { codes: 'TE18' }), point('s2', 'Far away', 'station', [103.96, 1.36], { codes: 'EW2' })];
assert.equal(filterPlaces(food, ' CHICKEN  ', 'all').length, 1);
assert.equal(filterPlaces(food, '', 'cafe')[0].properties.id, 'b');
assert.equal(filterPlaces(food, 'Maxwell', 'cafe').length, 0);
assert.equal(filterPlaces(stations, 'te18', 'all')[0].properties.name, 'Maxwell');
assert.equal(filterPlaces(food, 'zzzz', 'all').length, 0);
assert.equal(nearest(food[0].geometry.coordinates, stations, 1)[0].feature.properties.id, 's1');
assert.ok(nearest(food[0].geometry.coordinates, stations, 1)[0].km < 0.02);
assert.equal(validPoint([NaN, 1.3]), false);
assert.equal(validPoint([0, 0]), false);
assert.equal(validPoint([103.8, 1.3]), true);
assert.deepEqual(cameraFromURL('?lng=evil&lat=999&z=-1&pitch=90&bearing=Infinity'), cameraFromURL(''));
assert.equal(cameraFromURL('?lng=104.23&lat=1.53&z=16').center[1], 1.53);
assert.equal(cameraFromURL('?lng=104.23&lat=1.53&z=16').center[0], 104.23);
assert.equal(cameraFromURL('?lng=103.85&lat=1.3&z=14&pitch=35&bearing=-8').zoom, 14);
assert.throws(() => validateCollection({ type: 'FeatureCollection', features: [point('x', 'Bad', 'cafe', [null, 1.3])] }));
assert.throws(() => validateCollection({ type: 'FeatureCollection', features: [point('x', '', 'cafe', [103.8, 1.3])] }));
assert.throws(() => validateCollection({ type: 'FeatureCollection', features: [food[0], food[0]] }));
for (const name of ['food', 'stations', 'exits', 'lines']) {
 const data = JSON.parse(readFileSync(new URL(`../../data/explore/${name}.geojson`, import.meta.url)));
 if (name === 'food') {
  assert.ok(data.features.some(f => f.properties.name === 'Kampung Admiralty Hawker Centre' && f.properties.source === 'NEA'));
  assert.ok(data.features.some(f => f.properties.name === 'Bukit Timah Interim Hawker Centre and Market'));
 }
 validateCollection(data, name === 'lines');
 assert.ok(data.features.length > (name === 'food' ? 100 : name === 'stations' ? 100 : 5));
}
const snapshot = name => JSON.parse(readFileSync(new URL(`../../data/explore/${name}.geojson`, import.meta.url))).features;
const vegetarianPlaces = filterPlaces(snapshot('food'), '', 'vegetarian');
assert.ok(vegetarianPlaces.length >= 70);
assert.ok(vegetarianPlaces.every(f => ['www.openstreetmap.org','www.greendot.sg','orders.greendot.sg','www.veganburg.com','www.nomvnom.com','www.gokulraasvegetarian.com.sg','railmall.com.sg','fortunecentre.sg'].includes(new URL(f.properties.dietSource).hostname) && f.properties.dietEvidence));
const officialStations = snapshot('stations');
assert.ok(officialStations.every(f => f.properties.source === 'LTA DataMall'));
assert.equal(filterPlaces(officialStations, 'NS9')[0].properties.codes, 'NS9-TE2');
assert.ok(snapshot('exits').every(f => f.properties.source === 'LTA DataMall' && officialStations.some(s => s.properties.id === f.properties.stationId)));
assert.ok(snapshot('lines').every(f => f.properties.source === 'OpenStreetMap'));
console.log('Explorer checks passed: filtering, nearest stations, URL bounds and all data snapshots.');
