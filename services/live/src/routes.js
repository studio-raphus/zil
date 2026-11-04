// Live service: per-place status lines ("Dolphins seen 7:40 am"), a feed, and a
// Server-Sent Events stream. Updates fan out across replicas via Postgres LISTEN/NOTIFY,
// so the service scales horizontally without a separate message broker.
import { pool, query } from './db.js';
import { requireRole, staffLabel } from './staff.js';
import { fcmConfigured, sendToAll } from './fcm.js';

const CHANNEL = 'zil_live';
const clients = new Set();


async function listen(log) {
  const c = await pool.connect();
  await c.query(`LISTEN ${CHANNEL}`);
  c.on('notification', (msg) => {
    for (const res of clients) res.write(`event: status\ndata: ${msg.payload}\n\n`);
  });
  c.on('error', (e) => { log.error(e, 'listener lost, retrying'); c.release(true); setTimeout(() => listen(log).catch(() => {}), 2000); });
}

export default async function routes(app) {
  app.addHook('onReady', async () => { await listen(app.log); });

  app.get('/status', async () => {
    const { rows } = await query('SELECT place_id, text, hot, updated_at FROM live_status');
    return rows;
  });

  app.get('/feed', { schema: { querystring: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 50, default: 12 } } } } }, async (req) => {
    const { rows } = await query('SELECT id, place_id, text, created_at FROM live_feed ORDER BY created_at DESC LIMIT $1', [req.query.limit]);
    return rows;
  });

  app.get('/stream', (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': req.headers.origin || '*'
    });
    res.write('retry: 5000\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => { clearInterval(ping); clients.delete(res); });
  });

  // Ops update from Zil Studio (editor/admin account) or a script with the admin token.
  app.post('/status', {
    onRequest: requireRole('editor', 'admin'),
    schema: {
      body: {
        type: 'object', required: ['place_id', 'text'], additionalProperties: false,
        properties: { place_id: { type: 'string', maxLength: 40 }, text: { type: 'string', minLength: 1, maxLength: 60 }, hot: { type: 'boolean' } }
      }
    }
  }, async (req, reply) => {
    const { place_id, text, hot = false } = req.body;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const { rows: [row] } = await c.query(
        `INSERT INTO live_status (place_id, text, hot) VALUES ($1,$2,$3)
         ON CONFLICT (place_id) DO UPDATE SET text = EXCLUDED.text, hot = EXCLUDED.hot, updated_at = now()
         RETURNING place_id, text, hot, updated_at`, [place_id, text, hot]);
      await c.query('INSERT INTO live_feed (place_id, text) VALUES ($1,$2)', [place_id, text]);
      await c.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify(row)]);
      await c.query('COMMIT');
      req.log.info({ by: staffLabel(req), place_id }, 'live status posted');
      return reply.code(201).send(row);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  });

  // Clear a place's status line; open apps drop the badge (an empty text means "cleared").
  app.delete('/status/:place_id', { onRequest: requireRole('editor', 'admin') }, async (req, reply) => {
    const { rowCount } = await query('DELETE FROM live_status WHERE place_id = $1', [req.params.place_id]);
    if (!rowCount) return reply.code(404).send({ error: 'not_found', message: 'No live status for this place' });
    await query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify({ place_id: req.params.place_id, text: '', hot: false, updated_at: new Date().toISOString() })]);
    req.log.info({ by: staffLabel(req), place_id: req.params.place_id }, 'live status cleared');
    return reply.code(204).send();
  });

  // ---------- push notifications ----------
  // The app registers its FCM token after the user allows notifications (no account needed).
  app.post('/push/devices', {
    schema: { body: { type: 'object', required: ['token'], additionalProperties: false, properties: { token: { type: 'string', minLength: 20, maxLength: 4096 }, platform: { type: 'string', enum: ['android', 'ios', 'web'] } } } }
  }, async (req, reply) => {
    await query(`INSERT INTO push_devices (token, platform) VALUES ($1, $2)
      ON CONFLICT (token) DO UPDATE SET last_seen = now()`, [req.body.token, req.body.platform || 'android']);
    return reply.code(204).send();
  });
  app.delete('/push/devices', { schema: { body: { type: 'object', required: ['token'], properties: { token: { type: 'string', maxLength: 4096 } } } } }, async (req, reply) => {
    await query('DELETE FROM push_devices WHERE token = $1', [req.body.token]);
    return reply.code(204).send();
  });

  // Studio: how many devices, recent sends, and whether FCM is set up.
  app.get('/push', { onRequest: requireRole('editor', 'admin') }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM push_devices');
    const { rows: log } = await query('SELECT id, title, body, place_id, sent_by, sent, failed, created_at FROM push_log ORDER BY created_at DESC LIMIT 10');
    return { configured: fcmConfigured(), devices: n, log };
  });

  app.post('/push/send', {
    onRequest: requireRole('editor', 'admin'),
    schema: { body: { type: 'object', required: ['title', 'body'], additionalProperties: false, properties: { title: { type: 'string', minLength: 1, maxLength: 60 }, body: { type: 'string', minLength: 1, maxLength: 180 }, place_id: { type: 'string', maxLength: 40 } } } }
  }, async (req, reply) => {
    if (!fcmConfigured()) return reply.code(503).send({ error: 'unavailable', message: 'Push isn’t set up: add the Firebase service account (FCM_SERVICE_ACCOUNT_FILE)' });
    const { title, body, place_id } = req.body;
    const { rows } = await query('SELECT token FROM push_devices');
    const r = rows.length ? await sendToAll(rows.map(x => x.token), { title, body, data: place_id ? { place_id } : {} }) : { sent: 0, failed: 0, dead: [] };
    if (r.dead.length) await query('DELETE FROM push_devices WHERE token = ANY($1)', [r.dead]);
    await query('INSERT INTO push_log (title, body, place_id, sent_by, sent, failed) VALUES ($1,$2,$3,$4,$5,$6)', [title, body, place_id || null, staffLabel(req), r.sent, r.failed]);
    req.log.info({ by: staffLabel(req), sent: r.sent, failed: r.failed, removed: r.dead.length }, 'push sent');
    return { sent: r.sent, failed: r.failed, removed: r.dead.length };
  });
}
