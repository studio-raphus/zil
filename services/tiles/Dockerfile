# Street-level map tiles for Mauritius: one PMTiles file + label fonts, served by nginx with
# HTTP range requests (the app reads only the bytes it needs). Built once; rebuild to refresh:
#   docker compose build --no-cache tiles
FROM alpine:3.20 AS data
# pmtiles CLI: the official release binary for this machine's CPU (Intel or Apple Silicon)
ARG PMTILES_CLI_VERSION=1.25.0
ARG TARGETARCH
RUN arch=$([ "$TARGETARCH" = "arm64" ] && echo arm64 || echo x86_64) \
 && wget -q -O /tmp/pmtiles.tgz "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_CLI_VERSION}/go-pmtiles_${PMTILES_CLI_VERSION}_Linux_${arch}.tar.gz" \
 && tar -xzf /tmp/pmtiles.tgz -C /usr/local/bin pmtiles && rm /tmp/pmtiles.tgz && pmtiles version
# Optional: a specific Protomaps build URL; by default the newest daily build is used.
ARG PMTILES_SOURCE=
# Main island + nearby islets (west,south,east,north); zoom 15 is street level.
ARG BBOX=57.25,-20.55,57.85,-19.92
ARG MAXZOOM=15
COPY fetch.sh /fetch.sh
RUN PMTILES_SOURCE="$PMTILES_SOURCE" BBOX="$BBOX" MAXZOOM="$MAXZOOM" sh /fetch.sh

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=data /out /usr/share/nginx/html
RUN rm -f /usr/share/nginx/html/index.html /usr/share/nginx/html/50x.html && chmod -R a+rX /usr/share/nginx/html /etc/nginx/conf.d
EXPOSE 80
