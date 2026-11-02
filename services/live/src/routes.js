// Live service: per-place status lines ("Dolphins seen 7:40 am"), a feed, and a
// Server-Sent Events stream. Updates fan out across replicas via Postgres LISTEN/NOTIFY,
// so the service scales horizontally without a separate message broker.
import { pool, query } from './db.js';

const CHANNEL = 'zil_live';
const clients = new Set();

function isAdmin(req) {
  const token = process.env.ADMIN_TOKEN;
  return !!token && req.headers.authorization === `Bearer ${token}`;
}

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

  // Ops / partner update (admin token). Phase 2: operators post their own updates.
  app.post('/status', {
    schema: {
      body: {
        type: 'object', required: ['place_id', 'text'], additionalProperties: false,
        properties: { place_id: { type: 'string', maxLength: 40 }, text: { type: 'string', minLength: 1, maxLength: 60 }, hot: { type: 'boolean' } }
      }
    }
  }, async (req, reply) => {
    if (!isAdmin(req)) return reply.code(401).send({ error: 'unauthorized', message: 'Admin token required' });
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
      return reply.code(201).send(row);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  });
}
