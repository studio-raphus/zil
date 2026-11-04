// Street map: real streets under the toon island. Zoom all the way into the 3D island (or tap
// the map button) and a MapLibre map takes over at the same spot, drawn from Zil's own
// Mauritius tiles (PMTiles) in Zil colours, with the same pins, your location and the road
// route. Zoom back out and you return to the island. The map can be saved for offline use.
// MapLibre and the tile libraries load only when the street map is first opened.
import { $, esc, store } from '../core/util.js';
import { ic } from '../core/icons.js';
import { bus } from '../core/bus.js';
import { state, allPlaces, catOf } from '../core/state.js';
import { config } from '../config.js';
import { ctx } from '../map/ctx.js';
import { ll, toLatLon } from '../map/geo.js';
import { flyTo, azimuth } from '../map/engine.js';

const CACHE = 'zil-tiles-v1';
const FONTS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
const RANGES = ['0-255', '256-511', '512-767', '768-1023', '7936-8191', '8192-8447'];
const abs = p => new URL(p, location.href).href;
const PMTILES_URL = abs(`${config.tilesBase}/mauritius.pmtiles`);

const host = document.createElement('div');
host.id = 'street'; host.className = 'street'; host.hidden = true; host.setAttribute('aria-label', 'Street map');
const mapEl = document.createElement('div'); mapEl.className = 'street-map'; host.appendChild(mapEl); // MapLibre styles its own container
document.getElementById('stage').after(host);
const btn = $('#fabStreet'), saveBtn = $('#fabSave');

let ml = null, bm = null, map = null, open = false, loading = null, cooldown = 0, lastZoomIn = 0;
const markers = new Map();
let youMarker = null, route = null; // route: { coords: [[lat,lon],...] }

