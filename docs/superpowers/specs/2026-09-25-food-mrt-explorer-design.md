# Singapore food and MRT explorer

User-approved direction: add a separate map-led page inspired by Nemo and RailRouter, covering food broadly and transport through MRT. User requested proceeding with the application.

## Experience
`explore.html` opens a full-screen dark geographic map, with warm orange food markers, coloured rail lines and readable station labels. A desktop sidebar becomes a compact bottom panel on mobile. Search finds food names, cuisines, addresses, station names and codes. Category filters select hawker centres, restaurants, cafés and other mapped food outlets. Selecting a food place shows recorded details and the three closest MRT stations by straight-line distance. Selecting a station shows its lines and nearby food places. The rail overlay can be switched off. Map view and selection are shareable through the URL. A homepage link exposes the new page.

## Architecture and data
Keep the existing static ES module / GitHub Pages architecture. Use a pinned MapLibre CDN module and OpenFreeMap basemap; normal HTML controls provide keyboard access. No React migration or runtime backend. Check in normalized food and rail snapshots with source attribution and dates; use NEA hawker data and OpenStreetMap food and rail data. Do not claim exhaustive coverage, live opening status, ratings, journey times or current service availability. Show opening-hours text only when recorded.

External data is validated and rendered as text. Invalid coordinates and unnamed food entries are excluded. Failed map tiles must not disable the searchable directory. Empty results and data failures get visible explanations and retry controls. Respect reduced motion and provide visible focus, labelled controls, accessible results and adequate contrast.

## Verification
Use Node's assertion library for filtering, station code search, distance ranking, URL bounds and data validation. Validate the committed snapshots. Exercise the real browser at desktop and mobile sizes: search, category selection, station/food detail, overlay toggle, reset and shared URL. Check map rendering and console errors. Existing pages remain intact.

## Scope
No live train feed, turn-by-turn routing, accounts, reviews or fabricated food records. Public source coverage defines the first release's directory.
