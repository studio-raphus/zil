// Who may change content. Shared verbatim by the catalog, live and spots services.
// Accepts either the ops ADMIN_TOKEN (scripts, curl) or a signed-in Zil account whose role
// allows it. The account is resolved by asking the accounts service (/v1/me) with the
// caller's session cookie, cached briefly so a busy Studio page doesn't hammer it.
const ACCOUNTS = (process.env.ACCOUNTS_URL || 'http://accounts:3000').replace(/\/$/, '');
const TTL_MS = 30_000;
const cache = new Map();

export async function caller(req) {
  const token = process.env.ADMIN_TOKEN;
  if (token && req.headers.authorization === `Bearer ${token}`) return { id: null, name: 'admin token', email: null, role: 'admin' };
  const sid = /(?:^|;\s*)zil_sid=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  if (!sid) return null;
  const hit = cache.get(sid);
  if (hit && hit.exp > Date.now()) return hit.user;
  let user = null;
  try {
    const res = await fetch(`${ACCOUNTS}/v1/me`, { headers: { cookie: `zil_sid=${sid}` }, signal: AbortSignal.timeout(3000) });
    if (res.ok) user = await res.json();
  } catch (e) {
    req.log.warn({ err: e.message }, 'accounts service unreachable');
    return null;
  }
  cache.set(sid, { user, exp: Date.now() + TTL_MS });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return user;
}

/** Fastify onRequest hook: 401 if not signed in, 403 if the role isn't allowed. Sets req.staff. */
export const requireRole = (...roles) => async (req, reply) => {
  const u = await caller(req);
  if (!u) return reply.code(401).send({ error: 'unauthorized', message: 'Sign in to Zil Studio first' });
  if (!roles.includes(u.role)) return reply.code(403).send({ error: 'forbidden', message: 'Your account doesn’t have access to this' });
  req.staff = u;
};
export const staffLabel = req => req.staff?.email || req.staff?.name || 'unknown';
