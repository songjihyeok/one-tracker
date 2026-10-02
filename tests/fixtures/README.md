# Coastline validation data

`ne10m-land-grid.geojson.gz` is derived from **Natural Earth 1:10m land**, in the public domain. The exact upstream revision, source checksum, fixture checksum, and license URL are in `ne10m-land-manifest.json`.

The fixture contains **global land**, partitioned into five-degree cells for fast tests. Partitioning clips the original polygons at cell boundaries without simplifying, smoothing, or rounding their coastlines. It is not a selection of only the currently passing corridors. `scripts/update-land-fixture.py` reproduces the download and transformation. Ordinary `npm test` is entirely offline and requires neither Python nor Shapely.

Route tests check every complete polyline segment for intersection with land and densely sample animation positions against the polygons. All port endpoints are offshore approaches: Yangshan for Shanghai and the outer Elbe for Hamburg; none represent a berth or a navigated river passage. Long Asia–Europe passages use the Cape of Good Hope, and Singapore–Colombo uses the Singapore and Malacca straits.

Natural Earth is a generalized **1:10,000,000 map**, not a nautical chart. Passing these tests means the illustrative route avoids land represented in this dataset; it does not establish water depth, traffic separation compliance, permission, tide/current conditions, or clearance from every real-world reef/islet. These tracks are for the visual simulation only, not voyage planning or navigation.

Sources: [Natural Earth land](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/), [public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/).
