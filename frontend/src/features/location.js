// Device location: the "You" avatar follows the phone/browser position and routes start there.
// Privacy: the position never leaves the device except as the start point of a route request.
// No prompt on page load: we only ask when the user taps "locate" or asks for directions,
// unless permission was already granted earlier.
import { $ } from '../core/util.js';
import { ic } from '../core/icons.js';
import { bus } from '../core/bus.js';
import { config } from '../config.js';
import { ctx } from '../map/ctx.js';
import { setYou } from '../map/live.js';
import { focusPoint } from '../map/engine.js';
import { isNative, nativeGeolocation } from './native.js';

const btn = $('#fabLocate');
const B = config.islandBounds;
let watchId = null, fix = null, waiting = [], warnedAway = false, focusOnFix = false;

const onIsland = (lat, lon) => lat >= B.minLat && lat <= B.maxLat && lon >= B.minLon && lon <= B.maxLon;
const supported = () => isNative() || ('geolocation' in navigator && window.isSecureContext);
const DENIED = { code: 1, PERMISSION_DENIED: 1 };
let G = null; // Capacitor Geolocation plugin in the app

function paint(stateName) { // idle | busy | on | away | off
  btn.dataset.state = stateName;
  btn.setAttribute('aria-pressed', String(stateName === 'on'));
  btn.setAttribute('aria-label', stateName === 'on' ? 'Show my location (tracking)' : 'Show my location');
}

function settle(v) { const w = waiting; waiting = []; w.forEach(fn => fn(v)); }

function onPosition(pos) {
  const { latitude: lat, longitude: lon, accuracy } = pos.coords;
  const first = !fix;
  fix = { lat, lon, accuracy, ts: pos.timestamp };
  if (onIsland(lat, lon)) {
    setYou(lat, lon, true); paint('on');
    if (focusOnFix) { focusOnFix = false; focusPoint(ctx.you, 18); }
    if (first) bus.emit('snack', accuracy > 500 ? 'Found you (roughly). Routes now start from your location.' : 'Found you! Routes now start from your location.');
  } else {
    setYou(config.fallbackStart.lat, config.fallbackStart.lon, false); paint('away');
    if (!warnedAway) { warnedAway = true; bus.emit('snack', `You’re not in Mauritius right now, so routes start from ${config.fallbackStart.label}.`, 4500); }
  }
  bus.emit('you:moved', ctx.youLL);
  settle(true);
}

function onError(err) {
  if (err.code === err.PERMISSION_DENIED) {
    stop(); paint('off');
    bus.emit('snack', `Location is off for Zil. Routes start from ${config.fallbackStart.label}; allow location in your browser settings to change that.`, 5000);
  } else if (!fix) {
    paint('idle');
    bus.emit('snack', 'Couldn’t get your location just now. Try again in the open air.');
  }
  settle(false);
}

function stop() {
  if (watchId != null) { if (G) G.clearWatch({ id: watchId }).catch(() => {}); else navigator.geolocation.clearWatch(watchId); }
  watchId = null;
}

export function startTracking() {
  if (!supported()) {
    bus.emit('snack', window.isSecureContext ? 'This browser can’t share your location.' : 'Location needs a secure (HTTPS) connection.');
    paint('off'); return;
  }
  if (watchId != null) return;
  paint('busy');
  const opts = { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 };
  if (isNative()) { startNative(opts); return; }
  watchId = navigator.geolocation.watchPosition(onPosition, onError, opts);
}

// In the app, the native plugin asks Android for permission and reads the GPS.
async function startNative(opts) {
  watchId = 'pending';
  try {
    G ??= await nativeGeolocation();
    let p = await G.checkPermissions();
    if (p.location !== 'granted') p = await G.requestPermissions({ permissions: ['location'] });
    if (p.location !== 'granted') { watchId = null; onError(DENIED); return; }
    watchId = await G.watchPosition(opts, (pos, err) => (err ? onError({ code: 2 }) : pos && onPosition(pos)));
  } catch (e) { watchId = null; onError(/denied/i.test(e.message || '') ? DENIED : { code: 2 }); }
}

/** Resolves once we know where routes start: true = device location, false = fallback. */
export function ensureLocation(timeoutMs = 12000) {
  if (fix) return Promise.resolve(ctx.youLL.real);
  if (!supported() || btn.dataset.state === 'off') return Promise.resolve(false);
  startTracking();
  return new Promise(res => {
    waiting.push(res);
    setTimeout(() => { const i = waiting.indexOf(res); if (i >= 0) { waiting.splice(i, 1); res(false); } }, timeoutMs);
  });
}

export async function initLocation() {
  btn.innerHTML = ic('locate'); paint('idle');
  btn.addEventListener('click', () => {
    if (fix && ctx.youLL.real) { focusPoint(ctx.you, 18); return; }
    focusOnFix = true; startTracking();
  });
  // Already allowed on a previous visit? Track straight away without a prompt.
  if (isNative()) {
    try { G ??= await nativeGeolocation(); if ((await G.checkPermissions()).location === 'granted') startTracking(); } catch { /* wait for a tap */ }
    return;
  }
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' });
    if (p?.state === 'granted') startTracking();
    else if (p?.state === 'denied') paint('off');
  } catch { /* Permissions API unavailable (older Safari): wait for a tap */ }
}
