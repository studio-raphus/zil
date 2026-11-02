// Accounts service: "Sign in with Google" (OAuth 2.0 authorization code flow + PKCE) and
// server-side sessions. Signing in for the first time creates the account (sign-up), later
// sign-ins refresh name/email. Only the name and email are kept from the Google profile.
import { randomBytes, createHash } from 'node:crypto';
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

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

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
const backToApp = (reply, status, cookies = []) => {
  if (cookies.length) reply.header('set-cookie', cookies);
  return reply.code(302).redirect(`${PUBLIC_URL}/?auth=${status}`);
};

// --- sessions ---
async function currentUser(req) {
  const sid = readCookies(req.headers.cookie)[SID];
  if (!sid) return null;
  const { rows } = await query(
    `SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id_hash = $1 AND s.expires_at > now()`, [sha256(sid)]);
  return rows[0] || null;
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
    if (!googleEnabled()) return backToApp(reply, 'unavailable');
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
    reply.header('set-cookie', cookie(OAUTH, JSON.stringify({ state, nonce, verifier }), 600));
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
      if (!c.sub || !c.email || c.email_verified === false) throw new Error('email not verified');

      const email = String(c.email).slice(0, 254);
      const name = String(c.name || c.given_name || email.split('@')[0]).trim().slice(0, 100) || 'Explorer';

      // Sign-up on first visit, sign-in afterwards (name/email refreshed from Google).
      const { rows: [user] } = await query(
        `INSERT INTO users (google_sub, name, email) VALUES ($1, $2, $3)
         ON CONFLICT (google_sub) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, last_login_at = now()
         RETURNING id, (xmax = 0) AS created`, [c.sub, name, email]);

      const sid = token();
      await query(`INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
        [sha256(sid), user.id, SESSION_DAYS]);
      query('DELETE FROM sessions WHERE expires_at < now()').catch(() => {});

      req.log.info({ user: user.id, created: user.created }, user.created ? 'user signed up' : 'user signed in');
      return backToApp(reply, user.created ? 'welcome' : 'signed_in', [clear, cookie(SID, sid, SESSION_DAYS * 86400)]);
    } catch (e) {
      req.log.error({ err: e.message }, 'google sign-in failed');
      return backToApp(reply, 'error', [clear]);
    }
  });

  app.post('/auth/logout', async (req, reply) => {
    const sid = readCookies(req.headers.cookie)[SID];
    if (sid) await query('DELETE FROM sessions WHERE id_hash = $1', [sha256(sid)]);
    reply.header('set-cookie', cookie(SID, '', 0));
    return reply.code(204).send();
  });
}
