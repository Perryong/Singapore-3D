/**
 * Parts list and component data panel.
 *
 * The list is the index into everything else: picking a row, clicking a part
 * in the 3D field and clicking a callout all end up calling the same
 * onSelect, so the three views can never disagree about what is selected.
 */

export function createUI({ onSelect, data }) {
  const { PARTS, GROUPS, PART_BY_ID } = data;
  const list = document.getElementById('bom-list');
  const panel = document.getElementById('data-panel');
  const count = document.getElementById('bom-count');

  // ---- Parts list -------------------------------------------------------
  const legendList = (legend) =>
    `<ul class="legend">${legend.map((l) =>
      `<li><i style="background:${l.swatch}" aria-hidden="true"></i><span>${l.label}</span></li>`).join('')}</ul>`;

  GROUPS.forEach((group) => {
    const members = PARTS.filter((p) => p.group === group.id);
    if (!members.length) return;

    const heading = document.createElement('li');
    heading.className = 'bom__group';
    heading.textContent = group.label;
    list.appendChild(heading);

    members.forEach((p) => {
      const row = document.createElement('li');
      row.className = 'bom__row';
      const rich = Boolean(data.OBSERVATIONS);
      const num = rich ? `<span class="module__num" style="color:${p.legend?.[0]?.swatch ?? 'inherit'}">${String(p.id).replace(/\D/g, '').replace(/^0/, '')}</span>` : '';
      row.innerHTML = `
        <button type="button" class="bom__btn" data-part-id="${p.id}">
          ${num}
          <span class="bom__id">${p.id}</span>
          <span class="bom__name">${p.name}</span>
          <span class="bom__qty">${p.qty}</span>
          ${p.legend ? `<span class="bom__legend">${p.legend.slice(0, 3).map((l) =>
            `<i style="background:${l.swatch}" title="${l.label}" aria-hidden="true"></i>`).join('')}</span>` : ''}
          ${rich ? `<span class="module__spec">${p.spec}</span>${legendList(p.legend)}` : ''}
        </button>`;
      list.appendChild(row);
    });
  });

  count.textContent = `${PARTS.length} items`;

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.bom__btn');
    if (btn) onSelect(btn.dataset.partId);
  });

  function setActiveRow(partId) {
    list.querySelectorAll('.bom__btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.partId === partId);
    });
    const active = list.querySelector('.bom__btn.is-active');
    // The poster is one long page; scrolling the row into view jerks it.
    if (active && !document.body.classList.contains('is-poster')) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  // ---- Data panel -------------------------------------------------------
  const EMPTY = data.OBSERVATIONS
    ? `
      <section class="data__block">
        <h4>Key observations</h4>
        ${data.OBSERVATIONS.map((o, i) => `
          <div class="obs">
            <div class="thumb" data-layer="${o.layer ?? ''}" data-area="${o.area ?? 'island'}"><canvas aria-hidden="true"></canvas></div>
            <p><strong>${i + 1} · ${o.title}.</strong> ${o.text}</p>
          </div>`).join('')}
      </section>
      <section class="data__block">
        <h4>Legend — all layers</h4>
        ${PARTS.map((p) => `<h5>${p.id} ${p.name}</h5>${legendList(p.legend)}`).join('')}
      </section>`
    : `
    <p class="data__empty">
      Nothing selected. Pick a row from the parts list, click a component in
      the 3D field, or drag the disassembly slider to take the vehicle apart.
    </p>`;

  function showPart(partId) {
    const p = PART_BY_ID[partId];
    if (!p) {
      panel.innerHTML = EMPTY;
      return;
    }
    panel.innerHTML = `
      <header class="data__head">
        <span class="data__ref">${p.id}</span>
        <h3 class="data__title">${p.name}</h3>
      </header>
      <dl class="data__grid">
        <dt>Quantity</dt><dd>${p.qty}</dd>
        <dt>${p.legend ? 'Source' : 'Construction'}</dt><dd>${p.material}</dd>
        <dt>${p.legend ? 'Position' : 'Mass'}</dt><dd>${p.mass}</dd>
      </dl>
      <section class="data__block">
        <h4>${p.legend ? 'Analysis' : 'Function'}</h4>
        <p>${p.spec}</p>
      </section>
      ${p.legend ? `<section class="data__block"><h4>Legend</h4>${legendList(p.legend)}</section>` : ''}
      <section class="data__block data__block--note">
        <h4>${p.legend ? 'Data note' : 'Maintenance note'}</h4>
        <p>${p.note}</p>
      </section>`;
  }

  function clear() {
    panel.innerHTML = EMPTY;
    setActiveRow(null);
  }

  clear();

  return { showPart, clear, setActiveRow };
}
