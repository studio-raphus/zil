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

async function http(path, opts = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), config.requestTimeoutMs);
  try {
    const res = await fetch(base + path, {
      ...opts,
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId(), ...(opts.headers || {}) }
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
      return { categories, places, status, feed, spots };
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
        spots: store.get('zil.spots.offline', [])
      };
    }
  },

  subscribeLive(onStatus) {
    if (this.offline || typeof EventSource === 'undefined') return () => {};
    const es = new EventSource(`${base}/live/v1/stream`);
    es.addEventListener('status', ev => { try { onStatus(JSON.parse(ev.data)); } catch (e) { /* ignore bad frame */ } });
    return () => es.close();
  },

  // ---- accounts (sign in with Google) ----
  // Separate from bootstrap so an accounts outage never pushes the map into offline mode.
  async session() {
    if (this.offline) return null;
    try { return await http('/accounts/v1/session', { credentials: 'include' }); }
    catch (e) { console.warn('[zil] accounts unavailable:', e.message); return null; }
  },
  googleSignInUrl: () => `${base}/accounts/v1/auth/google/start`,
  signOut() { return http('/accounts/v1/auth/logout', { method: 'POST', body: '{}', credentials: 'include' }); },

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
