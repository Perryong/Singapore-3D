# Food and MRT Explorer Implementation Plan

> Execute inline using superpowers:executing-plans, followed by an independent code review.

**Goal:** Ship a real-data food and MRT discovery page inside the existing static site.
**Architecture:** Plain ES modules, MapLibre and checked-in GeoJSON snapshots; HTML directory works independently of the basemap.
**Tech stack:** HTML, CSS, JavaScript, Python stdlib/curl for data normalization, Node assertions.
**Spec:** docs/superpowers/specs/2026-09-25-food-mrt-explorer-design.md

## Global constraints
- Preserve existing urban and weather pages and no-build deployment.
- Do not invent places, ratings, opening status or journey estimates.
- Validate geographic data; use textContent for external strings.
- Attribute sources and show snapshot date and partial coverage.

## Review focus
- Malformed URL values must fall back to a valid Singapore viewport.
- No-results and map failure must retain usable search and recovery.
- Hidden MRT overlay must not interfere with food selection.
- Mobile result lists must leave an operable map and closable details.
- All external data and links must be safe at their rendering boundary.

### Task 1: Data and directory logic
- [x] Fetch public source snapshots and normalize compact food, station and route records; record provenance.
- [x] Write `js/explore/core.test.mjs` covering category/text filtering, code search, nearest stations and invalid coordinates/URLs. Run `node js/explore/core.test.mjs` before implementation and confirm failure.
- [x] Implement `js/explore/core.mjs` using filter, haversine distance, numeric bounds and GeoJSON validation. Run the check again and validate snapshots.

### Task 2: Map and interface
- [x] Create `explore.html`, `css/explore.css`, `js/explore/app.js`: dark map, responsive results panel, categories, food/station detail, MRT toggle, reset, URL share and retry states.
- [x] Load datasets independently of the basemap. Use GeoJSON layers for food clusters, stations and coloured rail lines.
- [x] Add homepage navigation and README data/refresh instructions.

### Task 3: Verification and delivery
- [x] Serve using `python3 -m http.server 8000` and test actual search, selection, category, MRT toggle and share/reset flows in the browser.
- [x] Check narrow viewport, console errors, malformed URL fallback and empty query results.
- [x] Run core/data checks and `git diff --check`; request independent review, resolve important findings and report exact limitations.

## Execution ledger
- Proceeding inline following the user's instruction to build the application. Work on a feature branch in the existing checkout so the previously installed package files remain available. No deployment or push is part of this request.

- Task 1 complete: 8,386 food places (including 123 NEA centres), 142 stations, six lines. Core/data assertions pass. Regression covers new/replacement/interim NEA centres and shared camera bounds.
- Task 2 complete: responsive explorer and homepage link added; static deployment preserved.
- Task 3 complete: desktop 1440×900 and 1280×800, mobile 390×844 tested. Verified food selection, nearest station details, TE18 search, categories, empty results recovery, rail visibility, share/reload, cluster expansion, reset and mobile panel controls.
- Failure fixture: MapLibre import deliberately unavailable on a separate local test server; directory remained searchable and rail=0 legend stayed hidden.
- Existing browser checks: 11 geometry + 50 weather checks passed. New Node checks, JavaScript syntax, Python compilation and git diff --check passed. No browser errors on the live preview; upstream dark basemap emits a non-blocking missing wood-pattern sprite warning.
- Independent review: two P2 findings fixed (shared camera bounds and pre-load legend state); follow-up review reported no remaining important issues.
- Ruling: used SG Rail Data, RailRouter's public source, instead of rebuilding MRT topology from raw OSM. Attribution and snapshot limitations are recorded in the UI and README.
- Delivery: changes remain on codex/food-mrt-explorer; preview at http://localhost:8013/explore.html. No push or deployment performed. Earlier package installation files remain intact.
