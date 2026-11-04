// Studio write API for the catalog (places + events), and the public events feed.
// Writes need a Studio editor/admin (see staff.js); everything is versioned under /v1.
import { query } from './db.js';
import { requireRole, staffLabel } from './staff.js';

const BOUNDS = { minLat: -20.6, maxLat: -19.85, minLon: 57.25, maxLon: 57.9 };
const lat = { type: 'number', minimum: BOUNDS.minLat, maximum: BOUNDS.maxLat };
const lon = { type: 'number', minimum: BOUNDS.minLon, maximum: BOUNDS.maxLon };
const str = n => ({ type: 'string', maxLength: n });
const tr = { type: 'object', additionalProperties: { type: 'object', additionalProperties: { anyOf: [{ type: 'string', maxLength: 600 }, { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 80 } }] } } };

const placeProps = {
  id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{1,39}$' },
  name: { type: 'string', minLength: 1, maxLength: 80 }, short: { type: 'string', minLength: 1, maxLength: 24 },
  cat: str(40), lat, lon, time: str(40), best: str(40), cost: str(60), blurb: str(600), fact: str(600),
  tips: { type: 'array', maxItems: 10, items: str(80) }, tags: str(200), translations: tr, published: { type: 'boolean' }
};
const { id: _id, ...placePatchProps } = placeProps;
const eventProps = {
  title: { type: 'string', minLength: 1, maxLength: 80 }, cat: str(40),
  place_id: { anyOf: [{ type: 'string', maxLength: 40 }, { type: 'null' }] },
  lat: { anyOf: [lat, { type: 'null' }] }, lon: { anyOf: [lon, { type: 'null' }] },
  venue: str(80), blurb: str(600), price: str(60),
  starts_at: { type: 'string', format: 'date-time' }, ends_at: { type: 'string', format: 'date-time' },
  repeat_weekly: { type: 'boolean' }, repeat_until: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] },
  translations: tr, published: { type: 'boolean' }
};

// API field -> column
const PLACE_COLS = { name: 'name', short: 'short', cat: 'cat', lat: 'lat', lon: 'lon', time: 'time_needed', best: 'best_time', cost: 'cost', blurb: 'blurb', fact: 'fact', tips: 'tips', tags: 'tags', translations: 'translations', published: 'published' };
const EVENT_COLS = Object.fromEntries(Object.keys(eventProps).map(k => [k, k]));
const JSONB = new Set(['tips', 'translations']);
const adminPlaceCols = `id, name, short, cat, lat, lon, time_needed AS time, best_time AS best, cost, blurb, fact, tips, tags, translations, published, sort_order, created_at, updated_at, updated_by`;
const eventCols = `e.id, e.title, e.cat, e.place_id, e.venue, e.blurb, e.price, e.starts_at, e.ends_at, e.repeat_weekly, e.repeat_until, e.translations, e.published, e.updated_at, e.updated_by,
  COALESCE(e.lat, p.lat) AS lat, COALESCE(e.lon, p.lon) AS lon, p.name AS place_name`;

const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'place';
const bad = (reply, message, code = 422) => reply.code(code).send({ error: 'invalid', message });

function setClause(body, cols, startAt) {
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(cols)) {
    if (!(k in body)) continue;
    vals.push(JSONB.has(k) ? JSON.stringify(body[k]) : body[k]);
    sets.push(`${col} = $${startAt + vals.length}`);
  }
  return { sets, vals };
}

async function checkCat(cat) { return !cat || (await query('SELECT 1 FROM categories WHERE id = $1', [cat])).rowCount > 0; }

/** Expand weekly events into occurrences inside [from, to). */
function occurrences(e, from, to) {
  const len = e.ends_at - e.starts_at, out = [];
  if (!e.repeat_weekly) { if (e.ends_at > from && e.starts_at < to) out.push([e.starts_at, e.ends_at]); return out; }
  const WEEK = 7 * 86400000, until = e.repeat_until ? new Date(e.repeat_until).getTime() + 86400000 : Infinity;
  let s = e.starts_at.getTime();
  if (s + len < from.getTime()) s += Math.ceil((from.getTime() - len - s) / WEEK) * WEEK;
  for (; s < to.getTime() && s < until && out.length < 60; s += WEEK) if (s + len > from.getTime()) out.push([new Date(s), new Date(s + len)]);
  return out;
}

