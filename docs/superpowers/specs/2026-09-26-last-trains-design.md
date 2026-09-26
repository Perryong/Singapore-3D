# Singapore last-train map

Status: concept approved; written specification awaiting review.

## Intent and scope

Add a Last trains toggle to the existing Eat & Explore page so visitors can explore scheduled final MRT departures around Singapore. The user requested a map inspired by the Tokyo Last Train Atlas, presented for review before implementation, and approved the proposed first-release concept.

Reuse the existing geographic MapLibre map, LTA station identifiers, OSM rail geometry and responsive panel. The deliverable is an alternate mode within `explore.html`, not a separate application. It shows scheduled departures, their direction and destination, and how they relate to a selected evening time. It does not promise that a complete journey or transfer is possible.

The first release includes the toggle, service date, time slider, play/pause, Now, station search, directional departure cards, source links, station status and visible coverage. Raised 3D tracks, moving train positions, transfer routing, live arrivals, automatic disruption handling and LRT are deferred. Directional track fading is deferred until track segments can be reliably associated with scheduled services; the current whole-line geometry alone cannot support that claim.

## Existing application

- `explore.html` and `css/explore.css`: page layout, desktop sidebar and mobile bottom panel.
- `js/explore/app.js`: map lifecycle, food/MRT modes, search, details and URL state.
- `js/explore/core.mjs`: filtering, geographic validation and nearby ranking.
- `data/explore/`: food, stations, exits, six MRT line geometries and provenance metadata.
- No timetable or connected service graph exists today. Geographic proximity must not be used to infer timetable relationships.

## Interaction and layout

Place a keyboard-operable Last trains toggle beside the map controls. Enabling it shows rail lines and stations, hides food and exit markers, and replaces the directory panel with last-train controls. Keep the user's food/MRT mode, category (including Vegetarian), search, selected place and rail preference available for restoration. Keep the current camera when entering. On leaving, restore the prior explorer state and entry camera. Clicking Food places or MRT network while the toggle is active exits last-train mode and then applies that explicit selection.

Desktop layout: station search and departure cards in the current sidebar; a bottom timeline positioned clear of attribution and zoom controls. Mobile layout: use the existing collapsible bottom panel; keep timeline controls reachable when the panel is collapsed. A native date input, range input and labelled buttons are sufficient. No new UI framework is required.

The selected station displays one card per applicable line/destination service: line badge, destination, last scheduled departure, time remaining relative to the displayed time, service-day applicability, source link and source update/retrieval dates. Distinguish shorter terminating services when the operator publishes them. Never label one line-wide time as every station's last departure.

Search matches existing station names and codes. The station list initially ranks by proximity to the map centre, reusing the existing helper. Select a station from the list or map. The network lines retain their existing colours as geographic context. A station status ring is an aggregate of its applicable departure records, with exact direction details in the panel:

- Departure remaining: at least one known last departure is later than the displayed time. Partial coverage is explicitly labelled.
- Due now: a departure is in the displayed minute; no claim of boarding availability.
- Last departures passed: all expected applicable services are covered and their times have passed.
- Timetable unavailable/partial: missing or unverified applicable records. Never equate missing data with service ending.

Use text and distinct marker treatment as well as colour. Include a legend explaining that status is scheduled, not live. Avoid announcing the entire station list every playback tick. Respect reduced-motion preferences and never autoplay.

## Time and date semantics

All calculations use Asia/Singapore regardless of device timezone. A service date means the evening's operating date. The slider spans 21:00 on that date through 02:00 the following date, in one-minute increments; after-midnight labels include +1 day. If an imported, applicable extension exceeds 02:00, extend the upper bound to include it.

Store departures as integer minutes since the service date's midnight: 23:50 = 1430 and 00:20 next day = 1460. Do not compare formatted clock strings. At the exact departure minute show Due now; earlier is remaining and later is passed.

Now uses the actual Singapore time inside the evening window. Before the end of the after-midnight window it selects the preceding service date. Outside the evening window, show today's evening at 21:00 with an explicit Evening preview label rather than implying this is the current time. Manual date or slider changes pause playback and clearly show Preview. Playback advances one simulated minute per 250 ms, stops at the upper bound, and stops when leaving the mode or hiding the browser tab.

Date selection chooses the applicable published weekly schedule. Where public holidays or exceptional dates have different timings, apply only explicit supported calendar/override data. If applicable holiday handling cannot be established, show regular-schedule preview and mark the exception unverified. Never silently present an unverified holiday extension as an ordinary verified night.

## Data sources and coverage

