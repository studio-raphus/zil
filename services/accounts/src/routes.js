// Accounts service: "Sign in with Google" (OAuth 2.0 authorization code flow + PKCE) and
// server-side sessions. Signing in for the first time creates the account (sign-up), later
// sign-ins refresh name/email. Only the name and email are kept from the Google profile.
import { randomBytes, createHash, createPublicKey, verify as verifySig } from 'node:crypto';
import { query } from './db.js';

const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8080').replace(/\/$/, '');
const API_PREFIX = (process.env.API_PREFIX ?? '/api/accounts').replace(/\/$/, ''); // where the gateway mounts this service
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = `${PUBLIC_URL}${API_PREFIX}/v1/auth/google/callback`;
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const SECURE = PUBLIC_URL.startsWith('https://');
const SID = 'zil_sid';
const OAUTH = 'zil_oauth';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
const ROLES = ['user', 'editor', 'admin'];
// Where to land after sign-in: a same-origin path only (no open redirects).
const safeReturn = p => (typeof p === 'string' && /^\/(?!\/)[\w\-./]*$/.test(p) && p.length < 100) ? p : '/';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
// ID tokens from the Android app (Credential Manager) carry the *web* client ID as audience;
// extra audiences (e.g. an iOS client later) can be listed in GOOGLE_EXTRA_AUDIENCES.
const AUDIENCES = [CLIENT_ID, ...(process.env.GOOGLE_EXTRA_AUDIENCES || '').split(',').map(s => s.trim())].filter(Boolean);
const SESSION_HEADER = 'x-zil-session'; // the native app can't rely on cookies across origins

const googleEnabled = () => !!(CLIENT_ID && CLIENT_SECRET);
const token = (n = 32) => randomBytes(n).toString('base64url');
const sha256 = s => createHash('sha256').update(s).digest();

// --- cookies (tiny helpers, no extra dependency) ---
function readCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore bad cookie */ }
  }
  return out;
}
function cookie(name, value, maxAge) {
  const c = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (SECURE) c.push('Secure');
  return c.join('; ');
}
const backToApp = (reply, status, cookies = [], to = '/') => {
  if (cookies.length) reply.header('set-cookie', cookies);
  return reply.code(302).redirect(`${PUBLIC_URL}${safeReturn(to)}?auth=${status}`);
};

// --- sessions ---
const sessionToken = req => readCookies(req.headers.cookie)[SID] || (typeof req.headers[SESSION_HEADER] === 'string' ? req.headers[SESSION_HEADER] : null);

