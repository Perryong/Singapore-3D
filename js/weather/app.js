/**
 * Weather page wiring: three tabs over one static map.
 * All three forecasts are fetched once at boot (independently — one failing
 * endpoint only breaks its own tab); Refresh refetches everything.
 */
import { fetchForecast } from './wx.js';
import { iconFor } from './icons.js';
import { createWeatherMap } from './map.js';
import { createRadar } from './radar.js';
import { fetchObservations } from './obs.js';

const REGION_ANCHORS = {
  north: [103.82, 1.418], south: [103.82, 1.27], east: [103.94, 1.35],
  west: [103.7, 1.35], central: [103.82, 1.36],
};

const map = await createWeatherMap(document.getElementById('field'))
  .catch(() => ({ project: () => ({ x: -9999, y: -9999 }), onResize: () => {} }));
const radar = createRadar({ field: document.querySelector('.field'), project: map.project, onResize: map.onResize });
const markerLayer = document.getElementById('marker-layer');
const panelTitle = document.getElementById('panel-title');
const panelBody = document.getElementById('panel-body');
const updatedEl = document.getElementById('updated');

const state = {
  tab: 'radar', data: { '2h': null, '24h': null, '4d': null }, err: {}, period: 0,
  obs: null, obsErr: null, radarErr: null, show: { temp: true, wind: false },
};

async function load(kind) {
  try {
    state.data[kind] = await fetchForecast(kind);
    delete state.err[kind];
  } catch (e) {
    state.err[kind] = e.message;
  }
  if (state.tab === kind || (kind === '2h' && state.tab === '4d')) renderTab();
}

async function loadRadarTab() {
  radar.refresh().then((n) => { if (n !== null) { state.radarErr = null; if (state.tab === 'radar') renderTab(); } }).catch((e) => {
    state.radarErr = e.message;
    if (state.tab === 'radar') renderTab();
  });
  try {
    state.obs = await fetchObservations();
    state.obsErr = null;
  } catch (e) {
    state.obsErr = e.message;
  }
  if (state.tab === 'radar') renderTab();
}

function loadAllKinds() {
  updatedEl.textContent = 'loading…';
  ['2h', '24h', '4d'].forEach(load);
  loadRadarTab();
}

// ---- Rendering ----------------------------------------------------------

function fmtTime(d) {
  return d ? d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }) : '—';
}

function placeEl(b) {
  const p = map.project(+b.dataset.lon, +b.dataset.lat);
  b.style.left = `${p.x}px`;
  b.style.top = `${p.y}px`;
}

function marker(lon, lat, icon, name, cls = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `wx ${cls}`;
  b.innerHTML = `<span class="wx__icon">${icon}</span><span class="wx__name">${name}</span>`;
  b.dataset.lon = lon;
  b.dataset.lat = lat;
  placeEl(b);
  markerLayer.appendChild(b);
  return b;
}
map.onResize(() => document.querySelectorAll('#marker-layer .wx').forEach(placeEl));

function errBlock(kind, label) {
  const div = document.createElement('div');
  div.className = 'wx-error';
  const msg = document.createTextNode(`${label} unavailable (${state.err[kind]}). `);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'reset';
  btn.textContent = 'Retry';
  btn.addEventListener('click', () => load(kind));
  div.append(msg, btn);
  return div;
}

function errBlock2(label, msg) {
  const div = document.createElement('div');
  div.className = 'wx-error';
  div.append(document.createTextNode(`${label} unavailable (${msg}). `));
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'reset';
  btn.textContent = 'Retry';
  btn.addEventListener('click', loadRadarTab);
  div.appendChild(btn);
  return div;
}

