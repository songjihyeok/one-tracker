# Land fallback

`land.geojson` is Natural Earth's 1:110m land dataset, used only as a low-detail visual fallback beneath satellite imagery.

- Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson
- Dataset: https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-land/
- License: public domain, https://www.naturalearthdata.com/about/terms-of-use/

The fallback geometry is not the coastline used for maritime route validation. Routing tests use the more detailed 1:10m fixture separately.
