// Catalog service: categories, curated places and events (public reads + Studio writes in admin.js).
import { query } from './db.js';
import admin from './admin.js';

const placeCols = `id, name, short, cat, lat, lon, time_needed AS time, best_time AS best, cost, blurb, fact, tips, tags, translations`;

function localise(row, lang) {
  const t = lang && row.translations && row.translations[lang];
  const out = { ...row, ...(t || {}) };
  delete out.translations;
  return out;
}

export default async function routes(app) {
  await app.register(admin);
  app.get('/categories', async (req, reply) => {
    reply.header('Cache-Control', 'public, max-age=300');
    const { rows } = await query('SELECT id, label, one, color, icon FROM categories ORDER BY sort_order');
    return rows;
  });

  app.get('/places', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          cat: { type: 'string', maxLength: 40 },
          q: { type: 'string', maxLength: 80 },
          bbox: { type: 'string', pattern: '^-?\\d+(\\.\\d+)?(,-?\\d+(\\.\\d+)?){3}$' },
          lang: { type: 'string', maxLength: 5 }
        }
      }
    }
  }, async (req, reply) => {
    const { cat, q, bbox, lang } = req.query;
    const where = ['published'];
    const params = [];
    if (cat) { params.push(cat); where.push(`cat = $${params.length}`); }
    if (q) { params.push(`%${q}%`); where.push(`(name ILIKE $${params.length} OR tags ILIKE $${params.length})`); }
    if (bbox) {
      const [w, s, e, n] = bbox.split(',').map(Number);
      params.push(w, s, e, n);
      const k = params.length;
      where.push(`ST_Intersects(geom, ST_MakeEnvelope($${k - 3}, $${k - 2}, $${k - 1}, $${k}, 4326)::geography)`);
    }
    reply.header('Cache-Control', 'public, max-age=60');
    const { rows } = await query(`SELECT ${placeCols} FROM places WHERE ${where.join(' AND ')} ORDER BY sort_order`, params);
    return rows.map(r => localise(r, lang));
  });

  app.get('/places/:id', async (req, reply) => {
    const { rows } = await query(`SELECT ${placeCols} FROM places WHERE id = $1 AND published`, [req.params.id]);
    if (!rows.length) return reply.code(404).send({ error: 'not_found', message: 'No such place' });
    return localise(rows[0], req.query.lang);
  });

  app.get('/places/near', {
    schema: { querystring: { type: 'object', required: ['lat', 'lon'], properties: { lat: { type: 'number' }, lon: { type: 'number' }, km: { type: 'number', maximum: 100, default: 10 } } } }
  }, async (req) => {
    const { lat, lon, km } = req.query;
    const { rows } = await query(
      `SELECT ${placeCols}, round(ST_Distance(geom, ST_MakePoint($2,$1)::geography)) AS distance_m
       FROM places WHERE published AND ST_DWithin(geom, ST_MakePoint($2,$1)::geography, $3 * 1000)
       ORDER BY distance_m LIMIT 20`, [lat, lon, km]);
    return rows.map(r => localise(r, req.query.lang));
  });
}
