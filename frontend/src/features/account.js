// Account: "Sign in with Google" and the profile button at the top right.
// Signing in is a full-page redirect to Google and back (handled by the accounts service);
// on return the URL carries ?auth=<result>, which we turn into a snack and strip.
import { $, esc } from '../core/util.js';
import { ic, googleG } from '../core/icons.js';
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { api } from '../api/client.js';
import { isNative, nativeGoogleSignIn, nativeGoogleSignOut, alertsOn, initPush, stopPush } from './native.js';

const TINTS = ['var(--sun)', 'var(--leaf)', 'var(--grape)', 'var(--tomato)', 'var(--sky)', 'var(--pink)'];
const RETURN_MSG = {
  welcome: n => `Welcome to Zil, ${n}! Your account is ready.`,
  signed_in: n => `Welcome back, ${n}!`,
  cancelled: () => 'Sign-in cancelled',
  error: () => 'Google sign-in didn’t work. Please try again.',
  unavailable: () => 'Google sign-in isn’t set up on this server yet'
};

const root = $('#account');
let user = null, google = false, open = false;

const words = n => String(n || '').trim().split(/\s+/).filter(Boolean);
const initials = n => words(n).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const firstName = n => words(n)[0] || 'You';
const tint = s => TINTS[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
const avatar = (cls = '') => `<span class="avatar ${cls}" style="--c:${tint(user.email)}" aria-hidden="true">${esc(initials(user.name))}</span>`;

function signedOutMenu() {
  const href = google ? api.googleSignInUrl() : null;
  return `
    <div class="auth-art" aria-hidden="true"><span class="auth-burst"></span><span class="auth-pow">Hello!</span></div>
    <h2 class="acct-title" id="acctTitle">Join the island</h2>
    <p class="acct-lead">One tap with Google signs you in. First time here? Your Zil account is created on the spot.</p>
    ${href && isNative()
      ? `<button class="btn wide gbtn" type="button" data-act="google-native"><span class="g-logo">${googleG}</span>Continue with Google</button>`
      : href
      ? `<a class="btn wide gbtn" href="${esc(href)}" data-act="google"><span class="g-logo">${googleG}</span>Continue with Google</a>`
      : `<button class="btn wide gbtn" type="button" disabled><span class="g-logo">${googleG}</span>Continue with Google</button>`}
    <p class="fine">${google ? 'We keep only your name and email. The map works without an account.' : 'Google sign-in isn’t configured on this server yet.'}</p>
    <hr class="acct-sep">${alertsItem()}
    <button class="menu-item" type="button" data-act="about">${ic('info')}About Zil</button>`;
}

const alertsItem = () => isNative() ? `<button class="menu-item" type="button" data-act="alerts" aria-pressed="${alertsOn()}">${ic('info')}Live alerts: ${alertsOn() ? 'on' : 'off'}</button>` : '';

function signedInMenu() {
  return `
    <div class="acct-head">${avatar('lg')}<div class="acct-id"><b id="acctTitle">${esc(user.name)}</b><span>${esc(user.email)}</span></div></div>
    <hr class="acct-sep">${alertsItem()}
    <button class="menu-item" type="button" data-act="about">${ic('info')}About Zil</button>
    <button class="menu-item danger" type="button" data-act="signout">${ic('logout')}Sign out</button>`;
}

function render() {
  root.hidden = false;
  root.classList.toggle('in', !!user);
  const btn = user
    ? `<button class="acct-btn" id="acctBtn" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="acctMenu" aria-label="Your profile, ${esc(user.name)}">${avatar()}<span class="acct-name">${esc(firstName(user.name))}</span></button>`
    : `<button class="acct-btn out" id="acctBtn" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="acctMenu"><span class="acct-ic">${ic('user')}</span><span class="acct-name">Sign in</span></button>`;
  root.innerHTML = `${btn}<div class="acct-menu card" id="acctMenu" role="dialog" aria-labelledby="acctTitle" hidden>${user ? signedInMenu() : signedOutMenu()}</div>`;
  open = false;
  $('#acctBtn').addEventListener('click', () => setOpen(!open));
}

function setOpen(on) {
  const menu = $('#acctMenu'), btn = $('#acctBtn');
  if (!menu) return;
  open = on; menu.hidden = !on; btn.setAttribute('aria-expanded', String(on));
  if (on) {
    bus.emit('map:interact');
    const first = menu.querySelector('[data-act="google"], [data-act="about"]');
    if (first) requestAnimationFrame(() => first.focus());
  }
}

async function signOut() {
  try { await api.signOut(); } catch (e) { bus.emit('snack', `Couldn’t sign out: ${e.message}`); return; }
  if (isNative()) nativeGoogleSignOut();
  user = null; state.user = null; render();
  bus.emit('auth:change', null);
  bus.emit('snack', 'Signed out. See you on the island!');
}

async function signInNative(btn) {
  btn.classList.add('busy');
  try {
    const r = await nativeGoogleSignIn();
    user = r.user; state.user = user; render();
    bus.emit('auth:change', user);
    bus.emit('snack', RETURN_MSG[r.created ? 'welcome' : 'signed_in'](firstName(user.name)), 4000);
  } catch (e) {
    btn.classList.remove('busy');
    if (!/cancel/i.test(e.message || '')) bus.emit('snack', `Google sign-in didn’t work: ${e.message}`, 5000);
  }
}

async function toggleAlerts() {
  if (alertsOn()) { await stopPush(); bus.emit('snack', 'Live alerts off'); }
  else if (await initPush({ ask: true })) bus.emit('snack', 'Live alerts on: we’ll only ping you for big things.');
  else bus.emit('snack', 'Notifications are blocked for Zil. Turn them on in Android settings.', 5000);
  const wasOpen = open; render(); if (wasOpen) setOpen(true);
}

function consumeReturnParam() {
  const url = new URL(location.href);
  const result = url.searchParams.get('auth');
  if (!result) return null;
  url.searchParams.delete('auth');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  return result;
}

export async function initAccount() {
  const result = consumeReturnParam();

  root.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'about') { setOpen(false); $('#infoBtn').click(); }
    else if (act === 'signout') { setOpen(false); signOut(); }
    else if (act === 'google') { e.currentTarget.classList.add('busy'); } // full-page redirect follows
    else if (act === 'google-native') signInNative(e.target.closest('[data-act]'));
    else if (act === 'alerts') toggleAlerts();
  });
  document.addEventListener('pointerdown', e => { if (open && !root.contains(e.target)) setOpen(false); });
  // Capture phase so Escape closes the menu without also closing the place sheet behind it.
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); $('#acctBtn').focus(); }
  }, true);

  const session = await api.session();
  // Offline, accounts service down, or the gateway isn't routing /api/accounts yet: no account UI.
  if (!session || typeof session.providers !== 'object') {
    if (session) console.warn('[zil] /api/accounts/v1/session did not return a session; is the gateway routing /api/accounts/?');
    return;
  }
  google = !!session.providers?.google;
  user = session.user;
  state.user = user;
  render();
  if (user) bus.emit('auth:change', user);

  const msg = result && RETURN_MSG[result];
  if (msg) bus.emit('snack', msg(user ? firstName(user.name) : ''), 4000);
}
