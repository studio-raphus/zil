# OSRM road-routing engine with the Mauritius road network baked in at build time.
# Rebuild to refresh the map data: docker compose build --no-cache osrm
ARG OSRM_IMAGE=ghcr.io/project-osrm/osrm-backend:v6.0.0

FROM alpine:3.20 AS pbf
ARG PBF_URL=https://download.geofabrik.de/africa/mauritius-latest.osm.pbf
RUN wget -q -O /mauritius.osm.pbf "$PBF_URL"

FROM ${OSRM_IMAGE}
COPY --from=pbf /mauritius.osm.pbf /data/mauritius.osm.pbf
# car profile; MLD pipeline (extract -> partition -> customize)
RUN osrm-extract -p /opt/car.lua /data/mauritius.osm.pbf \
 && osrm-partition /data/mauritius.osrm \
 && osrm-customize /data/mauritius.osrm \
 && rm /data/mauritius.osm.pbf
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "--max-viaroute-size", "25", "/data/mauritius.osrm"]
