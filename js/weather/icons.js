/**
 * NEA forecast text → glyph. Text always accompanies the icon in the UI, so
 * an unknown glyph never hides information. Full code list:
 * https://data.gov.sg (two-hr forecast documentation).
 */
const TABLE = [
  [/thundery|thunder/i, '⛈️'],
  [/heavy rain/i, '🌧️'],
  [/moderate rain|^rain$/i, '🌧️'],
  [/light rain|drizzle/i, '🌦️'],
  [/heavy showers/i, '🌧️'],
  [/showers/i, '🌦️'],
  [/showery/i, '🌦️'],
  [/fair.*night|clear.*night|partly cloudy \(night\)/i, '🌙'],
  [/partly cloudy/i, '🌤️'],
  [/cloudy|overcast/i, '☁️'],
  [/hazy|haze|mist|fog/i, '🌫️'],
  [/windy|wind/i, '🌬️'],
  [/fair.*warm|warm/i, '🌞'],
  [/fair|sunny|warm/i, '☀️'],
];

const warned = new Set();

export function iconFor(text) {
  for (const [re, glyph] of TABLE) if (re.test(text)) return glyph;
  if (!warned.has(text)) { warned.add(text); console.warn(`iconFor: unknown forecast "${text}"`); }
  return '❓';
}