function localiseEvent(r, lang) {
  const t = lang && r.translations?.[lang];
  const out = { ...r, ...(t || {}) };
  delete out.translations;
  return out;
}

export default async function admin(app) {
  // ---------- public: upcoming events ----------
  app.get('/events', {
    schema: { querystring: { type: 'object', properties: { from: { type: 'string', format: 'date-time' }, days: { type: 'integer', minimum: 1, maximum: 60, default: 14 }, lang: str(5) } } }
  }, async (req, reply) => {
    const from = req.query.from ? new Date(req.query.from) : new Date();
    const to = new Date(from.getTime() + req.query.days * 86400000);
    const { rows } = await query(
      `SELECT ${eventCols} FROM events e LEFT JOIN places p ON p.id = e.place_id
       WHERE e.published AND ((NOT e.repeat_weekly AND e.ends_at > $1 AND e.starts_at < $2)
          OR (e.repeat_weekly AND e.starts_at < $2 AND (e.repeat_until IS NULL OR e.repeat_until >= $1::date)))`, [from, to]);
    reply.header('Cache-Control', 'public, max-age=60');
    const out = [];
    for (const r of rows) for (const [s, e] of occurrences(r, from, to)) {
      const { translations, published, updated_by, updated_at, ...pub } = localiseEvent(r, req.query.lang);
      out.push({ ...pub, occurrence_id: `${r.id}@${s.toISOString()}`, starts_at: s, ends_at: e });
    }
    return out.sort((a, b) => a.starts_at - b.starts_at);
  });

  // ---------- Studio: places ----------
  const editor = { onRequest: requireRole('editor', 'admin') };

  app.get('/admin/places', editor, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return (await query(`SELECT ${adminPlaceCols} FROM places ORDER BY sort_order, name`)).rows;
  });

  app.post('/admin/places', { ...editor, schema: { body: { type: 'object', additionalProperties: false, required: ['name', 'cat', 'lat', 'lon'], properties: placeProps } } }, async (req, reply) => {
    const b = req.body;
    if (!(await checkCat(b.cat))) return bad(reply, 'Unknown category');
    let id = b.id || slug(b.short || b.name);
    for (let n = 2; (await query('SELECT 1 FROM places WHERE id = $1', [id])).rowCount; n++) id = `${slug(b.short || b.name)}-${n}`;
    const { rows: [{ next }] } = await query('SELECT COALESCE(max(sort_order), 0) + 1 AS next FROM places');
    const { rows } = await query(
      `INSERT INTO places (id, name, short, cat, lat, lon, geom, time_needed, best_time, cost, blurb, fact, tips, tags, translations, published, sort_order, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6, ST_SetSRID(ST_MakePoint($6,$5),4326)::geography, $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING ${adminPlaceCols}`,
      [id, b.name.trim(), (b.short || b.name).trim().slice(0, 24), b.cat, b.lat, b.lon, b.time || '', b.best || '', b.cost || '', b.blurb || '', b.fact || '',
        JSON.stringify(b.tips || []), b.tags || '', JSON.stringify(b.translations || {}), b.published ?? false, next, staffLabel(req)]);
    req.log.info({ by: staffLabel(req), place: id }, 'place created');
    return reply.code(201).send(rows[0]);
  });

  app.patch('/admin/places/:id', { ...editor, schema: { body: { type: 'object', additionalProperties: false, minProperties: 1, properties: placePatchProps } } }, async (req, reply) => {
    const b = req.body; delete b.id;
    if (!(await checkCat(b.cat))) return bad(reply, 'Unknown category');
    const { sets, vals } = setClause(b, PLACE_COLS, 1);
    const { rows } = await query(
      `UPDATE places SET ${sets.join(', ')}, updated_at = now(), updated_by = $${vals.length + 2} WHERE id = $1 RETURNING ${adminPlaceCols}`,
      [req.params.id, ...vals, staffLabel(req)]);
    if (!rows.length) return reply.code(404).send({ error: 'not_found', message: 'No such place' });
    if ('lat' in b || 'lon' in b) await query('UPDATE places SET geom = ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography WHERE id = $1', [req.params.id]);
    req.log.info({ by: staffLabel(req), place: req.params.id, fields: Object.keys(b) }, 'place updated');
    return rows[0];
  });

  app.delete('/admin/places/:id', editor, async (req, reply) => {
    const { rowCount } = await query('DELETE FROM places WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.code(404).send({ error: 'not_found', message: 'No such place' });
    req.log.info({ by: staffLabel(req), place: req.params.id }, 'place deleted');
    return reply.code(204).send();
  });

  // ---------- Studio: events ----------
  async function checkEvent(b, reply, existing = {}) {
    const m = { ...existing, ...b };
    if (!(await checkCat(b.cat))) return bad(reply, 'Unknown category');
    if (m.place_id && !(await query('SELECT 1 FROM places WHERE id = $1', [m.place_id])).rowCount) return bad(reply, 'Unknown place');
    if (!m.place_id && (m.lat == null || m.lon == null)) return bad(reply, 'Pick a place or drop a pin for the event');
    if (new Date(m.ends_at) <= new Date(m.starts_at)) return bad(reply, 'The event must end after it starts');
    return null;
  }

  app.get('/admin/events', editor, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return (await query(`SELECT ${eventCols}, e.lat AS own_lat, e.lon AS own_lon FROM events e LEFT JOIN places p ON p.id = e.place_id
      ORDER BY (e.repeat_weekly OR e.ends_at > now()) DESC, e.starts_at`)).rows;
  });

  app.post('/admin/events', { ...editor, schema: { body: { type: 'object', additionalProperties: false, required: ['title', 'cat', 'starts_at', 'ends_at'], properties: eventProps } } }, async (req, reply) => {
    const b = req.body;
    if (await checkEvent(b, reply)) return;
    const cols = Object.keys(EVENT_COLS).filter(k => k in b);
    const vals = cols.map(k => JSONB.has(k) ? JSON.stringify(b[k]) : b[k]);
    const { rows: [{ id }] } = await query(
      `INSERT INTO events (${cols.join(', ')}, updated_by) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, $${cols.length + 1}) RETURNING id`,
      [...vals, staffLabel(req)]);
    req.log.info({ by: staffLabel(req), event: id }, 'event created');
    return reply.code(201).send((await query(`SELECT ${eventCols} FROM events e LEFT JOIN places p ON p.id = e.place_id WHERE e.id = $1`, [id])).rows[0]);
  });

  app.patch('/admin/events/:id', {
    ...editor, schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: eventProps } }
  }, async (req, reply) => {
    const { rows: [cur] } = await query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (!cur) return reply.code(404).send({ error: 'not_found', message: 'No such event' });
    if (await checkEvent(req.body, reply, cur)) return;
    const { sets, vals } = setClause(req.body, EVENT_COLS, 1);
    await query(`UPDATE events SET ${sets.join(', ')}, updated_at = now(), updated_by = $${vals.length + 2} WHERE id = $1`, [req.params.id, ...vals, staffLabel(req)]);
    req.log.info({ by: staffLabel(req), event: req.params.id, fields: Object.keys(req.body) }, 'event updated');
    return (await query(`SELECT ${eventCols} FROM events e LEFT JOIN places p ON p.id = e.place_id WHERE e.id = $1`, [req.params.id])).rows[0];
  });

  app.delete('/admin/events/:id', { ...editor, schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } } }, async (req, reply) => {
    const { rowCount } = await query('DELETE FROM events WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.code(404).send({ error: 'not_found', message: 'No such event' });
    req.log.info({ by: staffLabel(req), event: req.params.id }, 'event deleted');
    return reply.code(204).send();
  });
}
