// Spots service: community-added places. New spots are private to their creator until a
// moderator approves them. Phase 1 identifies owners by an anonymous device id header.
import { query } from './db.js';

const CATS = (process.env.ALLOWED_CATEGORIES || 'beach,nature,culture,food,adventure').split(',');
// Mauritius main island + nearby islets
const BOUNDS = { minLat: -20.6, maxLat: -19.85, minLon: 57.25, maxLon: 57.9 };
const MAX_PER_DEVICE_PER_DAY = Number(process.env.MAX_SPOTS_PER_DAY || 20);

const cols = 'id, name, cat, note, lat, lon, status, created_at';

function deviceId(req) {
  const id = req.headers['x-device-id'];
  return typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : null;
}
function isAdmin(req) {
  const token = process.env.ADMIN_TOKEN;
  return !!token && req.headers.authorization === `Bearer ${token}`;
}

export default async function routes(app) {
  // Approved spots for everyone, plus the caller's own pending/rejected ones.
  app.get('/spots', async (req) => {
    const dev = deviceId(req);
    const { rows } = await query(
      `SELECT ${cols}, (device_id = $1) AS mine FROM spots
       WHERE status = 'approved' OR device_id = $1 ORDER BY created_at DESC LIMIT 500`, [dev || '']);
    return rows;
  });

  app.post('/spots', {
    schema: {
      body: {
        type: 'object', required: ['name', 'cat', 'lat', 'lon'], additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 40 },
          cat: { type: 'string', enum: CATS },
          note: { type: 'string', maxLength: 200 },
          lat: { type: 'number', minimum: BOUNDS.minLat, maximum: BOUNDS.maxLat },
          lon: { type: 'number', minimum: BOUNDS.minLon, maximum: BOUNDS.maxLon }
        }
      }
    }
  }, async (req, reply) => {
    const dev = deviceId(req);
    if (!dev) return reply.code(400).send({ error: 'device_id_required', message: 'Send an X-Device-Id header' });
    const { rows: [{ n }] } = await query(`SELECT count(*)::int AS n FROM spots WHERE device_id = $1 AND created_at > now() - interval '1 day'`, [dev]);
    if (n >= MAX_PER_DEVICE_PER_DAY) return reply.code(429).send({ error: 'too_many', message: 'Daily limit for new spots reached' });
    const { name, cat, note = '', lat, lon } = req.body;
    const { rows } = await query(
      `INSERT INTO spots (device_id, name, cat, note, lat, lon) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${cols}, true AS mine`,
      [dev, name.trim(), cat, note.trim(), lat, lon]);
    return reply.code(201).send(rows[0]);
  });

  app.delete('/spots/:id', { schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } } }, async (req, reply) => {
    const dev = deviceId(req);
    const { rowCount } = await query('DELETE FROM spots WHERE id = $1 AND (device_id = $2 OR $3)', [req.params.id, dev || '', isAdmin(req)]);
    if (!rowCount) return reply.code(404).send({ error: 'not_found', message: 'Spot not found or not yours' });
    return reply.code(204).send();
  });

  // Moderation (admin token). Phase 1 has no admin UI; use curl or a small internal tool.
  app.get('/moderation/queue', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(401).send({ error: 'unauthorized', message: 'Admin token required' });
    const { rows } = await query(`SELECT ${cols}, device_id FROM spots WHERE status = 'pending' ORDER BY created_at LIMIT 200`);
    return rows;
  });

  app.patch('/spots/:id/status', {
    schema: { body: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['approved', 'rejected', 'pending'] } } } }
  }, async (req, reply) => {
    if (!isAdmin(req)) return reply.code(401).send({ error: 'unauthorized', message: 'Admin token required' });
    const { rows } = await query(`UPDATE spots SET status = $2, reviewed_at = now() WHERE id = $1 RETURNING ${cols}`, [req.params.id, req.body.status]);
    if (!rows.length) return reply.code(404).send({ error: 'not_found', message: 'No such spot' });
    return rows[0];
  });
}
