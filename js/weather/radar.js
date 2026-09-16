/**
 * NEA rain-radar frames: the last 2 h as 5-minute snapshots, displayed as a
 * geo-positioned <img> overlay with a play/pause scrubber.
 *
 * The PNGs are CORS-locked to weather.gov.sg — displaying them in an <img>
 * is fine, but they must NEVER be drawn into a canvas or texture.
 * Bounds (cheeaun/rain-geojson-sg): lat 1.156–1.475, lon 103.565–104.130.
 */

const RADAR_BASE = 'https://www.weather.gov.sg/files/rainarea/50km/v2/dpsri_70km_';
const BOUNDS = { west: 103.565, east: 104.13, north: 1.475, south: 1.156 };
const FRAMES = 25; // 2 h of 5-min steps
const TICK_MS = 500;
const HOLD_NEWEST_MS = 1500;

// SGT (UTC+8) wall-clock digits for an instant, independent of client TZ.
function sgt(ts) {
  const d = new Date(ts.getTime() + 8 * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

export function frameTimestamps(now = new Date()) {
  const floored = new Date(Math.floor(now.getTime() / 300e3) * 300e3);
  return Array.from({ length: FRAMES }, (_, i) => sgt(new Date(floored.getTime() - i * 300e3)));
}

export function frameUrl(ts) {
  return `${RADAR_BASE}${ts}0000dBR.dpsri.png`;
}

export function createRadar({ field, project, onResize }) {
  const img = document.createElement('img');
  img.className = 'radar';
  img.alt = '';
  img.hidden = true;
  field.appendChild(img);

  const bar = document.createElement('div');
  bar.className = 'radar-bar';
  bar.hidden = true;
  bar.innerHTML = `
    <button type="button" class="radar-bar__play" aria-label="Play or pause">▶</button>
    <input type="range" class="radar-bar__scrub" min="0" max="0" step="1" value="0" aria-label="Radar frame" />
    <span class="radar-bar__time">—</span>`;
  field.appendChild(bar);
  const playBtn = bar.querySelector('.radar-bar__play');
  const scrub = bar.querySelector('.radar-bar__scrub');
  const timeEl = bar.querySelector('.radar-bar__time');

  function place() {
    const tl = project(BOUNDS.west, BOUNDS.north);
    const br = project(BOUNDS.east, BOUNDS.south);
    img.style.left = `${tl.x}px`;
    img.style.top = `${tl.y}px`;
    img.style.width = `${br.x - tl.x}px`;
    img.style.height = `${br.y - tl.y}px`;
  }
  onResize(place);
  place();

  // Timeline: oldest→newest for scrubbing; frames whose Image errors drop out.
  let frames = []; // [{ts, url}]
  let idx = 0;
  let timer = null;
  let gen = 0;
  let visible = false;

  function label(ts) {
    return `${ts.slice(8, 10)}:${ts.slice(10)}`;
  }

  function setFrame(i) {
    if (!frames.length) return;
    idx = Math.max(0, Math.min(i, frames.length - 1));
    img.src = frames[idx].url;
    img.hidden = !visible;
    scrub.value = String(idx);
    scrub.setAttribute('aria-valuetext', label(frames[idx].ts));
    timeEl.textContent = label(frames[idx].ts);
  }

  function tick() {
    const atEnd = idx >= frames.length - 1;
    setFrame(atEnd ? 0 : idx + 1);
    timer = setTimeout(tick, idx === frames.length - 1 ? HOLD_NEWEST_MS : TICK_MS);
  }

  function play() { if (!timer && frames.length > 1) { playBtn.textContent = '❚❚'; playBtn.setAttribute('aria-label', 'Pause'); tick(); } }
  function pause() { clearTimeout(timer); timer = null; playBtn.textContent = '▶'; playBtn.setAttribute('aria-label', 'Play'); }

  playBtn.addEventListener('click', () => (timer ? pause() : play()));
  scrub.addEventListener('input', () => { pause(); setFrame(Number(scrub.value)); });

  async function refresh() {
    pause();
    const g = ++gen;
    const candidates = frameTimestamps();
    const loads = candidates.map((ts) => new Promise((res) => {
      const probe = new Image();
      probe.onload = () => res({ ts, url: frameUrl(ts) });
      probe.onerror = () => res(null);
      probe.src = frameUrl(ts);
      setTimeout(() => res(null), 8000);
    }));
    const loaded = (await Promise.all(loads)).filter(Boolean);
    if (g !== gen) return null;
    frames = loaded.reverse(); // oldest → newest
    if (!frames.length) throw new Error('no radar frames available');
    scrub.max = String(frames.length - 1);
    setFrame(frames.length - 1);
    if (visible) play();
    return frames.length;
  }

  function setVisible(on) {
    visible = on;
    bar.hidden = !on;
    img.hidden = !on || !frames.length;
    if (!on) pause();
    else if (frames.length) play();
  }

  return { setVisible, refresh };
}
