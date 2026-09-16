# Urban board — Poster mode (sub-project A) — design

**Date:** 2026-08-31  **Status:** approved in chat  **Parent:** 2026-08-30-urban-analysis-board-design.md

## Goal
Make `urban.html` composable as the reference poster ("Singapore Multi-Dimensional
Urban Analysis"): a portrait board with seven axonometric layers stacked on one
vertical axis, numbered analytical modules on the left, key observations with
circular thumbnails and the full legend on the right, ticked scale bar and
compass at the bottom. Interactive page stays; poster is a view of it.

Reference image: `~/Downloads/ec0960c1-7410-4303-ab24-9c4de2fcd2f1.png` (not committed).

## Decisions
| Question | Answer |
|---|---|
| Deliverable | Poster *mode* inside `urban.html` (`?view=poster` + footer button), not a separate page or static image |
| Layer content | Today's bake (7.8 MB). Satellite L-07 / offshore islands = sub-project B; denser bake = sub-project C |
| Style | Clean flat fills, slab plate edges, paper grain. No watercolor/hatching |
| Language | English only |
| Thumbnails | Live: same scene rendered per-observation via scissor viewports |

## Non-goals
Chinese text; satellite imagery; contours; watercolor shaders; a third HTML page; changing the tank sheet.

## §1 Layout (`urban.html`, `css/urban.css`, `js/urban/app.js`)
- `js/urban/app.js` reads `new URLSearchParams(location.search).get('view') === 'poster'` → adds `is-poster` to `<body>` before `bootSheet`. Footer gains `<a class="reset" href="?view=poster">Poster</a>` (sheet mode) / `href="urban.html"` "Sheet" (poster mode) — one anchor, text and href swapped by the class.
- `body.is-poster .sheet` becomes a scrolling board: `grid-template-columns: 300px minmax(520px, 1fr) 320px`, `max-width: 1240px`, margin auto, white paper; `.sheet__head` reduced to the title block only (designation + type in the reference's two-line style); `.sheet__foot` shows only Poster/Sheet link, PNG button and the scale+compass strip; slider, presets and toggles hidden.
- Left column: existing `#bom-list` rows restyled as modules — `li.bom__row` shows the layer number (big, coloured per layer: reuse the first legend swatch colour), the name as a heading, `spec` as body text, and the full legend list. `ui.js` already knows `legend`; it gains `spec` in the row template only when `data.OBSERVATIONS` exists (poster-capable dataset), so the tank list is unchanged.
- Right column: `#data-panel` empty-state (already renders Key observations + all-layer legend) gets a `.thumb` placeholder per observation: `<div class="thumb" data-layer="L-02" data-area="cbd"></div>`; CSS `width/height: 96px; border-radius: 50%; overflow: hidden`.
- Bottom strip inside `.field` (poster mode only): scale bar with 0/5/10/15/20/25 km ticks (six `<i>` in a flex row, CSS only) and a compass SVG (circle + needle + "N"), replacing the plain rule and arrow.
- Callout labels (`#callout-layer`) are hidden in poster mode; the left modules carry the names.

## §2 Camera, explode, guides (`js/themes.js`, `js/scene.js`, `js/sheet.js`, `js/callouts.js`)
- `URBAN_THEME.poster = { ortho: true, azimuth: 30, elevation: 35, explodeStep: 5.2 }`. `createScene` accepts `theme.poster` when `body.is-poster`: builds an `OrthographicCamera`, positions it on the azimuth/elevation ray at distance 200 looking at the stack centre, sets `controls.enabled = false`. `resize()` fits the ortho frustum: half-height = `(6 * explodeStep + 30) / 2 * 1.15`, half-width = half-height × aspect.
- `bootSheet` in poster mode: `setDisassembly(100)` once, slider `input` ignored (it is hidden anyway).
- Guides: `callouts.update()` already computes each group's projected centre. In poster mode it draws, instead of labels/leaders, two dashed `<polyline>`s in `#leader-layer` through the projected left-most and right-most plate corners of all seven groups (use `Box3` min/max x at the plate's y), class `guide`, `stroke-dasharray: 4 6`, colour `--dimmer`. Labels stay hidden.

## §3 Thumbnails (`js/urban/thumbs.js`, `js/sheet.js`)
- `createThumbs(api, data)`: one extra `WebGLRenderer` with `alpha: true` on a fixed, pointer-events-none full-viewport canvas (`#thumb-canvas`). Each frame (after the main render) for each `.thumb` element: `getBoundingClientRect()`, skip if off-screen, `setScissor/setViewport` to the rect, set every layer group `visible` = (id === thumb.dataset.layer), top-down `OrthographicCamera` fitted to `AREAS[thumb.dataset.area]` (bbox in scene units), render; restore visibility. This is three.js's "multiple elements" pattern; ~60 lines.
- `AREAS` in `data/urban/layers.js`: `cbd`, `central`, `island` (whole), `punggol`, `jurong` — hand-authored bboxes in scene units with a one-line comment each.
- `OBSERVATIONS` gain `layer` and `area`: (1) Green core → L-01/central; (2) Core aligns → L-02/cbd; (3) Transport → L-03/central; (4) Growth outward → L-04/island; (5) Density → L-05/cbd; (6) Grain → L-06/cbd; (7) Region → L-07/island.
- Thumbnail plates keep the beige base so the circle reads as a map tile.

## §4 Slab plates (`js/urban/geo.js`)
- `plateMesh` extrudes the coast polygon `depth = 0.35` (`ExtrudeGeometry`, bevel off) instead of a flat `ShapeGeometry`; top face beige, side faces `#d9d0bd` via a second material slot (`ExtrudeGeometry` assigns material index 0 = caps, 1 = sides). Outline stays on the top face. The `isPlate` highlight still targets the cap. Layer content y-offsets already sit above 0.05 → raise `Z` offsets in `layers.js` by 0.35 so content sits on the slab top. This applies in both modes.

## §5 Export
- `@media print`: force poster layout, hide the footer links/buttons, `size: A2 portrait`.
- "PNG" button (poster footer): captures the main canvas with the nested-`requestAnimationFrame` `toDataURL` method and triggers a download named `singapore-urban-analysis.png`. Thumbnails/DOM are not composited (browser print covers the whole board).

## §6 Error handling
- Missing `area` key → thumbnail falls back to `island`. Missing `layer` → thumb hidden.
- Poster mode with no `data.OBSERVATIONS` (tank sheet) → `createThumbs` is a no-op; `is-poster` has no effect on `index.html` because its CSS lives in `urban.css`.

## §7 Testing
- `js/urban/geo.test.html` gains one assertion: `plateMesh` returns a mesh whose bounding box height ≈ 0.35.
- Playwright: `urban.html?view=poster` → `document.body.classList.contains('is-poster')`; 7 `.bom__row` modules with visible `.module__num`; 7 `.thumb` placeholders; each thumb's centre pixel (read from `#thumb-canvas` via nested-rAF `toDataURL` + offscreen decode, or `gl.readPixels` inside the render loop hook) is not pure white; two `.guide` polylines with non-empty `points`; slider hidden; `urban.html` (sheet mode) unchanged: 7 callouts, slider works; `index.html`: 23 callouts, no console errors.

## Files
New: `js/urban/thumbs.js`.
Modified: `urban.html`, `css/urban.css`, `js/urban/app.js`, `js/urban/geo.js`, `js/urban/layers.js` (Z offsets), `data/urban/layers.js` (AREAS, OBSERVATIONS fields), `js/themes.js`, `js/scene.js` (ortho/poster branch), `js/sheet.js` (poster boot, thumbs hook), `js/callouts.js` (guides), `js/urban/geo.test.html`, `README.md` (one paragraph).
