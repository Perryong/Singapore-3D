/**
 * Entry point for the Singapore urban analysis board. Loads the baked
 * geometry first, then boots the shared sheet with a builder that closes
 * over it.
 */
import { bootSheet } from '../sheet.js';
import { URBAN_THEME } from '../themes.js';
import { loadAll } from './geo.js';
import { buildLayers, LAYER_FILES } from './layers.js';
import * as data from '../../data/urban/layers.js';

const docs = await loadAll(LAYER_FILES);
data.PARTS.forEach((p) => {
  if (p.files.some((f) => docs[f].failed)) p.name += ' (data unavailable)';
});
// Poster is the home view; the interactive sheet lives behind ?view=sheet
// (old ?view=poster links still resolve to the poster).
const poster = new URLSearchParams(location.search).get('view') !== 'sheet';
document.body.classList.toggle('is-poster', poster);
const link = document.getElementById('view-link');
if (poster) {
  link.href = '?view=sheet';
  link.textContent = 'Explore Singapore in 3D \u2192';
  // Promote the link to a call-to-action in the header so visitors see
  // there is an interactive version of this board.
  link.classList.add('cta');
  const wx = document.createElement('a');
  wx.className = 'cta';
  wx.href = './weather.html';
  wx.textContent = 'Check the weather \u2192';
  const row = document.createElement('div');
  row.className = 'cta-row';
  row.append(link, wx);
  const hint = document.createElement('p');
  hint.className = 'view-hint';
  hint.textContent = 'Open the interactive sheet: rotate the stack, pull the layers apart, click anything for its data.';
  const ident = document.querySelector('.ident');
  ident.appendChild(row);
  ident.appendChild(hint);
  document.getElementById('btn-png').hidden = false;
  // @page can't be scoped by selector; only add it on the poster view.
  document.head.insertAdjacentHTML(
    'beforeend',
    '<style media="print">@page { size: A2 portrait; margin: 12mm }</style>'
  );
}
const theme = poster ? URBAN_THEME : { ...URBAN_THEME, poster: null };
bootSheet({ data, build: () => buildLayers(docs), theme });
