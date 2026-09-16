/**
 * Live station observations: air temperature (°C), wind speed (knots) and
 * wind direction (degrees, FROM which the wind blows), joined by station id.
 */

const BASE = 'https://api-open.data.gov.sg/v2/real-time/api/';

async function get(name) {
  const res = await fetch(BASE + name, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(`${name}: ${json.errorMsg || 'API error'}`);
  return json;
}

export function parseObservations(tempJson, speedJson, dirJson) {
  const stations = new Map();
  let updated = null;

  function fold(json, key) {
    const d = json.data;
    const reading = d.readings?.[0];
    if (!reading) return;
    const t = new Date(reading.timestamp);
    if (!updated || t > updated) updated = t;
    const meta = new Map(d.stations.map((s) => [s.id, s]));
    for (const { stationId, value } of reading.data) {
      const m = meta.get(stationId);
      if (!m) continue;
      const rec = stations.get(stationId) ?? {
        id: stationId, name: m.name, lat: m.location.latitude, lon: m.location.longitude,
      };
      rec[key] = value;
      stations.set(stationId, rec);
    }
  }

  fold(tempJson, 'tempC');
  fold(speedJson, 'windKt');
  fold(dirJson, 'windDeg');
  return { updated, stations: [...stations.values()] };
}

export async function fetchObservations() {
  const [t, s, w] = await Promise.all([get('air-temperature'), get('wind-speed'), get('wind-direction')]);
  return parseObservations(t, s, w);
}
