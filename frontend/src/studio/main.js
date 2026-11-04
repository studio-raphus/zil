// Zil Studio: the team's admin portal for places, events, live updates, moderation and roles.
// Access: sign in with Google; your Zil account needs the editor or admin role.
import '../styles/app.css';
import './studio.css';
import { api, base } from './api.js';
import { $, esc, snack } from './util.js';
import { ic, googleG } from '../core/icons.js';
import places from './places.js';
import events from './events.js';
import live from './live.js';
import moderation from './moderation.js';
import team from './team.js';

const VIEWS = [
  { k: 'places', label: 'Places', icon: 'nature', view: places },
  { k: 'events', label: 'Events', icon: 'food', view: events },
  { k: 'live', label: 'Live updates', icon: 'info', view: live },
  { k: 'moderation', label: 'Moderation', icon: 'check', view: moderation },
  { k: 'team', label: 'Team', icon: 'user', view: team, admin: true }
];

const ctx = { user: null, cats: {}, places: [], snack, go, refreshPlaces, badge };

async function refreshPlaces() { ctx.places = await api.get('/catalog/v1/admin/places'); return ctx.places; }

function badge(k, n) { const b = $(`#nav [data-k="${k}"] .st-badge`); if (b) { b.textContent = n || ''; b.hidden = !n; } }

let current = null;
async function go(k, params = {}) {
  const v = VIEWS.find(x => x.k === k && (!x.admin || ctx.user.role === 'admin')) || VIEWS[0];
  if (location.hash !== `#${v.k}`) history.replaceState(null, '', `#${v.k}`);
  document.querySelectorAll('#nav .chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.k === v.k)));
  current = v.k;
  const el = $('#view'); el.innerHTML = '<p class="muted">Loading…</p>';
  try { await v.view(el, ctx, params); }
  catch (e) { el.innerHTML = `<div class="card st-msg"><h2>Couldn’t load ${esc(v.label)}</h2><p>${esc(e.message)}</p></div>`; }
  if (current === v.k) el.focus({ preventScroll: true });
}

function burst() {
  const pts = (cx, cy) => Array.from({ length: 28 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 14, r = i % 2 ? 22 : 31; return (cx + Math.cos(a) * r * 1.12).toFixed(1) + ',' + (cy + Math.sin(a) * r * 0.92).toFixed(1); }).join(' ');
  $('#burstFg').setAttribute('points', pts(36, 30)); $('#burstSh').setAttribute('points', pts(39, 33));
}

function gate(html) { $('#nav').innerHTML = ''; $('#view').innerHTML = `<div class="card st-gate">${html}</div>`; }

async function signOut() {
  await api.post('/accounts/v1/auth/logout').catch(() => {});
  location.href = '/admin/';
}

async function boot() {
  burst();
  const url = new URL(location.href);
  const auth = url.searchParams.get('auth');
  if (auth) { url.searchParams.delete('auth'); history.replaceState(null, '', url.pathname + url.search + url.hash); }

  let session;
  try { session = await api.get('/accounts/v1/session'); } catch (e) { session = null; }
  if (!session || typeof session.providers !== 'object') {
    gate('<h1>Zil Studio</h1><p>The accounts service isn’t reachable, so Studio can’t check who you are. Is the stack running?</p>'); return;
  }
  ctx.user = session.user;
  if (!ctx.user) {
    const href = `${base}/accounts/v1/auth/google/start?return=${encodeURIComponent('/admin/')}`;
    gate(`<h1>Zil Studio</h1><p>Manage places, events, live updates and community spots. Sign in with your Google account to continue.</p>
      ${session.providers.google ? `<a class="btn wide gbtn" href="${href}"><span class="g-logo">${googleG}</span>Continue with Google</a>` : '<p class="fine">Google sign-in isn’t configured on this server yet.</p>'}
      ${auth === 'error' ? '<p class="fine">Sign-in didn’t work. Please try again.</p>' : ''}`);
    return;
  }
  $('#who').innerHTML = `<span class="st-user"><b>${esc(ctx.user.name)}</b><small>${esc(ctx.user.role)}</small></span><button class="btn sm" type="button" id="signOut">${ic('logout')}Sign out</button>`;
  $('#signOut').addEventListener('click', signOut);
  if (!['editor', 'admin'].includes(ctx.user.role)) {
    gate(`<h1>No Studio access yet</h1><p>You’re signed in as <b>${esc(ctx.user.email)}</b>, but this account isn’t on the Zil team. Ask an admin to give you the editor role in Studio › Team, then reload this page.</p><p><a class="btn" href="/">Back to the map</a></p>`);
    return;
  }

  $('#nav').innerHTML = VIEWS.filter(v => !v.admin || ctx.user.role === 'admin').map(v =>
    `<button class="chip" type="button" data-k="${v.k}" aria-pressed="false">${ic(v.icon)}<span>${v.label}</span><span class="st-badge" hidden></span></button>`).join('');
  $('#nav').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) go(b.dataset.k); });

  const cats = await api.get('/catalog/v1/categories');
  ctx.cats = Object.fromEntries(cats.map(c => [c.id, c]));
  await refreshPlaces();
  api.get('/spots/v1/moderation/queue').then(q => badge('moderation', q.length)).catch(() => {});
  if (auth === 'welcome' || auth === 'signed_in') snack(`Welcome to Studio, ${ctx.user.name.split(' ')[0]}!`);
  go((location.hash || '#places').slice(1));
}

window.addEventListener('hashchange', () => { if (ctx.user && location.hash.slice(1) !== current) go(location.hash.slice(1)); });
boot();
