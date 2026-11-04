// API client for the three Phase 1 services, behind the gateway. If the backend can't be
// reached, the app falls back to the bundled seed (and spots stay in local storage), so
// the map always opens: useful for demos, offline use and frontend-only development.
import { config } from '../config.js';
import { store } from '../core/util.js';

const base = config.apiBase;

function deviceId() {
  let id = store.get('zil.device', null);
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9-]/g, ''); store.set('zil.device', id); }
  return id;
}

// The Android app signs in natively and sends its session as a header (no cross-origin cookies).
const sessionHeader = () => { const t = store.get('zil.session', null); return t ? { 'X-Zil-Session': t } : {}; };

async function http(path, opts = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), config.requestTimeoutMs);
  try {
    const res = await fetch(base + path, {
      ...opts,
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId(), ...sessionHeader(), ...(opts.headers || {}) }
    });
    if (res.status === 204) return null;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(body.message || `HTTP ${res.status}`); e.status = res.status; throw e; }
    return body;
  } finally { clearTimeout(timer); }
}

let seedCache = null;
async function seed() {
  if (!seedCache) seedCache = await (await fetch(`${import.meta.env.BASE_URL}seed/places.json`)).json();
  return seedCache;
}

export const api = {
  offline: false,

  async bootstrap() {
    try {
      const [categories, places, status, feed, spots] = await Promise.all([
        http('/catalog/v1/categories'), http('/catalog/v1/places'), http('/live/v1/status'), http('/live/v1/feed?limit=12'), http('/spots/v1/spots')
      ]);
      // Events are optional: an older catalog without /events must not push the app offline.
      const events = await http('/catalog/v1/events?days=7').catch(() => []);
      return { categories, places, status, feed, spots, events };
    } catch (e) {
      console.warn('[zil] backend unreachable, using bundled seed:', e.message);
      this.offline = true;
      const s = await seed();
      const now = Date.now();
      return {
        categories: s.categories,
        places: s.places,
        status: s.live.status.map(([place_id, text, hot]) => ({ place_id, text, hot })),
        feed: s.live.feed.map(([place_id, mins], i) => {
          const st = s.live.status.find(x => x[0] === place_id);
          return { id: i, place_id, text: st ? st[1] : '', created_at: new Date(now - mins * 60000).toISOString() };
        }),
        spots: store.get('zil.spots.offline', []),
        events: []
      };
    }
  },

  subscribeLive(onStatus) {
    if (this.offline || typeof EventSource === 'undefined') return () => {};
    const es = new EventSource(`${base}/live/v1/stream`);
    es.addEventListener('status', ev => { try { onStatus(JSON.parse(ev.data)); } catch (e) { /* ignore bad frame */ } });
    return () => es.close();
  },

  // ---- routing (road routes from the routing service; null when unavailable) ----
  async route(from, to) {
    if (this.offline) return null;
    const q = `from=${from.lat.toFixed(5)},${from.lon.toFixed(5)}&to=${to.lat.toFixed(5)},${to.lon.toFixed(5)}`;
    try { return await http(`/routing/v1/route?${q}`); }
    catch (e) { console.warn('[zil] road route unavailable:', e.message); return null; }
  },

  // ---- accounts (sign in with Google) ----
  // Separate from bootstrap so an accounts outage never pushes the map into offline mode.
  async session() {
    if (this.offline) return null;
    try { return await http('/accounts/v1/session', { credentials: 'include' }); }
    catch (e) { console.warn('[zil] accounts unavailable:', e.message); return null; }
  },
  googleSignInUrl: () => `${base}/accounts/v1/auth/google/start`,
  async signOut() { try { await http('/accounts/v1/auth/logout', { method: 'POST', body: '{}', credentials: 'include' }); } finally { store.set('zil.session', null); } },
  async nativeSignIn(idToken) {
    const r = await http('/accounts/v1/auth/google/native', { method: 'POST', body: JSON.stringify({ id_token: idToken }) });
    store.set('zil.session', r.token);
    return r;
  },
  registerPush: (token, platform = 'android') => http('/live/v1/push/devices', { method: 'POST', body: JSON.stringify({ token, platform }) }),
  unregisterPush: token => http('/live/v1/push/devices', { method: 'DELETE', body: JSON.stringify({ token }) }),

  async createSpot(spot) {
    if (this.offline) {
      const s = { ...spot, id: 'local-' + Date.now().toString(36), status: 'pending', mine: true, created_at: new Date().toISOString() };
      store.set('zil.spots.offline', store.get('zil.spots.offline', []).concat(s));
      return s;
    }
    return http('/spots/v1/spots', { method: 'POST', body: JSON.stringify(spot) });
  },

  async deleteSpot(id) {
    if (this.offline) { store.set('zil.spots.offline', store.get('zil.spots.offline', []).filter(s => s.id !== id)); return; }
    return http(`/spots/v1/spots/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
};