Primary schedule sources:

- SBS Transit: https://www.sbstransit.com.sg/first-train-last-train
- SMRT station pages, for example: https://journey.smrt.com.sg/journey/station_info/bishan/first-and-last-train/

Research on 26 September 2026 confirmed that the SBS page exposes directional Downtown and North East line tables. The page labels these editions 28 February 2025 and 10 December 2024 respectively; retrieval date is not effective date. SMRT station-page retrieval and its exact table structure still need validation during implementation. The source may require browser inspection. Full six-line timetable coverage has not been established.

Target all six existing MRT lines. Begin ingestion with the accessible operator tables, then cover SMRT stations. Report exact station/service coverage in the UI and documentation. Missing records remain visible as unavailable; do not invent times, infer them from neighbouring stations, or use a generic midnight cutoff. Keep all geographic stations searchable even without schedules. Terminal destinations with no outbound service are not missing departures.

An explicit coverage manifest records the expected services per station, what was checked, and why a record is unavailable or not applicable. This prevents an incomplete import from incorrectly declaring an interchange closed. Source contradictions or ambiguous destination matching remain unresolved data entries, not guessed records.

Store normalized data in `data/explore/last-trains.json`, containing:

- schema version, timezone, retrieval time and source metadata;
- service ID, existing station ID, operator station code, line and destination;
- applicable weekdays/day class, effective dates when published, and exceptional-date overrides;
- departure minute and next-day semantics;
- source URL, source edition/update date, and verification/coverage status.

Join by exact operator station codes, including interchange codes. Reject unknown mappings for review rather than matching by nearest coordinate or fuzzy name. A dash in a table means no listed service for that destination; preserve that distinction from parsing failure. Use only HTTPS source links from the supported operator domains.

Provide a repeatable importer using the existing Python environment and recorded source inputs. Validate the complete output before replacing a working snapshot. Keep a small representative parser fixture for merged table headers, day columns, 12am and no-service cells. Do not fetch operator pages from visitors' browsers. A manual checked-in snapshot with source provenance is acceptable when a source cannot be reliably imported; document the refresh procedure and coverage.

## Implementation boundaries

Add one small `js/explore/last-trains.mjs` module for dataset validation, schedule selection, Singapore service-day calculations and station status. Keep MapLibre rendering and mode transitions in the existing app module. Add focused Node assertions for this logic, and importer assertions where parsing warrants them. Reuse existing DOM helpers, station search and MapLibre layers. No new runtime dependencies, backend, account or API key are planned.

Load the timetable on first activation and reuse it in memory. Timetable load failure leaves the normal explorer functional and shows a retry control. Basemap failure still permits station search and timetable details. Invalid records must not produce countdowns.

Extend existing share URLs with `last=1`, `serviceDate=YYYY-MM-DD`, `minute=<integer>` and `lastStation=<station-id>`, preserving existing explorer parameters. Serialize a paused snapshot, never autoplay. Validate dates, bounds and station identifiers; invalid parameters fall back to a clearly labelled evening preview. On a direct shared URL the preserved explorer parameters are the state restored when the toggle is disabled.

## Acceptance checks

1. Vegetarian search/category, selection, camera and rail preference survive an on/off cycle; explicit mode-button clicks remain predictable.
2. Station cards show separately sourced times for both directions and any published short-turn destination; interchange records remain separate.
3. Tests cover 11:59pm, 12:00am, next-day departures, due-now boundaries, Singapore timezone on a differently configured device, weekday/holiday applicability and missing/partial schedules.
4. Shared URLs restore service date, time and station in paused mode. Invalid parameters cannot crash the page or create false status.
5. Known source rows match normalized values. Duplicate services, unknown codes, malformed times and changed table layouts fail validation before replacing data.
6. The map never marks a station's departures all passed when required coverage is incomplete. Whole lines do not fade based on a single station's time.
7. Desktop and mobile controls do not overlap attribution or each other. Keyboard navigation, visible focus, reduced motion and pause controls work.
8. Network/data failures are explicit and the existing food/MRT explorer remains usable. Existing explorer and importer checks still pass.
9. Release notes state actual timetable coverage and source editions. No live-tracking, transfer-feasibility or exhaustive-current-coverage claim is made.

## Review and next step

This specification implements the approved first-release concept. Its conservative station-level visual status is deliberate because the existing geometry does not encode per-direction train movements. Review this document before the implementation plan is written. The next stage is a file-level plan with data acquisition, parsing checks, time logic, UI integration and browser verification, followed by implementation after that plan is approved.