function renderTab() {
  markerLayer.textContent = '';
  panelBody.textContent = '';
  document.querySelectorAll('.tab').forEach((t) => {
    const isOn = t.dataset.tab === state.tab;
    t.classList.toggle('is-on', isOn);
    t.setAttribute('aria-selected', String(isOn));
  });
  radar.setVisible(state.tab === 'radar');

  const d2 = state.data['2h'];
  if (state.tab === 'radar' ? (state.obs || state.obsErr) : (state.data[state.tab] || state.err[state.tab]))
    updatedEl.textContent = `updated ${fmtTime(state.tab === 'radar' ? state.obs?.updated : state.data[state.tab]?.updated)}`;

  if (state.tab === 'radar') {
    panelTitle.textContent = 'Rain radar';
    if (state.radarErr) panelBody.appendChild(errBlock2('Radar', state.radarErr));
    if (state.obsErr) panelBody.appendChild(errBlock2('Observations', state.obsErr));
    const chips = document.createElement('div');
    chips.className = 'wx-card';
    chips.innerHTML = '<h3>Stations</h3><div id="obs-chips"></div>';
    panelBody.appendChild(chips);
    const chipBox = chips.querySelector('#obs-chips');
    [['temp', '°C'], ['wind', 'Wind']].forEach(([key, lab]) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = `chip${state.show[key] ? ' is-on' : ''}`;
      c.textContent = lab;
      c.addEventListener('click', () => { state.show[key] = !state.show[key]; renderTab(); });
      chipBox.appendChild(c);
    });
    const info = document.createElement('p');
    info.textContent = 'Past 2 hours of rain radar · 5-minute frames. Drag the timeline or let it play.';
    panelBody.appendChild(info);
    for (const s of state.obs?.stations ?? []) {
      if (state.show.temp && Number.isFinite(s.tempC))
        marker(s.lon, s.lat, `${s.tempC.toFixed(1)}°`, s.name, 'wx--obs');
      if (state.show.wind && Number.isFinite(s.windKt) && Number.isFinite(s.windDeg))
        // direction = where the wind comes FROM; arrow points where it blows TO
        marker(s.lon, s.lat, `<i class="wx__arrow" style="transform:rotate(${s.windDeg + 180}deg)">↑</i>${Math.round(s.windKt)}kt`, s.name, 'wx--obs wx--wind');
    }
  } else if (state.tab === '2h') {
    panelTitle.textContent = '2-hour forecast';
    if (state.err['2h']) return panelBody.appendChild(errBlock('2h', '2-hour forecast'));
    if (!d2) return;
    panelBody.innerHTML = `<p>${d2.validity || 'Next 2 hours'} · tap an area for details.</p>`;
    d2.areas.forEach((a) => {
      const b = marker(a.lon, a.lat, iconFor(a.forecast), a.name);
      b.addEventListener('click', () => {
        document.querySelectorAll('.wx.is-pinned').forEach((x) => x.classList.remove('is-pinned'));
        b.classList.add('is-pinned');
        panelBody.innerHTML = `<div class="wx-card"><h3>${a.name}</h3><p>${iconFor(a.forecast)} ${a.forecast}</p><p>${d2.validity}</p></div>`;
      });
    });
  } else if (state.tab === '24h') {
    panelTitle.textContent = '24-hour forecast';
    if (state.err['24h']) return panelBody.appendChild(errBlock('24h', '24-hour forecast'));
    const d = state.data['24h'];
    if (!d) return;
    const p = d.periods[Math.min(state.period, d.periods.length - 1)];
    if (!p) { panelBody.textContent = 'No period data.'; return; }
    Object.entries(REGION_ANCHORS).forEach(([region, [lon, lat]]) => {
      marker(lon, lat, iconFor(p.regions[region]), region.toUpperCase(), 'wx--region');
    });
    const g = d.general;
    panelBody.innerHTML = `
      <div class="wx-card"><h3>General</h3>
        <p>${iconFor(g.forecast)} ${g.forecast}</p>
        <p>${g.tempLow}–${g.tempHigh} °C · ${g.humidityLow}–${g.humidityHigh} % RH · wind ${g.windDir} ${g.windLow}–${g.windHigh} km/h</p></div>
      <div class="wx-card"><h3>Period</h3><div id="chips"></div></div>`;
    const chips = panelBody.querySelector('#chips');
    d.periods.forEach((q, i) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = `chip${i === state.period ? ' is-on' : ''}`;
      c.textContent = q.label;
      c.addEventListener('click', () => { state.period = i; renderTab(); });
      chips.appendChild(c);
    });
  } else {
    panelTitle.textContent = '4-day outlook';
    if (state.err['4d']) return panelBody.appendChild(errBlock('4d', '4-day outlook'));
    const d = state.data['4d'];
    if (!d) return;
    if (d2) d2.areas.forEach((a) => marker(a.lon, a.lat, iconFor(a.forecast), a.name, 'wx--dim'));
    panelBody.innerHTML = d.days.map((x) => `
      <div class="wx-card"><h3>${x.day} <small>${x.date}</small></h3>
        <p>${iconFor(x.forecast)} ${x.summary || x.forecast}</p>
        <p>${x.tempLow}–${x.tempHigh} °C · ${x.humidityLow}–${x.humidityHigh} % RH · wind ${x.windDir} ${x.windLow}–${x.windHigh} km/h</p></div>`).join('');
  }
}

document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => { state.tab = t.dataset.tab; state.period = 0; renderTab(); })
);
document.getElementById('btn-refresh').addEventListener('click', loadAllKinds);
loadAllKinds();
