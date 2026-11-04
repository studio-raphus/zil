// Routing service: Zil's own contract in front of the OSRM engine, so the engine can be
// swapped (Valhalla, OpenRouteService, GraphHopper...) without touching the apps.
// No database: config from env, health probes, versioned routes, graceful shutdown.
import Fastify from 'fastify';
import cors from '@fastify/cors';

const SERVICE = process.env.SERVICE_NAME || 'routing';
const OSRM = (process.env.OSRM_URL || 'http://osrm:5000').replace(/\/$/, '');
const PROFILE = process.env.OSRM_PROFILE || 'driving';
// Mauritius main island + nearby islets (same bounds as the spots service)
const B = { minLat: -20.6, maxLat: -19.85, minLon: 57.25, maxLon: 57.9 };
const CACHE_MAX = Number(process.env.ROUTE_CACHE_SIZE || 1000);

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info', base: { service: SERVICE } }, trustProxy: true });
const origins = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim());
await app.register(cors, { origin: origins.includes('*') ? true : origins });

async function osrm(path) {
  const res = await fetch(`${OSRM}${path}`, { signal: AbortSignal.timeout(5000) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

app.get('/health', async () => ({ status: 'ok', service: SERVICE }));
app.get('/ready', async (req, reply) => {
  try {
    const { body } = await osrm(`/nearest/v1/${PROFILE}/57.5,-20.25`);
    if (body.code === 'Ok') return { status: 'ready' };
  } catch { /* fall through */ }
  return reply.code(503).send({ status: 'osrm-unavailable' });
});

app.setErrorHandler((err, req, reply) => {
  const code = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
  if (code === 500) req.log.error(err);
  reply.code(code).send({ error: code === 500 ? 'internal_error' : err.code || 'bad_request', message: code === 500 ? 'Something went wrong' : err.message });
});

// Tiny LRU so popular routes (hotel -> beach) don't hit OSRM every time.
const cache = new Map();
const remember = (k, v) => { cache.delete(k); cache.set(k, v); if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); return v; };

const POINT = '^-?\\d{1,2}(\\.\\d+)?,-?\\d{1,3}(\\.\\d+)?$';
function parsePoint(s, name) {
  const [lat, lon] = s.split(',').map(Number);
  if (lat < B.minLat || lat > B.maxLat || lon < B.minLon || lon > B.maxLon) {
    const e = new Error(`${name} must be in Mauritius`); e.statusCode = 422; e.code = 'out_of_area'; throw e;
  }
  return [lat, lon];
}
const r5 = n => Math.round(n * 1e5) / 1e5;
const km = (a, b) => { // haversine, [lat,lon]
  const R = 6371, dLa = (b[0] - a[0]) * Math.PI / 180, dLo = (b[1] - a[1]) * Math.PI / 180;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

app.register(async v1 => {
  // GET /v1/route?from=lat,lon&to=lat,lon -> road route along real roads
  v1.get('/route', {
    schema: { querystring: { type: 'object', required: ['from', 'to'], properties: { from: { type: 'string', pattern: POINT }, to: { type: 'string', pattern: POINT } } } }
  }, async (req, reply) => {
    const from = parsePoint(req.query.from, 'from'), to = parsePoint(req.query.to, 'to');
    const key = [...from, ...to].map(n => n.toFixed(4)).join(',');
    reply.header('Cache-Control', 'public, max-age=300');
    if (cache.has(key)) return remember(key, cache.get(key));

    const { status, body } = await osrm(`/route/v1/${PROFILE}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=false&alternatives=false`);
    if (body.code === 'NoRoute' || body.code === 'NoSegment') return reply.code(404).send({ error: 'no_route', message: 'No road route between these points' });
    if (status !== 200 || body.code !== 'Ok' || !body.routes?.length) {
      req.log.warn({ status, code: body.code }, 'osrm error');
      return reply.code(502).send({ error: 'routing_unavailable', message: 'Routing engine unavailable' });
    }
    const r = body.routes[0];
    const coords = r.geometry.coordinates.map(([lon, lat]) => [r5(lat), r5(lon)]);
    const snapFrom = [r5(body.waypoints[0].location[1]), r5(body.waypoints[0].location[0])];
    const snapTo = [r5(body.waypoints[1].location[1]), r5(body.waypoints[1].location[0])];
    return remember(key, {
      distance_m: Math.round(r.distance),
      duration_s: Math.round(r.duration),
      coords,
      // how far the start/end are from the nearest road (e.g. a beach or an islet reached by boat)
      offroad_m: { from: Math.round(km(from, snapFrom) * 1000), to: Math.round(km(to, snapTo) * 1000) },
      engine: 'osrm'
    });
  });
}, { prefix: '/v1' });

const port = Number(process.env.PORT || 3000);
await app.listen({ port, host: '0.0.0.0' });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { await app.close(); process.exit(0); });