async function currentUser(req) {
  const sid = sessionToken(req);
  if (!sid) return null;
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id_hash = $1 AND s.expires_at > now()`, [sha256(sid)]);
  return rows[0] || null;
}

// Google's signing keys, cached for as long as Google says (Cache-Control max-age).
let jwks = { keys: [], exp: 0 };
async function googleKey(kid) {
  if (Date.now() > jwks.exp || !jwks.keys.some(k => k.kid === kid)) {
    const res = await fetch(GOOGLE_JWKS, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`jwks ${res.status}`);
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600);
    jwks = { keys: (await res.json()).keys, exp: Date.now() + maxAge * 1000 };
  }
  const jwk = jwks.keys.find(k => k.kid === kid);
  if (!jwk) throw new Error('unknown signing key');
  return createPublicKey({ key: jwk, format: 'jwk' });
}
/** Verifies a Google ID token that did NOT come straight from Google's token endpoint. */
async function verifyGoogleIdToken(jwt) {
  const [h, p, sig] = String(jwt || '').split('.');
  if (!h || !p || !sig) throw new Error('malformed id_token');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
  if (header.alg !== 'RS256') throw new Error('unexpected alg');
  const ok = verifySig('RSA-SHA256', Buffer.from(`${h}.${p}`), await googleKey(header.kid), Buffer.from(sig, 'base64url'));
  if (!ok) throw new Error('bad signature');
  const c = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  if (!GOOGLE_ISSUERS.includes(c.iss)) throw new Error('bad issuer');
  if (!AUDIENCES.includes(c.aud)) throw new Error('bad audience');
  if (!c.exp || c.exp < Math.floor(Date.now() / 1000) - 60) throw new Error('id_token expired');
  return c;
}

/** Sign-up on first visit, sign-in afterwards; returns { id, created }. */
async function upsertGoogleUser(c) {
  if (!c.sub || !c.email || c.email_verified === false) throw new Error('email not verified');
  const email = String(c.email).slice(0, 254);
  const name = String(c.name || c.given_name || email.split('@')[0]).trim().slice(0, 100) || 'Explorer';
  const { rows: [user] } = await query(
    `INSERT INTO users (google_sub, name, email) VALUES ($1, $2, $3)
     ON CONFLICT (google_sub) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, last_login_at = now()
     RETURNING id, (xmax = 0) AS created`, [c.sub, name, email]);
  if (ADMIN_EMAILS.includes(email.toLowerCase())) await query(`UPDATE users SET role = 'admin' WHERE id = $1 AND role <> 'admin'`, [user.id]);
  return user;
}
async function newSession(userId) {
  const sid = token();
  await query(`INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`, [sha256(sid), userId, SESSION_DAYS]);
  query('DELETE FROM sessions WHERE expires_at < now()').catch(() => {});
  return sid;
}

function decodeIdToken(jwt) {
  const [, payload] = String(jwt || '').split('.');
  if (!payload) throw new Error('missing id_token');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

export default async function routes(app) {
  if (!googleEnabled()) app.log.warn('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set: Google sign-in is disabled');

  // What the frontend needs on load: who is signed in (or null) and which providers are on.
  app.get('/session', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    return { user: await currentUser(req), providers: { google: googleEnabled() } };
  });

  // For other services (phase 2): resolve the caller's account, 401 if not signed in.
  app.get('/me', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const user = await currentUser(req);
    if (!user) return reply.code(401).send({ error: 'unauthorized', message: 'Not signed in' });
    return user;
  });

  // Step 1: send the browser to Google's consent screen.
  app.get('/auth/google/start', async (req, reply) => {
    const to = safeReturn(req.query?.return);
    if (!googleEnabled()) return backToApp(reply, 'unavailable', [], to);
    const state = token(), nonce = token(), verifier = token(48);
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state, nonce,
      code_challenge: sha256(verifier).toString('base64url'),
      code_challenge_method: 'S256',
      prompt: 'select_account'
    });
    reply.header('set-cookie', cookie(OAUTH, JSON.stringify({ state, nonce, verifier, to }), 600));
    return reply.code(302).redirect(`${GOOGLE_AUTH}?${params}`);
  });

  // Step 2: Google sends the browser back here with a one-time code.
  app.get('/auth/google/callback', async (req, reply) => {
    const clear = cookie(OAUTH, '', 0);
    const { code, state, error } = req.query || {};
    if (error) return backToApp(reply, error === 'access_denied' ? 'cancelled' : 'error', [clear]);

    let saved;
    try { saved = JSON.parse(readCookies(req.headers.cookie)[OAUTH] || 'null'); } catch { saved = null; }
    if (!saved || !code || typeof state !== 'string' || state !== saved.state) {
      req.log.warn('oauth state mismatch or expired');
      return backToApp(reply, 'error', [clear]);
    }
    const to = safeReturn(saved.to);

    try {
      // Exchange the code directly with Google over TLS (PKCE-bound to this browser).
      const res = await fetch(GOOGLE_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI, grant_type: 'authorization_code', code_verifier: saved.verifier
        }),
        signal: AbortSignal.timeout(8000)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${body.error || ''}`);

      // The id_token comes straight from Google's token endpoint over TLS, so per OpenID Connect
      // its claims can be trusted without re-checking the signature; we still validate them.
      const c = decodeIdToken(body.id_token);
      const now = Math.floor(Date.now() / 1000);
      if (!GOOGLE_ISSUERS.includes(c.iss)) throw new Error('bad issuer');
      if (c.aud !== CLIENT_ID) throw new Error('bad audience');
      if (!c.exp || c.exp < now) throw new Error('id_token expired');
      if (c.nonce !== saved.nonce) throw new Error('bad nonce');

      const user = await upsertGoogleUser(c);
      const sid = await newSession(user.id);

      req.log.info({ user: user.id, created: user.created }, user.created ? 'user signed up' : 'user signed in');
      return backToApp(reply, user.created ? 'welcome' : 'signed_in', [clear, cookie(SID, sid, SESSION_DAYS * 86400)], to);
    } catch (e) {
      req.log.error({ err: e.message }, 'google sign-in failed');
      return backToApp(reply, 'error', [clear], to);
    }
  });

  // ---- Team management (Studio, admins only) ----
  const adminOnly = async (req, reply) => {
    const u = await currentUser(req);
    if (!u) return reply.code(401).send({ error: 'unauthorized', message: 'Not signed in' });
    if (u.role !== 'admin') return reply.code(403).send({ error: 'forbidden', message: 'Admins only' });
    req.user = u;
  };

  app.get('/users', { onRequest: adminOnly }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const { rows } = await query(`SELECT id, name, email, role, created_at, last_login_at FROM users
      ORDER BY (role = 'admin') DESC, (role = 'editor') DESC, last_login_at DESC LIMIT 500`);
    return rows;
  });

  app.patch('/users/:id/role', {
    onRequest: adminOnly,
    schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }, body: { type: 'object', required: ['role'], additionalProperties: false, properties: { role: { type: 'string', enum: ROLES } } } }
  }, async (req, reply) => {
    if (req.params.id === req.user.id && req.body.role !== 'admin') return reply.code(409).send({ error: 'conflict', message: 'You can’t remove your own admin role' });
    const { rows } = await query('UPDATE users SET role = $2 WHERE id = $1 RETURNING id, name, email, role', [req.params.id, req.body.role]);
    if (!rows.length) return reply.code(404).send({ error: 'not_found', message: 'No such user' });
    req.log.info({ by: req.user.id, user: req.params.id, role: req.body.role }, 'role changed');
    return rows[0];
  });

  // Android/iOS app: Google sign-in happens natively (Credential Manager); the app sends the
  // ID token here and gets a session token back, which it sends as the X-Zil-Session header.
  app.post('/auth/google/native', {
    schema: { body: { type: 'object', required: ['id_token'], additionalProperties: false, properties: { id_token: { type: 'string', minLength: 20, maxLength: 4096 } } } }
  }, async (req, reply) => {
    if (!googleEnabled()) return reply.code(503).send({ error: 'unavailable', message: 'Google sign-in isn’t configured' });
    let c;
    try { c = await verifyGoogleIdToken(req.body.id_token); }
    catch (e) { req.log.warn({ err: e.message }, 'native id_token rejected'); return reply.code(401).send({ error: 'invalid_token', message: 'Google sign-in couldn’t be verified' }); }
    try {
      const user = await upsertGoogleUser(c);
      const sid = await newSession(user.id);
      const { rows: [me] } = await query('SELECT id, name, email, role FROM users WHERE id = $1', [user.id]);
      req.log.info({ user: user.id, created: user.created }, user.created ? 'user signed up (app)' : 'user signed in (app)');
      return { token: sid, user: me, created: user.created, expires_in_days: SESSION_DAYS };
    } catch (e) { return reply.code(401).send({ error: 'invalid_token', message: e.message }); }
  });

  app.post('/auth/logout', async (req, reply) => {
    const sid = sessionToken(req);
    if (sid) await query('DELETE FROM sessions WHERE id_hash = $1', [sha256(sid)]);
    reply.header('set-cookie', cookie(SID, '', 0));
    return reply.code(204).send();
  });
}
