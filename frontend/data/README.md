# uk-constituencies-2024.json

Real constituency geometry asset for the Arcet GIS canvas (Real GIS Phase 1a).

## Data source

**ONS Westminster Parliamentary Constituencies (July 2024) Boundaries UK BUC**
— Ultra Generalised (500m), clipped to the coastline (Mean High Water Mark).

- Publisher: Office for National Statistics, Open Geography Portal
- Feature service: `https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC/FeatureServer/0`
- Licence: Open Government Licence v3. Contains both Ordnance Survey and ONS
  Intellectual Property Rights.

Raw download is cached at `data/source/PCON_JULY_2024_UK_BUC.geojson`.

## How the asset was generated

`scripts/prep-constituencies.py` (Python 3, standard library only):

1. Downloads the source GeoJSON from the ONS feature service (paged), or reuses
   the cached copy in `data/source/`.
2. Projects WGS84 lon/lat into the frontend SVG viewBox `0 0 1200 760`
   (equirectangular with cos(mid-latitude) x-correction, aspect-preserving fit,
   y inverted for SVG).
3. Simplifies rings with Douglas–Peucker (0.35 px tolerance), rounds
   coordinates to 1 decimal, drops degenerate rings.
4. Validates: 650 features, every feature has a GSS `code` + `name`, no empty
   geometries, extents inside the viewBox, and all codes cross-checked against
   `data/HoC-GE2024-results-by-constituency.xlsx` (650/650 match).

## Join key

`properties.code` — the **GSS/ONS Westminster constituency code**
(`PCON24CD`, e.g. `E14001063`). `properties.name` is display-only.
The same codes appear as `ONS ID` in the HoC GE2024 results workbook.

## File format

```json
{
  "type": "FeatureCollection",
  "meta": {
    "source": "ONS Westminster Parliamentary Constituencies July 2024",
    "viewBox": "0 0 1200 760",
    "projection": "pre-projected",
    "featureCount": 650
  },
  "features": [
    {
      "type": "Feature",
      "properties": { "code": "E14001063", "name": "Aldershot" },
      "geometry": { "type": "Polygon" | "MultiPolygon", "coordinates": [...] }
    }
  ]
}
```

Coordinates are **already in SVG pixel space** — the frontend converts each
feature straight to a `<path d>` with no projection math or map library at
runtime.

## How to regenerate

```
python scripts/prep-constituencies.py
```

Delete `data/source/PCON_JULY_2024_UK_BUC.geojson` first to force a fresh
download from the ONS service. The script aborts (non-zero exit) if any
validation check fails; the asset is only written after validation passes.
