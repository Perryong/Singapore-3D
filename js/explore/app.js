import { validateTimetable, nowSelection, selectServices, departureStatus, stationStatus, timelineEnd, formatMinute, selectionFromURL } from './last-trains.mjs?v=2';
import { CATEGORIES, LINES, CAMERA_BOUNDS, DEFAULT_CAMERA, filterPlaces, nearest, cameraFromURL, validateCollection } from './core.mjs?v=vegetarian-1';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = { mode: params.get('mode') === 'mrt' ? 'mrt' : 'food', category: Object.hasOwn(CATEGORIES, params.get('category')) ? params.get('category') : 'all', query: params.get('q') || '', rail: params.get('rail') !== '0', selected: null, limit: 35 };
const data = { food: [], stations: [], exits: [], lines: [] }, errors = {};
let map, maplibre, mapReady = false, center = cameraFromURL(location.search).center, filtered = [], toastTimer;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => matchMedia('(max-width: 760px)').matches;
const collection = features => ({ type: 'FeatureCollection', features });
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const button = (text, className, action) => { const node = el('button', className, text); node.type = 'button'; node.addEventListener('click', action); return node; };
const categoryLabel = p => p.category === 'station' ? 'MRT station' : p.category === 'exit' ? 'MRT exit' : CATEGORIES[p.category] || 'Food place';
const kmLabel = km => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
const allPlaces = () => [...data.food, ...data.stations, ...data.exits];
const last = { active: false, data: null, pending: null, saved: null, stationId: null, query: '', minute: 1260, serviceDate: '', preview: true, timer: null, error: '' };
const statusText = { remaining: 'Departure remaining', due: 'Due now', passed: 'Last departures passed', unavailable: 'Timetable unavailable' };
function stopLastTrainPlayback() { clearInterval(last.timer); last.timer = null; $('last-play').textContent = 'Play'; }
function lastCamera() { return mapReady ? { center: [map.getCenter().lng, map.getCenter().lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() } : cameraFromURL(location.search); }
async function setLastTrainMode(enabled) {
 if (enabled === last.active) return;
 stopLastTrainPlayback();
 if (enabled) {
  last.saved = { state: { ...state }, camera: lastCamera(), panelVisible: !document.body.classList.contains('panel-hidden') };
  last.active = true; last.error = ''; document.body.classList.add('last-mode');
  $('last-toggle').checked = true; $('last-panel').hidden = false; $('last-timeline').hidden = false;
  $('rail-toggle').disabled = true; showPanel(); updateLastTrainMap(); renderLastTrains();
  await loadLastTrains();
 } else {
  last.active = false; document.body.classList.remove('last-mode');
  $('last-toggle').checked = false; $('last-panel').hidden = true; $('last-timeline').hidden = true; $('rail-toggle').disabled = false;
  Object.assign(state, last.saved.state); $('search').value = state.query; $('rail-toggle').checked = state.rail;
  update(); updateLastTrainMap();
  if (state.selected) select(state.selected, false); else closeDetail();
  if (mapReady) map.jumpTo(last.saved.camera);
  setPanelVisible(last.saved.panelVisible); saveURL();
 }
}
async function loadLastTrains() {
 last.error = ''; renderLastTrains();
 try {
  if (!last.data) {
   if (!last.pending) last.pending = fetch('./data/explore/last-trains.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('Timetable download failed'); return r.json(); }).then(d => validateTimetable(d, data.stations)).finally(() => { last.pending = null; });
   last.data = await last.pending;
  }
  if (!last.active) return;
  if (!last.serviceDate) {
   Object.assign(last, params.get('last') === '1' ? selectionFromURL(params.toString(), last.data) : nowSelection(new Date(), last.data));
  }
 } catch { if (last.active) last.error = 'The timetable could not be loaded. The food and MRT map is still available.'; }
 if (last.active) { renderLastTrains(); updateLastTrainMap(); saveURL(); }
}
function selectLastStation(feature) {
 stopLastTrainPlayback(); last.stationId = feature.properties.id; showPanel(); renderLastTrains(); updateLastTrainMap();
 $('last-results').querySelector('.back')?.focus({ preventScroll: true });
 if (mapReady) map.flyTo({ center: feature.geometry.coordinates, zoom: 14, offset: isMobile() ? [0, -innerHeight * .15] : [180,0], duration: reducedMotion ? 0 : 600 });
 saveURL();
}
function renderLastTrains() {
 if (!last.active) return;
 const content = $('last-results'); content.replaceChildren();
 const ready = !!last.data && !last.error;
 for (const id of ['last-date','last-minute','last-play','last-now','last-search']) $(id).disabled = !ready;
 if (!ready) {
  content.append(el('p','detail-note',last.error || 'Loading published departures…'));
  if (last.error) content.append(button('Retry timetable','external',loadLastTrains));
  $('last-coverage').textContent = 'Scheduled departures · not live tracking'; return;
 }
 $('last-date').value = last.serviceDate;
 $('last-minute').max = timelineEnd(last.data,last.serviceDate); $('last-minute').value = last.minute; $('last-minute').setAttribute('aria-valuetext', formatMinute(last.minute));
 $('last-clock').textContent = formatMinute(last.minute); $('last-end').textContent = formatMinute(Number($('last-minute').max));
 $('last-preview').textContent = last.preview ? 'Evening preview · Singapore time' : 'Selected current minute · Singapore time';
 const covered = new Set(last.data.services.filter(s=>s.rules.some(r=>r.status==='published')).map(s=>s.stationId)).size;
 $('last-coverage').textContent = `${covered} of ${data.stations.length} stations have published timings · All six MRT lines.`;
 $('last-summary').textContent = 'Regular-schedule preview. Holiday extensions and service changes are unverified. Not a transfer planner.';
 const current = data.stations.find(s=>s.properties.id===last.stationId);
 if (current) {
  content.append(button('← All stations','back',()=>{last.stationId=null;renderLastTrains();updateLastTrainMap();saveURL();$('last-search').focus();}),el('h2','detail-title',current.properties.name),codes(current.properties.codes));
  const selection = selectServices(last.data,last.stationId,last.serviceDate);
  if (!selection.complete) content.append(el('p','last-incomplete','Partial or unavailable timetable. Missing directions are not assumed to have ended.'));
  for (const service of selection.services) {
   if (service.status==='not-applicable') continue;
   const card=el('article','departure-card'), status=departureStatus(service.minute,last.minute), source=last.data.sources[service.sourceId];
   card.append(codes(service.stationCode),el('h3','departure-destination',service.destination.startsWith('connect to ')?service.destination.replace('connect to ','Connection to '):'Towards '+service.destination),el('p','departure-time',service.status==='published'?formatMinute(service.minute):'Unavailable'));
   card.append(el('p','departure-state',status.status==='remaining'?`${status.remainingMinutes} min until last scheduled departure`:statusText[status.status]));
   if(service.note) card.append(el('p','detail-note',service.note));
   card.append(el('p','detail-note',`${service.overridden?'Date-specific schedule':'Regular schedule'} · source updated ${source.updated || 'date not supplied'} · retrieved ${source.retrievedAt.slice(0,10)}`));
   const link=el('a','last-source',(source.label || 'Operator timetable')+' ↗'); link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);content.append(card);
  }
  if (!selection.services.some(s=>s.status==='published')) content.append(el('p','detail-note','No verified departure times for this station in this snapshot.'));
  if (!selection.complete) {
   const link=el('a','external','Check SMRT station information ↗'); link.href='https://journey.smrt.com.sg/journey/station_info/'+current.properties.name.toLowerCase().replaceAll(' ','-')+'/first-and-last-train/';link.target='_blank';link.rel='noopener noreferrer';content.append(link);
  }
 } else {
  const matches=filterPlaces(data.stations,last.query), ranked=nearest(center,matches,150);
  content.append(el('p','results-note',`${matches.length} ${matches.length === 1 ? 'station' : 'stations'} · nearest first`));
  for (const {feature} of ranked) {
   const selection=selectServices(last.data,feature.properties.id,last.serviceDate), status=stationStatus(selection,last.minute);
   content.append(resultRow(feature,feature.properties.codes+' · '+statusText[status.status]+(status.partial?' · partial':'')));
  }
  if (!matches.length) content.append(el('p','detail-note','No stations match this search.'));
 }
}
function updateLastTrainMap() {
 $('legend').hidden = last.active || !state.rail;
 if (!mapReady) return;
 updateRail();
 for (const id of ['food-clusters','cluster-count','food-points','exits','exit-labels']) map.setLayoutProperty(id,'visibility',last.active?'none':id.startsWith('exit')&&!state.rail?'none':'visible');
 if (!map.getSource('last-status')) {
  map.addSource('last-status',{type:'geojson',data:collection([])});
  map.addLayer({id:'last-status',type:'circle',source:'last-status',paint:{'circle-radius':8,'circle-color':'#17232a','circle-opacity':.8,'circle-stroke-width':3,'circle-stroke-color':['match',['get','status'],'remaining','#8ecfad','due','#ffca78','passed','#64727c','#c3c9d0']}});
  map.addLayer({id:'last-unknown',type:'symbol',source:'last-status',filter:['==',['get','partial'],true],layout:{'text-field':'?','text-size':11,'text-font':['Noto Sans Regular']},paint:{'text-color':'#ffffff'}});
 }
 const features=last.active&&last.data?data.stations.map(f=>({...f,properties:{...f.properties,...stationStatus(selectServices(last.data,f.properties.id,last.serviceDate),last.minute)}})):[];
 map.getSource('last-status').setData(collection(features));
 const selected=last.active?data.stations.find(f=>f.properties.id===last.stationId):state.selected;
 map.getSource('selection').setData(collection(selected?[selected]:[]));
}

function toast(text) { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 3500); }
function setPanelVisible(visible) {
 document.body.classList.toggle('panel-hidden', !visible);
 $('panel-toggle').textContent = visible ? 'Hide places' : 'Show places';
 $('panel-toggle').setAttribute('aria-expanded', String(visible));
}
function showPanel() { setPanelVisible(true); }
function saveURL() {
 if ((params.get('last') === '1' && !last.saved) || (last.active && !last.serviceDate)) return;
 const url = new URL(location.href); url.search = '';
 const urlState = last.active ? last.saved.state : state;
 const camera = last.active ? last.saved.camera : mapReady ? { center: [map.getCenter().lng, map.getCenter().lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() } : cameraFromURL(location.search);
 for (const [k, v] of Object.entries({ lng: camera.center[0].toFixed(5), lat: camera.center[1].toFixed(5), z: camera.zoom.toFixed(2), pitch: camera.pitch.toFixed(0), bearing: camera.bearing.toFixed(0), mode: urlState.mode, category: urlState.category, q: urlState.query, place: urlState.selected?.properties.id || '', rail: urlState.rail ? '1' : '0', last: last.active ? '1' : '', serviceDate: last.active ? last.serviceDate : '', minute: last.active ? String(last.minute) : '', lastStation: last.active ? last.stationId || '' : '' })) if (v !== '') url.searchParams.set(k, v);
 history.replaceState(null, '', url);
}
function codes(text) {
 const wrap = el('div', 'codes');
 for (const code of text?.match(/[A-Z]+\d+[A-Z]?/g) || []) {
  const badge = el('span', 'code', code); badge.style.color = LINES[code.match(/^[A-Z]+/)[0]]?.[1] || '#c8d8cd'; wrap.append(badge);
 }
 return wrap;
}
function resultRow(feature, subtitle) {
 const p = feature.properties;
 const row = button('', 'result', () => select(feature));
 row.setAttribute('aria-label', `${p.name}, ${categoryLabel(p)}`);
 const icon = el('span', `place-icon${p.category === 'station' ? ' station' : ''}`, p.category === 'station' ? '↔' : p.category === 'cafe' ? '☕' : '♨'); icon.setAttribute('aria-hidden', 'true');
 const copy = el('span', 'result-copy'); copy.append(el('span', 'result-name', p.name), el('span', 'result-sub', subtitle || [p.codes || categoryLabel(p), p.diet ? (p.diet === 'vegan' ? 'Vegan' : 'Vegetarian') : '', p.cuisine || p.address].filter(Boolean).join(' · ')));
 row.append(icon, copy, el('span', 'result-arrow', '↗')); return row;
}
function renderResults() {
 const stationMode = state.mode === 'mrt';
 filtered = filterPlaces(stationMode ? data.stations : data.food, state.query, stationMode ? 'all' : state.category);
 const matchingStations = !stationMode && state.query.trim() ? filterPlaces(data.stations, state.query) : [];
 const ranked = nearest(center, filtered, state.limit);
 $('result-count').textContent = `${filtered.length.toLocaleString()} ${stationMode ? (filtered.length === 1 ? 'station' : 'stations') : (filtered.length === 1 ? 'place' : 'places')}`;
 $('results-title').textContent = state.query ? 'Search results' : stationMode ? 'Find your station' : 'Around the island';
 $('results-note').textContent = !stationMode && state.category === 'vegetarian' ? 'Vegetarian & vegan venues · source-reported · nearest first' : state.query ? 'Matches across Singapore · nearest first' : 'Places nearest the map centre';
 const box = $('results'); box.replaceChildren();
 for (const feature of matchingStations.slice(0, 4)) box.append(resultRow(feature, feature.properties.codes + ' · MRT station'));
 for (const { feature } of ranked) box.append(resultRow(feature));
 const error = errors[stationMode ? 'stations' : 'food'];
 if (error) {
  const message = el('div', 'empty', `${stationMode ? 'Station' : 'Food'} data could not be loaded.`);
  message.append(button('Try again', '', () => location.reload())); box.append(message);
 } else if (!ranked.length && !matchingStations.length) {
  const message = el('div', 'empty', 'No places match this search. Try a place name, cuisine or a different category.');
  message.append(button('Clear search & filters', '', () => { state.query = ''; state.category = 'all'; $('search').value = ''; update(); })); box.append(message);
 }
 $('more').hidden = filtered.length <= state.limit;
 updateMapFood();
}
function updateMapFood() {
 if (!mapReady) return;
 // In MRT mode keep food visible as geographic context; filter only the food directory.
 map.getSource('food')?.setData(collection(state.mode === 'mrt' ? data.food : filtered));
}
function updateRail() {
 $('legend').hidden = last.active || !state.rail;
 if (!mapReady) return;
 for (const id of ['rail-casing', 'rail-lines', 'stations', 'station-labels', 'exits', 'exit-labels']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', (state.rail || last.active) ? 'visible' : 'none');
 $('legend').hidden = last.active || !state.rail;
}
function update() {
 state.limit = 35;
 $('food-mode').classList.toggle('active', state.mode === 'food'); $('mrt-mode').classList.toggle('active', state.mode === 'mrt');
 $('food-mode').setAttribute('aria-pressed', String(state.mode === 'food')); $('mrt-mode').setAttribute('aria-pressed', String(state.mode === 'mrt'));
 $('categories').hidden = state.mode === 'mrt';
 for (const node of $('categories').children) { const on = node.dataset.category === state.category; node.classList.toggle('active', on); node.setAttribute('aria-pressed', String(on)); }
 renderResults(); saveURL();
}
function closeDetail() {
 state.selected = null; $('detail').hidden = true; $('browse').hidden = false;
 if (mapReady) map.getSource('selection').setData(collection([]));
 renderResults(); saveURL();
}
function select(feature, fly = true) {
 if (last.active) { if (feature.properties.category === 'station') selectLastStation(feature); return; }
 state.selected = feature; showPanel();
 $('browse').hidden = true; const box = $('detail'); box.hidden = false; box.replaceChildren(); box.scrollTop = 0;
 const p = feature.properties, station = p.category === 'station', railPlace = station || p.category === 'exit';
 box.append(button('← Back to exploring', 'back', () => { closeDetail(); $('search').focus(); }), el('p', 'detail-category', categoryLabel(p)), el('h2', 'detail-title', p.name));
 if (railPlace) box.append(codes(p.codes));
 box.append(el('p', 'detail-address', p.address || (railPlace ? 'Explore the neighbourhood around this station.' : 'Address not recorded in the source. Select the map link for its location.')));
 const facts = el('div', 'detail-facts');
 for (const [label, value] of [['Diet', p.diet === 'vegan' ? 'Vegan venue' : p.diet === 'vegetarian' ? 'Vegetarian venue' : ''], ['Dietary evidence', p.dietEvidence], ['Listing checked', p.verifiedAt], ['Map location', p.locationPrecision], ['Cuisine', p.cuisine], ['Food stalls at this centre', p.stalls ? String(p.stalls) : ''], ['Recorded opening hours', p.hours], ['Source', p.source]]) {
  if (!value) continue;
  const fact = el('p', 'fact'); fact.append(el('span', 'fact-label', label), document.createTextNode(value)); facts.append(fact);
 }
 box.append(facts);
 if (p.dietSource && /^https:\/\/(www\.)?(openstreetmap\.org|gokulraasvegetarian\.com\.sg|greendot\.sg|orders\.greendot\.sg|veganburg\.com|nomvnom\.com|railmall\.com\.sg|fortunecentre\.sg)\//.test(p.dietSource)) {
  const source = el('a', 'external', 'View dietary source ↗'); source.href = p.dietSource; source.target = '_blank'; source.rel = 'noopener noreferrer'; box.append(source);
 }

 if (station) {
  box.append(el('h3', 'detail-subheading', 'Station exits'));
  const exits = data.exits.filter(f => f.properties.stationId === p.id);
  for (const exit of exits) box.append(resultRow(exit, exit.properties.exit));
  if (!exits.length) box.append(el('p', 'detail-note', errors.exits ? 'Exit data could not be loaded.' : 'No exits recorded in this snapshot.'));
 } else if (p.category === 'exit') {
  const parent = data.stations.find(f => f.properties.id === p.stationId);
  if (parent) box.append(resultRow(parent));
 }
 box.append(el('h3', 'detail-subheading', railPlace ? 'A bite nearby' : 'Get here by MRT'), el('p', 'detail-note', 'Closest by straight-line distance. Walking routes and station exits may be further away.'));
 const nearby = nearest(feature.geometry.coordinates, railPlace ? data.food : data.stations, railPlace ? 8 : 3);
 for (const { feature: next, km } of nearby) box.append(resultRow(next, [next.properties.codes || categoryLabel(next.properties), kmLabel(km) + ' away'].join(' · ')));
 if (!nearby.length) box.append(el('p', 'detail-note', 'Nearby place data is unavailable.'));
 const [lon, lat] = feature.geometry.coordinates;
 const link = el('a', 'external', 'View location on OpenStreetMap ↗'); link.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; box.append(link);
 if (mapReady) {
  map.getSource('selection').setData(collection([feature]));
  if (fly) map.flyTo({ center: feature.geometry.coordinates, zoom: p.category === 'exit' ? 17 : 15, offset: isMobile() ? [0, -innerHeight * .23] : [180, 0], duration: reducedMotion ? 0 : 850 });
 }
 saveURL();
 // Give keyboard users a predictable entry point into the details.
 box.querySelector('.back').focus({ preventScroll: true });
}
async function loadData() {
 await Promise.all(['food', 'stations', 'exits', 'lines'].map(async name => {
  try {
   const response = await fetch(`./data/explore/${name}.geojson`, { cache: 'no-cache' }); if (!response.ok) throw new Error('Download failed');
   data[name] = validateCollection(await response.json(), name === 'lines').features;
  } catch (error) { errors[name] = error.message; }
 }));
 try {
  const response = await fetch('./data/explore/metadata.json'); if (!response.ok) throw new Error('Missing metadata');
  const metadata = await response.json(), date = new Date(metadata.fetched);
  const formatted = Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'date unavailable';
  $('snapshot-date').textContent = `Food downloaded ${formatted}; rail downloaded ${new Date(metadata.railFetched).toLocaleDateString('en-SG')}. LTA editions: stations March 2026, codes January 2025, exits July 2026. Source coverage varies.`;
  $('coverage').textContent = `Public data · ${formatted} · coverage varies`;
 } catch { $('snapshot-date').textContent = 'Snapshot date unavailable.'; }
 update();
 const chosen = allPlaces().find(f => f.properties.id === params.get('place') || f.properties.legacyId === params.get('place'));
 if (chosen) select(chosen, false);
}
function mapNotice(text) {
 $('map-notice').replaceChildren(document.createTextNode(text), button('Retry map', '', () => location.reload())); $('map-notice').hidden = false;
}
async function loadMap() {
 try {
  maplibre = await import('https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.js');
  // The pinned UMD bundle exposes its public API on window when imported as a module.
  maplibre = window.maplibregl || maplibre.default || maplibre;
  map = new maplibre.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/dark', ...cameraFromURL(location.search), minZoom: 10, maxZoom: 18, maxPitch: 60, maxBounds: CAMERA_BOUNDS, attributionControl: true });
  map.addControl(new maplibre.NavigationControl({ visualizePitch: true }), 'top-right');
  const timeout = setTimeout(() => { if (!mapReady) mapNotice('The basemap is taking longer than expected. You can still search the directory.'); }, 18000);
  map.on('error', () => { if (mapReady) mapNotice('Some map tiles could not load. Place search is still available.'); });
  map.on('load', () => {
   clearTimeout(timeout); $('map-notice').hidden = true;
   // Reuse the basemap's building footprints and tile-provided heights.
   const baseLayers = map.getStyle().layers;
   const lastSurface = baseLayers.findLastIndex(layer => layer.type !== 'symbol');
   const firstLabel = baseLayers[lastSurface + 1]?.id;
   map.addLayer({ id: 'buildings-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
    paint: {
     'fill-extrusion-color': '#71818b',
     'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['max', 0, ['to-number', ['get', 'render_height'], 0]]],
     'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['max', 0, ['to-number', ['get', 'render_min_height'], 0]]],
     'fill-extrusion-opacity': 0.8
    }
   }, firstLabel);
   map.addSource('rail', { type: 'geojson', data: collection(data.lines) });
   map.addLayer({ id: 'rail-casing', type: 'line', source: 'rail', paint: { 'line-color': '#101b23', 'line-width': 7, 'line-opacity': .9 } });
   map.addLayer({ id: 'rail-lines', type: 'line', source: 'rail', paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 15, 4], 'line-opacity': .85 } });
   map.addSource('food', { type: 'geojson', data: collection(filtered), cluster: true, clusterMaxZoom: 14, clusterRadius: 36 });
   map.addLayer({ id: 'food-clusters', type: 'circle', source: 'food', filter: ['has', 'point_count'], paint: { 'circle-color': '#322b26', 'circle-stroke-color': '#d99568', 'circle-stroke-width': 1.5, 'circle-radius': ['step', ['get', 'point_count'], 15, 50, 19, 200, 24] } });
   map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'food', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': '#ffd3ad' } });
   map.addLayer({ id: 'food-points', type: 'circle', source: 'food', filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 7], 'circle-color': '#ffb47f', 'circle-stroke-color': '#32261f', 'circle-stroke-width': 2 } });
   map.addSource('stations', { type: 'geojson', data: collection(data.stations) });
   map.addLayer({ id: 'stations', type: 'circle', source: 'stations', paint: { 'circle-color': '#17232a', 'circle-stroke-color': '#e0e9df', 'circle-stroke-width': 2, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 5] } });
   map.addLayer({ id: 'station-labels', type: 'symbol', source: 'stations', minzoom: 12, layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top' }, paint: { 'text-color': '#e1e9e4', 'text-halo-color': '#111c24', 'text-halo-width': 2 } });
   map.addSource('exits', { type: 'geojson', data: collection(data.exits) });
   map.addLayer({ id: 'exits', type: 'circle', source: 'exits', minzoom: 15.5, paint: { 'circle-color': '#b9e5d0', 'circle-stroke-color': '#17232a', 'circle-stroke-width': 2, 'circle-radius': 5 } });
   map.addLayer({ id: 'exit-labels', type: 'symbol', source: 'exits', minzoom: 16, layout: { 'text-field': ['get', 'exit'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1], 'text-anchor': 'top' }, paint: { 'text-color': '#b9e5d0', 'text-halo-color': '#111c24', 'text-halo-width': 2 } });
   map.addSource('selection', { type: 'geojson', data: collection(state.selected ? [state.selected] : []) });
   map.addLayer({ id: 'selected-place', type: 'circle', source: 'selection', paint: { 'circle-radius': 13, 'circle-color': '#ffb47f', 'circle-opacity': .25, 'circle-stroke-color': '#fff0dd', 'circle-stroke-width': 2 } });
   mapReady = true; updateRail(); updateMapFood(); if (last.active) updateLastTrainMap();
   if (errors.lines || errors.stations) mapNotice('MRT map data is unavailable. Food search is still available.');
   map.on('moveend', () => { center = [map.getCenter().lng, map.getCenter().lat]; if (last.active) { if (!last.stationId) renderLastTrains(); } else if (!state.selected) renderResults(); saveURL(); });
   map.on('click', event => {
    const layers = ['food-points', 'food-clusters', ...((state.rail || last.active) ? ['stations', ...(last.active ? ['last-status'] : ['exits'])] : [])];
    const hits = map.queryRenderedFeatures(event.point, { layers });
    const hit = hits.find(f => f.layer.id === 'exits') || hits.find(f => f.layer.id === 'last-status' || f.layer.id === 'stations') || hits[0]; if (!hit) return;
    if (hit.properties.cluster) {
     map.getSource('food').getClusterExpansionZoom(hit.properties.cluster_id).then(zoom => map.easeTo({ center: hit.geometry.coordinates, zoom, duration: reducedMotion ? 0 : 500 })).catch(() => toast('Could not expand this group. Try zooming in.'));
    } else {
     const feature = allPlaces().find(f => f.properties.id === hit.properties.id); if (feature) select(feature);
    }
   });
   for (const id of ['food-points', 'food-clusters', 'stations', 'exits']) { map.on('mouseenter', id, () => map.getCanvas().style.cursor = 'pointer'); map.on('mouseleave', id, () => map.getCanvas().style.cursor = ''); }
  });
 } catch { mapNotice('The interactive map is unavailable. You can still explore the place directory.'); }
}
for (const [key, label] of Object.entries(CATEGORIES)) { const node = button(label, '', () => { state.category = key; closeDetail(); update(); }); node.dataset.category = key; $('categories').append(node); }
for (const [code, [name, color]] of Object.entries(LINES)) { const item = el('span', 'line-key-item'); item.title = name; const swatch = el('span', 'line-swatch'); swatch.style.background = color; item.append(swatch, document.createTextNode(code)); $('line-key').append(item); }
$('search').value = state.query; $('rail-toggle').checked = state.rail; updateRail();
let searchTimer;
$('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.query = $('search').value; update(); }, 130); });
for (const mode of ['food', 'mrt']) $(mode + '-mode').addEventListener('click', () => { if (last.active) setLastTrainMode(false); state.mode = mode; state.query = ''; $('search').value = ''; if (mode === 'mrt') { state.rail = true; $('rail-toggle').checked = true; updateRail(); } closeDetail(); update(); showPanel(); });
$('rail-toggle').addEventListener('change', () => { state.rail = $('rail-toggle').checked; $('legend').hidden = last.active || !state.rail; updateRail(); saveURL(); });
$('more').addEventListener('click', () => { state.limit += 35; const pos = $('results').scrollTop; renderResults(); $('results').scrollTop = pos; });
$('reset').addEventListener('click', () => { if (last.active) { last.stationId = null; if (mapReady) map.flyTo({ ...DEFAULT_CAMERA, duration: reducedMotion ? 0 : 650 }); renderLastTrains(); updateLastTrainMap(); saveURL(); return; } closeDetail(); center = DEFAULT_CAMERA.center; if (mapReady) map.flyTo({ ...DEFAULT_CAMERA, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: reducedMotion ? 0 : 650 }); renderResults(); saveURL(); });
$('share').addEventListener('click', async () => { saveURL(); try { await navigator.clipboard.writeText(location.href); toast('Map link copied. Send someone somewhere good.'); } catch { window.prompt('Copy this map link:', location.href); } });
$('about').addEventListener('click', () => $('about-dialog').showModal()); $('close-about').addEventListener('click', () => $('about-dialog').close());
document.querySelector('.skip').addEventListener('click', event => { event.preventDefault(); if (last.active) { showPanel(); $('last-search').focus(); } else { closeDetail(); showPanel(); $('search').focus(); } });
$('panel-toggle').addEventListener('click', () => setPanelVisible(document.body.classList.contains('panel-hidden')));
addEventListener('keydown', event => { if (event.key === '/' && !/INPUT|TEXTAREA/.test(event.target.tagName) && !$('about-dialog').open) { event.preventDefault(); if (last.active) { showPanel(); $('last-search').focus(); } else { closeDetail(); showPanel(); $('search').focus(); } } if (event.key === 'Escape' && !last.active && state.selected && !$('about-dialog').open) { closeDetail(); showPanel(); $('search').focus(); } });
$('last-toggle').addEventListener('change', () => setLastTrainMode($('last-toggle').checked));
$('last-results').addEventListener('focusin', stopLastTrainPlayback);
$('last-search').addEventListener('input', () => { last.query = $('last-search').value; last.stationId = null; renderLastTrains(); updateLastTrainMap(); saveURL(); });
function changeLastTime() { stopLastTrainPlayback(); last.preview = true; renderLastTrains(); updateLastTrainMap(); saveURL(); }
$('last-minute').addEventListener('input', () => { last.minute = Number($('last-minute').value); changeLastTime(); });
$('last-date').addEventListener('change', () => {
 const value = $('last-date').value;
 if (!value || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) { $('last-date').value = last.serviceDate; return; }
 last.serviceDate = value; last.minute = Math.min(last.minute, timelineEnd(last.data,value)); changeLastTime();
});
$('last-now').addEventListener('click', () => { stopLastTrainPlayback(); Object.assign(last,nowSelection(new Date(),last.data)); renderLastTrains(); updateLastTrainMap(); saveURL(); });
$('last-play').addEventListener('click', () => {
 if (last.timer) { stopLastTrainPlayback(); return; }
 if (!last.data || last.minute >= timelineEnd(last.data,last.serviceDate)) return;
 last.preview = true; $('last-play').textContent = 'Pause';
 last.timer = setInterval(() => {
  last.minute++; if (last.minute >= timelineEnd(last.data,last.serviceDate)) stopLastTrainPlayback();
  renderLastTrains(); updateLastTrainMap(); saveURL();
 },250);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopLastTrainPlayback(); });
await loadData();
$('last-toggle').disabled = false;
loadMap();
if (params.get('last') === '1') setLastTrainMode(true);
