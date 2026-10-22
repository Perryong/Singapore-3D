# Singapore district atlas

The static atlas page is `/atlas/`. It is an optional editorial companion to the existing poster and interactive seven-layer 3D scene; no Three.js code or urban data has been replaced.

The illustrations are conceptual image-generation outputs, not measured GIS diagrams. They must not be used for geospatial measurements. The original PNGs may contain AI-rendered labels and approximated map features.

## Images

Place the generated illustrations at:
- `atlas/images/marina-bay.png`
- `atlas/images/chinatown.png`
- `atlas/images/orchard-road.png`
- `atlas/images/gardens-by-the-bay.png`

The page uses the assets when available. Missing images are handled by the browser's standard broken-image behaviour; see PR notes until the visual assets are added.

Visit `/atlas/#gardens-by-the-bay` to deep link.

## Suggested next improvement

Replace the concept poster with verified GIS-derived footprints, scales and heatmaps, keeping illustration as an editorial overlay. Add new district records in `atlas/app.js`.
