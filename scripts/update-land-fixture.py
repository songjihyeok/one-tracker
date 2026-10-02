"""Regenerate the offline land fixture; optional authoring dependency: shapely==2.1.2.

Usage: python3 -m venv /tmp/one-routes && /tmp/one-routes/bin/pip install shapely==2.1.2
       /tmp/one-routes/bin/python scripts/update-land-fixture.py
Normal npm tests use the checked-in gzip and do not need Python or the network.
"""
import gzip
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

from shapely.geometry import box, mapping, shape
from shapely.strtree import STRtree

REVISION = "ace5fed0eaf3c6c03c951e75b439ba8fffbc218e"
SOURCE = f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{REVISION}/geojson/ne_10m_land.geojson"
GRID_DEGREES = 5
OUTPUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures"

raw = urlopen(SOURCE, timeout=60).read()
original = json.loads(raw)
polygons = []
for feature in original["features"]:
    geometry = shape(feature["geometry"])
    polygons.extend(geometry.geoms if geometry.geom_type == "MultiPolygon" else [geometry])
index = STRtree(polygons)
features = []
for longitude in range(-180, 180, GRID_DEGREES):
    for latitude in range(-90, 90, GRID_DEGREES):
        cell = box(longitude, latitude, longitude + GRID_DEGREES, latitude + GRID_DEGREES)
        coordinates = []
        for polygon_index in index.query(cell, predicate="intersects"):
            clipped = polygons[polygon_index].intersection(cell)
            pieces = list(clipped.geoms) if hasattr(clipped, "geoms") else [clipped]
            coordinates.extend(mapping(piece)["coordinates"] for piece in pieces if piece.geom_type == "Polygon" and not piece.is_empty)
        if coordinates:
            features.append({"type": "Feature", "properties": {"x": longitude // GRID_DEGREES, "y": latitude // GRID_DEGREES}, "geometry": {"type": "MultiPolygon", "coordinates": coordinates}})

result = json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")).encode()
OUTPUT.mkdir(parents=True, exist_ok=True)
compressed = gzip.compress(result, compresslevel=9, mtime=0)
(OUTPUT / "ne10m-land-grid.geojson.gz").write_bytes(compressed)
manifest = {
    "name": "Natural Earth 1:10m land",
    "sourceUrl": SOURCE,
    "revision": REVISION,
    "sourceSha256": hashlib.sha256(raw).hexdigest(),
    "fixtureSha256": hashlib.sha256(compressed).hexdigest(),
    "license": "Public domain",
    "licenseUrl": "https://www.naturalearthdata.com/about/terms-of-use/",
    "descriptionUrl": "https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/",
    "transform": "Global land polygons intersected with 5-degree cells using Shapely. No coastline simplification, smoothing, or vertex rounding. Gzip mtime=0.",
    "gridDegrees": GRID_DEGREES,
    "sourcePolygons": len(polygons),
    "landCells": len(features),
}
(OUTPUT / "ne10m-land-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Wrote {len(features)} global land cells from {len(polygons)} polygons ({len(compressed):,} gzip bytes).")
