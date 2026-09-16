/**
 * Annotation callouts.
 *
 * Each part gets an HTML label parked in a margin column and a leader line
 * back to the part itself. The label positions are recomputed every frame
 * from the projected 3D anchor, so they track the model as it rotates and
 * as it comes apart.
 *
 * Labels are stacked rather than left where they land: a real annotated
 * drawing keeps its callouts in tidy columns with the leaders doing the
 * work of pointing.
 */

import * as THREE from 'three';

const ROW_H = 26;
const MARGIN = 14;

export function createCallouts(layer, svg, parts, api) {
  const nodes = new Map();
  const anchorBox = new THREE.Box3();
  const anchor = new THREE.Vector3();
  const projected = new THREE.Vector3();

  parts.forEach((p) => {
    const el = document.createElement('button');
    el.className = 'callout';
    el.type = 'button';
    el.dataset.partId = p.id;
    el.innerHTML = `<span class="callout__id">${p.id}</span><span class="callout__name">${p.name}</span>`;
    layer.appendChild(el);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('class', 'leader');
    svg.appendChild(line);

    nodes.set(p.id, { el, line });
  });

  const guides = ['left', 'right'].map(() => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    g.setAttribute('class', 'guide');
    svg.appendChild(g);
    return g;
  });

  let enabled = true;
  let selectedId = null;
  // Poster mode is a still image: the guides only move when the fit or the
  // selection does, so recompute them on demand rather than every frame.
  let dirty = true;
  const markDirty = () => { dirty = true; };

  function setEnabled(on) {
    enabled = on;
    layer.classList.toggle('is-hidden', !on);
    svg.classList.toggle('is-hidden', !on);
  }

  function setSelected(id) {
    selectedId = id;
    nodes.forEach((n, partId) => {
      n.el.classList.toggle('is-selected', partId === id);
      n.line.classList.toggle('is-selected', partId === id);
    });
  }

  function update() {
    if (!enabled) return;
    // `svg` (the leader layer) is never hidden in poster mode (`layer`, the
    // label layer, is) and sheet.js keeps its width/height attributes in
    // sync with the canvas, so read the shared w/h from it.
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    if (!w || !h) return;
    if (api.poster) {
      if (!dirty) return;
      dirty = false;
      return updateGuides(w, h);
    }

    const left = [];
    const right = [];

    api.groups.forEach((grp, id) => {
      const node = nodes.get(id);
      if (!node) return;
      if (!grp.visible) {
        node.el.style.display = 'none';
        node.line.style.display = 'none';
        return;
      }

      anchorBox.setFromObject(grp);
      if (anchorBox.isEmpty()) {
        node.el.style.display = 'none';
        node.line.style.display = 'none';
        return;
      }
      anchorBox.getCenter(anchor);
      projected.copy(anchor).project(api.camera);

      if (projected.z > 1) {
        node.el.style.display = 'none';
        node.line.style.display = 'none';
        return;
      }

      const sx = ((projected.x + 1) / 2) * w;
      const sy = ((1 - projected.y) / 2) * h;
      (projected.x < 0 ? left : right).push({ id, node, sx, sy });
    });

    layoutColumn(left, 'left', w, h);
    layoutColumn(right, 'right', w, h);
  }

  // Poster mode: no labels; two dashed guides through the plates' left- and
  // right-most projected corners, like the reference board's alignment lines.
  const corner = new THREE.Vector3();
  function updateGuides(w, h) {
    const pts = { left: [], right: [] };
    api.groups.forEach((grp) => {
      // Measure only the plate cap, not e.g. L-07's oversized background
      // quad, which would otherwise drag a guide endpoint off-screen.
      anchorBox.makeEmpty();
      grp.traverse((o) => {
        if (o.userData.isPlate) anchorBox.expandByObject(o);
      });
      if (anchorBox.isEmpty()) anchorBox.setFromObject(grp);
      if (anchorBox.isEmpty()) return;
      const y = anchorBox.max.y;
      const xs = [anchorBox.min.x, anchorBox.max.x];
      const zs = [anchorBox.min.z, anchorBox.max.z];
      let minSx = Infinity, maxSx = -Infinity, minP, maxP;
      xs.forEach((x) => zs.forEach((z) => {
        corner.set(x, y, z).project(api.camera);
        const sx = ((corner.x + 1) / 2) * w;
        const sy = ((1 - corner.y) / 2) * h;
        if (sx < minSx) { minSx = sx; minP = `${sx},${sy}`; }
        if (sx > maxSx) { maxSx = sx; maxP = `${sx},${sy}`; }
      }));
      pts.left.push(minP);
      pts.right.push(maxP);
    });
    guides[0].setAttribute('points', pts.left.join(' '));
    guides[1].setAttribute('points', pts.right.join(' '));
  }

  function layoutColumn(items, side, w, h) {
    items.sort((a, b) => a.sy - b.sy);

    // Push labels apart so they never overlap, then nudge the whole stack
    // back inside the viewport if it has run off the bottom.
    let y = MARGIN;
    items.forEach((item) => {
      item.ly = Math.max(y, Math.min(item.sy - ROW_H / 2, h - MARGIN - ROW_H));
      y = item.ly + ROW_H + 4;
    });
    const overflow = y - (h - MARGIN);
    if (overflow > 0) {
      items.forEach((item) => {
        item.ly -= overflow;
      });
    }

    // The label width is set in CSS and changes at the mobile breakpoint, so
    // measure it rather than assuming it.
    const labelW = items[0]?.node.el.offsetWidth || 176;
    const lx = side === 'left' ? MARGIN : w - MARGIN - labelW;
    const elbowX = side === 'left' ? lx + labelW + 10 : lx - 10;

    items.forEach((item) => {
      const { node, sx, sy, ly } = item;
      node.el.style.display = '';
      node.line.style.display = '';
      node.el.style.transform = `translate(${Math.round(lx)}px, ${Math.round(ly)}px)`;

      const anchorY = ly + ROW_H / 2;
      node.line.setAttribute(
        'points',
        `${elbowX},${anchorY} ${elbowX + (side === 'left' ? 16 : -16)},${anchorY} ${sx},${sy}`
      );
    });
  }

  layer.addEventListener('click', (e) => {
    const btn = e.target.closest('.callout');
    if (btn) api.onCalloutClick?.(btn.dataset.partId);
  });

  return { update, setEnabled, setSelected, markDirty };
}
