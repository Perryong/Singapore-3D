# Singapore District Atlas

Visit `/atlas/` or `/atlas/#gardens-by-the-bay`.

A no-build, static companion to the existing seven-layer 3D Singapore urban analysis. The district switcher includes Marina Bay, Chinatown, Orchard Road and Gardens by the Bay, with editorial SVG diagrams, site observations and location links.

## Accuracy

The checked-in SVG illustrations are **stylised placeholder diagrams**, not the previously AI-generated atlas PNG posters and not verified geospatial geometry. Their symbols, road arrangements and building shapes are conceptual, with no metric scale. Do not present them as GIS analysis.

To replace an illustration, update the matching `atlas/images/<district-id>.svg` file or modify `atlas/app.js` to load an attributed, verified raster or vector export.

## Integration

The poster header links to `./atlas/`, and SG-kopitiam-lab links to the deployed atlas. Both sites remain independent static GitHub Pages projects. No changes were made to the existing 3D rendering engine, urban data or kopitiam drink scenes.

## Local preview

```sh
python -m http.server 8000
```

Then open `http://localhost:8000/atlas/`. Validate navigation, deep links and responsive layout before merging.