// ---------- style: Protomaps basemap layers with Zil's palette ----------
const ZIL_DAY = {
  background: '#45B8FF', water: '#45B8FF', earth: '#FFF3C4', park_a: '#A6E8B4', park_b: '#86DD9C', wood_a: '#86DD9C', wood_b: '#6BD188',
  scrub_a: '#C4EDB0', scrub_b: '#B2E6A0', sand: '#FFE7A3', beach: '#FFE7A3', buildings: '#FFD9A0', pedestrian: '#FFF8DC',
  highway: '#FFFFFF', major: '#FFFFFF', minor_a: '#FFFFFF', minor_b: '#FFFFFF', link: '#FFFFFF', other: '#FFFDF4',
  highway_casing_early: '#1B1A2E', highway_casing_late: '#1B1A2E', major_casing_early: '#1B1A2E', major_casing_late: '#1B1A2E',
  minor_casing: '#5F5A73', link_casing: '#5F5A73', minor_service_casing: '#8C879E',
  city_label: '#1B1A2E', city_label_halo: '#FFFFFF', subplace_label: '#5F5A73', subplace_label_halo: '#FFFFFF', ocean_label: '#0B4F7A',
  roads_label_major: '#1B1A2E', roads_label_major_halo: '#FFFFFF', roads_label_minor: '#5F5A73', roads_label_minor_halo: '#FFFFFF'
};
function style() {
  const flavor = { ...bm.namedFlavor(ctx.night ? 'dark' : 'light'), ...(ctx.night ? { water: '#1C2E6B', background: '#1C2E6B' } : ZIL_DAY) };
  delete flavor.pois; // Zil's own pins replace the generic POI icons (and no sprite sheet is needed)
  const layers = bm.layers('protomaps', flavor, { lang: 'en' }).filter(l => !(l.layout && l.layout['icon-image']));
  return {
    version: 8,
    glyphs: `${abs(config.tilesBase)}/fonts/{fontstack}/{range}.pbf`, // tokens must stay unencoded
    sources: { protomaps: { type: 'vector', url: `pmtiles://${PMTILES_URL}`, attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
    layers
  };
}

async function loadLibs() {
  if (ml) return;
  const [mlMod, pm, basemaps] = await Promise.all([import('maplibre-gl'), import('pmtiles'), import('@protomaps/basemaps'), import('maplibre-gl/dist/maplibre-gl.css')]);
  ml = mlMod.default || mlMod; bm = basemaps;
  const protocol = new pm.Protocol();
  ml.addProtocol('pmtiles', protocol.tile);
}

// ---------- pins, you, route ----------
function pinEl(p) {
  const c = catOf(p), el = document.createElement('button');
  el.type = 'button';
  el.className = 'spin' + (p.hot ? ' hot' : '') + (p.event ? ' event' : '') + (p.user ? ' user' : '');
  el.style.setProperty('--c', c.color);
  el.setAttribute('aria-label', `${p.name}, ${c.one}${p.live ? ', ' + p.live : ''}`);
  el.innerHTML = `<span class="pin-body">${p.live ? `<span class="pin-badge">${esc(p.live)}</span>` : ''}<span class="pin-head">${ic(c.icon)}</span><span class="pin-label">${esc(p.short || p.name)}</span></span>`;
  el.addEventListener('click', e => { e.stopPropagation(); bus.emit('select', p.id); });
  return el;
}
const visible = p => { const f = state.filter; return f === 'all' || (f === 'live' ? p.hot : f === 'events' ? p.event : p.cat === f); };

function syncMarkers() {
  if (!map) return;
  const want = new Set();
  for (const p of allPlaces()) {
    if (p.temp || p.lat == null) continue;
    want.add(p.id);
    let m = markers.get(p.id);
    if (!m) { m = new ml.Marker({ element: pinEl(p), anchor: 'center' }).setLngLat([p.lon, p.lat]).addTo(map); markers.set(p.id, m); }
    m.getElement().hidden = !visible(p);
    m.getElement().classList.toggle('sel', state.selectedId === p.id);
  }
  for (const [id, m] of markers) if (!want.has(id)) { m.remove(); markers.delete(id); }
}
function refreshMarker(p) {
  const m = markers.get(p.id); if (!m) return;
  m.remove(); markers.delete(p.id); syncMarkers(); // recreated with the new badge
}

function syncYou() {
  if (!map) return;
  const y = ctx.youLL;
  if (!y?.real) { youMarker?.remove(); youMarker = null; return; }
  if (!youMarker) { const el = document.createElement('div'); el.className = 'you-dot'; el.title = 'You'; youMarker = new ml.Marker({ element: el }).setLngLat([y.lon, y.lat]).addTo(map); }
  else youMarker.setLngLat([y.lon, y.lat]);
}

function routeData() {
  const coords = route ? route.coords.map(([lat, lon]) => [lon, lat]) : [];
  return { type: 'FeatureCollection', features: coords.length ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : [] };
}
function addRouteLayers() {
  if (!map.getSource('route')) {
    map.addSource('route', { type: 'geojson', data: routeData() });
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#1B1A2E', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 16, 12] } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#FF5A36', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 7] } });
  }
}
function showRoute(fit) {
  if (!map?.isStyleLoaded()) return;
  addRouteLayers(); map.getSource('route').setData(routeData());
  if (fit && route?.coords.length > 1) {
    const b = new ml.LngLatBounds(); route.coords.forEach(([lat, lon]) => b.extend([lon, lat]));
    map.fitBounds(b, { padding: { top: 140, bottom: 140, left: 60, right: 60 }, maxZoom: 16, duration: 900 });
  }
}

// ---------- enter / leave ----------
function paint() {
  btn.setAttribute('aria-pressed', String(open));
  btn.setAttribute('aria-label', open ? 'Back to the 3D island' : 'Street map');
  btn.innerHTML = ic(open ? 'island' : 'map');
  saveBtn.hidden = !open;
  saveBtn.dataset.saved = String(!!store.get('zil.offlineMap', null));
}

export async function enterStreet(center) {
  if (open || loading || Date.now() < cooldown) return;
  const t = ctx.controls.target, c = center || toLatLon(t.x, t.z);
  btn.dataset.busy = 'true';
  try { await (loading = loadLibs()); }
  catch (e) { console.warn('[zil] street map failed to load', e); bus.emit('snack', 'The street map couldn’t load. Check your connection.'); return; }
  finally { loading = null; delete btn.dataset.busy; }

  open = true; ctx.paused = true; host.hidden = false; document.body.classList.add('street');
  const view = { center: [c.lon, c.lat], zoom: 14.6, bearing: -azimuth() * 180 / Math.PI, pitch: 0 };
  if (!map) {
    map = new ml.Map({ container: mapEl, style: style(), ...view, minZoom: 9, maxZoom: 19, maxBounds: [[56.9, -20.95], [58.2, -19.55]], attributionControl: { compact: true }, dragRotate: true, cooperativeGestures: false });
    map.on('load', () => { showRoute(false); });
    // Only a zoom-out by the user goes back to the island (fitting a long route may zoom out too).
    let userAt = 0, z0 = 14;
    for (const ev of ['wheel', 'touchstart', 'mousedown', 'dblclick']) map.getCanvasContainer().addEventListener(ev, () => { userAt = Date.now(); }, { passive: true });
    map.on('zoomstart', () => { z0 = map.getZoom(); });
    map.on('zoomend', () => { const z = map.getZoom(); if (open && Date.now() - userAt < 2000 && z < z0 - 0.05 && z < 11.6) leaveStreet(); });
    map.on('error', e => {
      const msg = String(e?.error?.message || e?.message || '');
      console.warn('[zil] street map:', msg);
      if (/mauritius\.pmtiles|404|Failed to fetch/i.test(msg) && !map._zilWarned) { map._zilWarned = true; bus.emit('snack', 'Street tiles aren’t available yet. Build them with: docker compose build tiles', 6000); }
    });
  } else { map.jumpTo(view); map.resize(); }
  syncMarkers(); syncYou(); showRoute(false);
  paint();
  if (!store.get('zil.streetHint', false)) { store.set('zil.streetHint', true); bus.emit('snack', 'Street map! Zoom out to fly back to the island.', 4000); }
}

export function leaveStreet() {
  if (!open) return;
  const c = map.getCenter(), p = ll(c.lat, c.lng), th = -map.getBearing() * Math.PI / 180;
  open = false; ctx.paused = false; host.hidden = true; document.body.classList.remove('street');
  cooldown = Date.now() + 1500;
  flyTo(p.x, 0, p.z, 13, 0.9, th, 900);
  paint();
}

export function setStreetNight() {
  if (!map) return;
  map.setStyle(style());
  map.once('styledata', () => showRoute(false));
}

// ---------- offline ----------
async function saveOffline() {
  if (!('caches' in window)) { bus.emit('snack', 'This browser can’t save maps offline.'); return; }
  if (store.get('zil.offlineMap', null)) { bus.emit('snack', 'The street map is already saved on this device.'); return; }
  saveBtn.disabled = true;
  try {
    const res = await fetch(PMTILES_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = +res.headers.get('content-length') || 0, reader = res.body.getReader(), chunks = [];
    let got = 0, lastPct = -10;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      chunks.push(value); got += value.length;
      const pct = total ? Math.floor(got / total * 100) : 0;
      if (pct >= lastPct + 10) { lastPct = pct; bus.emit('snack', `Saving the street map… ${pct}%`, 8000); }
    }
    const blob = new Blob(chunks, { type: 'application/octet-stream' }), cache = await caches.open(CACHE);
    await cache.put(PMTILES_URL, new Response(blob, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(blob.size) } }));
    await Promise.all(FONTS.flatMap(f => RANGES.map(r => cache.add(abs(`${config.tilesBase}/fonts/${encodeURIComponent(f)}/${r}.pbf`)).catch(() => {}))));
    store.set('zil.offlineMap', { bytes: blob.size, at: Date.now() });
    bus.emit('snack', `Street map saved for offline use (${(blob.size / 1e6).toFixed(blob.size < 1e7 ? 1 : 0)} MB).`);
  } catch (e) {
    bus.emit('snack', `Couldn’t save the map: ${e.message}`);
  } finally { saveBtn.disabled = false; paint(); }
}

