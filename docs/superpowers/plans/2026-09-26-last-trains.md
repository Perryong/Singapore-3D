# Singapore Last Trains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add scheduled last-departure exploration to the existing map with a reversible toggle and evening timeline.

**Architecture:** Normalize operator timetables into a checked-in snapshot joined to existing station codes. A pure JavaScript module handles time, applicability and status; the existing app renders station rings, details and controls. Keep the new mode separate from saved food/MRT state and reuse the collapsible panel.

**Tech Stack:** Existing Python environment, Node assertion tests, plain JavaScript/HTML/CSS, MapLibre 5.12.0 and browser Playwright. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-26-last-trains-design.md` — approved by the user before this plan.

## Global Constraints

- All calculations use Asia/Singapore regardless of device timezone.
- The slider spans 21:00 on that date through 02:00 the following date, in one-minute increments; after-midnight labels include +1 day.
- Playback advances one simulated minute per 250 ms, stops at the upper bound, and stops when leaving the mode or hiding the browser tab.
- Target all six existing MRT lines. Missing records remain visible as unavailable; do not invent times, infer them from neighbouring stations, or use a generic midnight cutoff.
- No new runtime dependencies, backend, account or API key are planned.
- Raised 3D tracks, moving train positions, transfer routing, live arrivals, automatic disruption handling and LRT are deferred.
- Preserve current uncommitted explorer work, including Vegetarian and the desktop/mobile panel toggle. Do not reset or omit it when creating an isolated checkout; inspect working-tree setup before execution.

## Review Focus

- Rapid toggle on/off while a fetch resolves must not overwrite the restored explorer (Task 3).
- Browser backgrounding during playback must stop the timer without catch-up jumps (Task 4).
- An interchange with one uncovered service must not become fully passed when its known service ends (Task 2).
- A changed operator table header or dash must not silently become a midnight departure (Task 1).
- A shared impossible date, fractional minute or unknown station must fall back safely without autoplay (Task 2).

## Files and contracts

Create `tools/fetch_last_trains.py`, `tools/last_trains_test.py` and small captured table fixtures under `tools/fixtures/last-trains/`; create `data/explore/last-trains.json`. Create `js/explore/last-trains.mjs` and `js/explore/last-trains.test.mjs`. Modify `js/explore/app.js`, `explore.html`, `css/explore.css` and `README.md`. Do not restructure unrelated app code.

Snapshot schema version 1:

- `timezone: "Asia/Singapore"`, `retrievedAt`, `sources`: keyed records with HTTPS operator URL, retrieval date and nullable published update/effective dates.
- `services`: each has unique `id`, `stationId`, `stationCode`, `line`, `destination`, `sourceId` and `rules`.
- A rule has `weekdays` (ISO 1–7), `dayClass` (`regular` or `holiday`), nullable `validFrom`/`validTo`, and `minute` (integer service-day minute, null only for explicitly unavailable/no-service records), plus `status` (`published`, `unavailable`, `not-applicable`).
- `overrides`: keyed by service ID and exact service date, with the same minute/status semantics; an explicit override takes priority over weekly rules.
- `coverage`: per station, `expectedServiceIds`, `enumerationComplete` and `reason`. Enumerating only successfully parsed services must never imply complete coverage.
- `calendar`: dated holiday records with source metadata, and explicit year coverage. Outside covered years, regular schedules are previews with unverified exceptions. Until a supported calendar is collected, all dates carry that qualification.

No schedule field represents a live train position. Regular-schedule status remains visibly qualified where exceptional-date verification is incomplete.

### Task 1: Import and validate sourced timetables

**Files:** Create importer, importer tests, fixtures and normalized snapshot listed above; document source refresh in README.

**Interfaces:** `parse_time(text: str) -> int | None`; `parse_sbs(html: str) -> list[dict]`; `parse_smrt(html: str, station_code: str) -> list[dict]`; `build_snapshot(records, stations, sources, coverage, calendar) -> dict`. Parser records include station code, line, destination, day applicability, source ID and status. CLI: `tools/.venv/bin/python tools/fetch_last_trains.py --cached DIR`; without cached inputs, download documented operator inputs. Complete validation before atomic replacement of the output file.

- [ ] Capture a minimal representative SBS table and inspect SMRT's actual table structure using its published station pages. Include merged headers and explicit no-service cells in fixtures; retain source URLs. Establish exact station-code mapping from `stations.geojson`. If SMRT cannot be automatically retrieved, use a small source-backed manual extraction with the same validation and explicit coverage gaps.
- [ ] Write parser assertions: `parse_time('11.59pm') == 1439`, `parse_time('12.00am') == 1440`, `parse_time('12.20am') == 1460`, `parse_time('-') is None`; `25:99`, blank cells and changed required headers raise errors. Fixture assertions must distinguish a terminal no-service row from an unavailable parse. Assert duplicate service identities and unknown station codes fail validation; separate valid rules within one service are allowed.
- [ ] Run `tools/.venv/bin/python tools/last_trains_test.py`; confirm expected failures before implementation.
- [ ] Implement the parsers with existing libraries/stdlib, preserving operator day/destination distinctions and short-turn services. A published update date is not automatically an effective-from date. Validate source URLs against exact SMRT/SBS operator hosts. Record unmatched operator rows for review and never discard them silently. Keep the previous snapshot on download, parsing or validation failure.
- [ ] Acquire each accessible line's real schedules, resolve exact code joins, and produce coverage for every mapped station. Include sources and dates; show unavailable services explicitly. Check all six lines, but report actual supported coverage instead of manufacturing completeness. Check operator exception notices for the intended dates; keep unverified exceptions qualified.
- [ ] Run importer assertions and compare at least one direction pair and an after-midnight row per imported line against its source. Re-run with a malformed fixture and assert the existing output bytes are unchanged. Document refresh commands and actual coverage. Commit only this task's files, preserving previous uncommitted work.

### Task 2: Time, applicability, status and share-state logic

**Files:** Create `js/explore/last-trains.mjs` and `js/explore/last-trains.test.mjs`.

**Interfaces:** Export `validateTimetable(data, stations) -> data`, `nowSelection(now: Date, data) -> {serviceDate, minute, preview}`, `selectServices(data, stationId, serviceDate) -> {services, complete, exceptionVerified}`, `departureStatus(departureMinute, minute) -> {status, remainingMinutes}`, `stationStatus(selection, minute) -> {status, partial}`, `timelineEnd(data, serviceDate) -> integer`, `formatMinute(minute) -> string`, and `selectionFromURL(search, data, now) -> {serviceDate, minute, stationId, preview}`. Status values are `remaining`, `due`, `passed`, `unavailable`; an incomplete all-past station is unavailable/partial, not passed.

- [ ] Write Node assertions for minute 1439/1440/1460 formatting, `departureStatus(1460,1459)` remaining 1, equal values due, and 1461 passed. Use synthetic services to assert a known past departure plus an unknown expected service yields unavailable/partial; a future known departure plus missing data yields remaining/partial.
- [ ] Add deterministic date assertions using fixed UTC instants: `2026-09-25T16:20:00Z` selects service date `2026-09-25` and minute 1460; `2026-09-26T04:00:00Z` selects `2026-09-26`, minute 1260 and preview. Assert a dated override beats weekly data, terminal not-applicable records don't count as missing, and uncovered calendar years are unverified previews.
- [ ] Add validation assertions for duplicate service IDs, overlapping conflicting rules, unsupported source URLs, unknown station IDs and malformed dates. URL assertions reject February 30, fractional/out-of-range minutes and unknown stations, retaining safe defaults. Assert a published 02:30 extension makes timeline end at least 1590; default is 1560.
- [ ] Run `node js/explore/last-trains.test.mjs`; confirm failures identify missing logic.
- [ ] Implement the pure functions without new dependencies. Use explicit Singapore timezone date parts, ISO date validation and integer service-day arithmetic. Treat unknown calendar/exception applicability as qualified regular-schedule preview, not silently verified data. Define station priority: future known departure, then due, then complete-all-passed, otherwise unavailable; always retain the partial flag.
- [ ] Run the test file with `TZ=UTC` and `TZ=America/Los_Angeles`, plus `node js/explore/core.test.mjs`. Both timezone runs must agree. Commit only the module and tests.

### Task 3: Reversible map mode and departure details

**Files:** Modify `explore.html`, `css/explore.css`, `js/explore/app.js`.

**Interfaces:** Consume Task 2 exports. Add app-local `setLastTrainMode(enabled)`, `renderLastTrains()` and `updateLastTrainMap()`. Keep separate `lastState` with active flag, load state, timetable, date, minute, station ID and search. Capture entry explorer state/camera/panel visibility exactly once per activation. Reuse `setPanelVisible`, `showPanel`, current search/ranking and DOM helpers.

- [ ] Use browser Playwright to record the existing page's absence of the Last trains control, then define the acceptance flow: choose Vegetarian, enter a query/select a place, hide panel, activate Last trains, choose a station, deactivate, and assert original filters, selection, camera and collapsed state return.
- [ ] Add an accessible toggle and dedicated timetable panel content. Lazy-load the snapshot once, validating it before use; loading or error state has a retry button. A late fetch may cache data but may render only if last-train mode is still active. Opening last-train mode opens its panel; leaving restores prior panel visibility.
- [ ] Render station search and cards by line/destination using `selectServices`. Include formatted departures, relative status, applicability, source link and both source/retrieval dates. Show coverage count and unknown/partial messages. Do not feed last-train search text into the preserved food search.
- [ ] Reuse map line colours and station points; hide food/exits and add status rings with partial indicators. Keep geographic lines unchanged. Station selection updates last-train detail; map loading after activation applies the active mode correctly. Food/MRT mode buttons exit first, then apply their explicit requested mode.
- [ ] Extend URL parsing/saving using `last`, `serviceDate`, `minute`, `lastStation`. Preserve original explorer parameters and entry camera in share URLs so direct loads have a meaningful restoration state. Loaded shares are paused. Prevent existing moveend/saveURL logic from overwriting saved explorer state while this mode is active.
- [ ] Run Playwright assertions for the full restoration flow, direct share load, station selection, explicit Food/MRT clicks and rapid on/off before data resolves. Verify failed timetable loading leaves the directory usable and retry succeeds; use a controlled local test server response if browser interception is unavailable. Verify map failure still leaves the timetable readable. Run both Node suites and commit the integration files only.

### Task 4: Timeline, playback and responsive verification

**Files:** Modify the same page/style/app files; update README with actual coverage and usage.

**Interfaces:** Use `nowSelection`, `timelineEnd`, `formatMinute` and `departureStatus`. App-local `stopLastTrainPlayback()` clears the sole interval and updates the button's accessible name. Reuse `setLastTrainMode` and rendering from Task 3.

- [ ] Before implementation, record failing browser checks for absent date/range/play controls. Define assertions: manual input stops playback; max time stops it; leaving mode stops it; browser backgrounding stops it; reload/share never starts it.
- [ ] Add a native date input, minute range 1260–`timelineEnd(...)` with step 1, visible time/+1 day, Preview/Evening preview labels, Play/Pause and Now. Validate date input including transient blanks without destroying the last valid selection. Start one interval only on explicit Play; advance one minute every 250ms. Stop on manual changes, maximum, deactivation and `visibilitychange` when hidden. Now chooses the Singapore service date/time and keeps playback paused.
- [ ] Place the timeline clear of map attribution and controls. On mobile it stays usable above the bottom panel toggle; adjust the panel's bottom edge to avoid overlap. Use at least 44px controls, visible focus and text status. Reduced-motion removes camera animation and no mode autoplays.
- [ ] Run Playwright at desktop and 390×844: exercise collapse/reopen in last-train mode, date input, arrow-key range changes, play/pause, end of timeline, Now, normal-mode restoration and skip-to-search/keyboard focus. Read element bounds to verify timeline/panel/toggle/attribution do not overlap. Verify timer stops after backgrounding with a second tab, and reset the viewport afterwards.
- [ ] Run `node js/explore/core.test.mjs`, `node js/explore/last-trains.test.mjs`, `tools/.venv/bin/python tools/last_trains_test.py`, `tools/.venv/bin/python tools/food_data_test.py`, `tools/.venv/bin/python tools/rail_data_test.py`, `node --check js/explore/app.js` and `git diff --check`. Report any failed check by name. Update README with import commands, actual station/service coverage, timetable editions and limitations; do not call unavailable data current or complete.
- [ ] Review the final diff against all nine spec acceptance checks, obtain one independent review and resolve findings. Commit only task changes. Deliver local preview and concise test/coverage results; no deployment or push is requested.

## Plan self-review

The four tasks cover data/provenance, calendar and time logic, reversible UI/share state, and timeline/accessibility. Each Review Focus item is assigned a verification step. Interfaces and status values are shared consistently. The latest desktop/mobile collapse behaviour is retained, and raw geographic tracks are not misrepresented as scheduled train movements. Operator coverage remains a measured implementation result, not an assumed prerequisite or a fabricated full-network claim.

## Execution recommendation

Native execution is recommended: the four tasks depend closely on one snapshot schema and mode state, so implementing them in this session avoids repeated context handoffs. Finish with one independent reviewer. Subagent-driven execution is available if the user prefers a separate implementer/reviewer cycle for each task.

## Execution record — 26 September 2026

Tasks 1–4 implemented in the existing feature checkout. Importer and time logic committed; integrated UI changes remain in the existing working tree alongside the prior explorer work.

- Python and Node assertions pass, including invalid-input rejection, atomic snapshot preservation, midnight, overrides and coverage. Time tests pass under UTC and America/Los_Angeles.
- Browser Playwright verified state restoration, shared-link recovery after HTTP 503, delayed-response toggle cancellation, both directional cards, playback maximum, keyboard focus, mobile collapse/timeline and non-overlapping controls/attribution.
- Independent review findings (early activation race and playback focus loss) addressed and verified.
- Ruling: SMRT's public station data API returned HTTP 403; do not implement a speculative parser or invent times. Four lines remain unavailable.
- Ruling: the in-app browser reports background tabs as visible, so a real visibilitychange transition could not be exercised there. The document-hidden pause listener is implemented; automatic background stopping still needs a real-browser visibility check.
- Ruling: no isolated worktree or broad commit of earlier untracked explorer work; preserve the user-visible local checkout and preview. No deployment/push.
