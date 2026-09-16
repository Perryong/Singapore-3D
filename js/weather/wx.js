/**
 * data.gov.sg real-time weather APIs: fetch + parse.
 * All three endpoints are open (CORS *, no key) — verified 2026-09-05.
 * Raw response wrapper: { code, errorMsg, data }.
 */

const BASE = 'https://api-open.data.gov.sg/v2/real-time/api/';
const ENDPOINTS = { '2h': 'two-hr-forecast', '24h': 'twenty-four-hr-forecast', '4d': 'four-day-outlook' };
const PARSERS = { '2h': parseTwoHr, '24h': parseTwentyFourHr, '4d': parseFourDay };

export async function fetchForecast(kind) {
  const res = await fetch(BASE + ENDPOINTS[kind], { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`${ENDPOINTS[kind]}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(`${ENDPOINTS[kind]}: ${json.errorMsg || 'API error'}`);
  return PARSERS[kind](json);
}

export function parseTwoHr(json) {
  const d = json.data;
  const item = d.items[0];
  if (!item) throw new Error('two-hr-forecast: empty response');
  const byArea = new Map(item.forecasts.map((f) => [f.area, f.forecast]));
  return {
    updated: new Date(item.update_timestamp ?? item.timestamp),
    validity: item.valid_period?.text ?? '',
    areas: d.area_metadata.map((a) => ({
      name: a.name,
      lon: a.label_location.longitude,
      lat: a.label_location.latitude,
      forecast: byArea.get(a.name) ?? '',
    })),
  };
}

export function parseTwentyFourHr(json) {
  const r = json.data.records[0];
  if (!r) throw new Error('twenty-four-hr-forecast: empty response');
  const g = r.general;
  return {
    updated: new Date(r.updatedTimestamp),
    general: {
      forecast: g.forecast?.text ?? '',
      tempLow: g.temperature?.low, tempHigh: g.temperature?.high,
      humidityLow: g.relativeHumidity?.low, humidityHigh: g.relativeHumidity?.high,
      windDir: g.wind?.direction ?? '', windLow: g.wind?.speed?.low, windHigh: g.wind?.speed?.high,
    },
    periods: r.periods.map((p) => ({
      label: p.timePeriod.text,
      regions: Object.fromEntries(
        ['north', 'south', 'east', 'west', 'central'].map((k) => [k, p.regions[k]?.text ?? ''])
      ),
    })),
  };
}

export function parseFourDay(json) {
  const r = json.data.records[0];
  if (!r) throw new Error('four-day-outlook: empty response');
  return {
    updated: new Date(r.updatedTimestamp),
    days: r.forecasts.map((f) => ({
      day: f.day, date: f.timestamp?.slice(0, 10) ?? '',
      forecast: f.forecast?.text ?? '',
      summary: f.forecast?.summary ?? '',
      tempLow: f.temperature?.low, tempHigh: f.temperature?.high,
      humidityLow: f.relativeHumidity?.low, humidityHigh: f.relativeHumidity?.high,
      windDir: f.wind?.direction ?? '', windLow: f.wind?.speed?.low, windHigh: f.wind?.speed?.high,
    })),
  };
}