// ---------- wiring ----------
export function initStreet() {
  paint();
  btn.addEventListener('click', () => (open ? leaveStreet() : enterStreet()));
  saveBtn.innerHTML = ic('download');
  saveBtn.addEventListener('click', saveOffline);

  // Zooming in past the closest 3D view opens the street map at that spot.
  const stage = $('#stage');
  stage.addEventListener('wheel', e => { if (e.deltaY < 0) lastZoomIn = Date.now(); }, { passive: true });
  let pinch = 0;
  stage.addEventListener('touchmove', e => {
    if (e.touches.length !== 2) { pinch = 0; return; }
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (pinch && d > pinch + 2) lastZoomIn = Date.now();
    pinch = d;
  }, { passive: true });
  bus.on('frame', r => { if (!open && r <= ctx.controls.minDistance + 0.25 && Date.now() - lastZoomIn < 450) enterStreet(); });

  // While the street map is up, these buttons act on it.
  $('#compass').addEventListener('click', e => { if (open) { e.stopImmediatePropagation(); map.easeTo({ bearing: 0, pitch: 0 }); } }, true);
  $('#fabHome').addEventListener('click', () => { if (open) leaveStreet(); }, true);
  $('#fabAdd').addEventListener('click', () => { if (open) leaveStreet(); }, true); // spots are dropped on the 3D island

  bus.on('select', id => {
    if (!open) return;
    const p = allPlaces().find(x => x.id === id); syncMarkers();
    if (p) map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 15), padding: matchMedia('(min-width:900px)').matches ? { left: 420 } : { bottom: innerHeight * 0.45 }, duration: 700 });
  });
  bus.on('filter', syncMarkers);
  bus.on('place:updated', p => { if (open) refreshMarker(p); });
  bus.on('you:moved', syncYou);
  bus.on('route:shown', r => { route = r; if (open) showRoute(true); });
  bus.on('route:cleared', () => { route = null; if (open) showRoute(false); });
}
export const streetOpen = () => open;
// Debug handle (only with ?debug in the URL): window.zilStreet.map is the MapLibre instance.
if (/[?&]debug\b/.test(location.search)) window.zilStreet = { get map() { return map; }, style: () => style() };
