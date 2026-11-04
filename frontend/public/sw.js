// Zil service worker: offline street map only. After "Save offline", the whole Mauritius
// PMTiles file and the label fonts sit in Cache Storage; this answers the map's HTTP range
// requests from that copy, so street-level zoom works with no signal (beaches, hikes, boats).
// Everything else goes straight to the network as usual.
const CACHE = 'zil-tiles-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const path = new URL(e.request.url).pathname;
  if (path.endsWith('/tiles/mauritius.pmtiles')) e.respondWith(tiles(e.request));
  else if (path.includes('/tiles/fonts/')) e.respondWith(cacheFirst(e.request));
});

async function tiles(req) {
  const hit = await (await caches.open(CACHE)).match(req.url, { ignoreVary: true, ignoreSearch: true });
  if (!hit) return fetch(req);
  const blob = await hit.blob(), size = blob.size, range = req.headers.get('range');
  const m = range && /bytes=(\d+)-(\d*)/.exec(range);
  if (!m) return new Response(blob, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
  const start = +m[1], end = m[2] ? Math.min(+m[2], size - 1) : size - 1;
  if (start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' }
  });
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE), hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
