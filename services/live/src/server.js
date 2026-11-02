// Service bootstrap, identical in every Zil service: config from env, CORS, health probes,
// migrations, versioned routes, graceful shutdown. Only ./routes.js differs per service.
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import routes from './routes.js';

const SERVICE = process.env.SERVICE_NAME || 'service';
const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info', base: { service: SERVICE } }, trustProxy: true });

const origins = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim());
await app.register(cors, { origin: origins.includes('*') ? true : origins });

app.get('/health', async () => ({ status: 'ok', service: SERVICE }));
app.get('/ready', async (req, reply) => {
  try { await pool.query('SELECT 1'); return { status: 'ready' }; }
  catch (e) { return reply.code(503).send({ status: 'db-unavailable' }); }
});

app.setErrorHandler((err, req, reply) => {
  const code = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
  if (code === 500) req.log.error(err);
  reply.code(code).send({ error: code === 500 ? 'internal_error' : err.code || 'bad_request', message: code === 500 ? 'Something went wrong' : err.message });
});

await app.register(routes, { prefix: '/v1' });

if (process.env.SKIP_MIGRATIONS !== 'true') await migrate(app.log);

const port = Number(process.env.PORT || 3000);
await app.listen({ port, host: '0.0.0.0' });

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    app.log.info(`${sig} received, shutting down`);
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
