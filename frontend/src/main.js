// Zil Phase 1 entry: load data from the services, build the 3D island, wire the features.
import './styles/app.css';
import { api } from './api/client.js';
import { state, byId } from './core/state.js';
import { $ } from './core/util.js';
import { ctx } from './map/ctx.js';
import { ll, groundY } from './map/geo.js';
import { initEngine, home, northUp, setNight } from './map/engine.js';
import { syncHeats } from './map/live.js';
import { initChrome, setOfflineBadge, showFallback, snack } from './features/chrome.js';
import { initOverlay, addPin, refreshPin } from './features/overlay.js';
import { initFilters } from './features/filters.js';
import { initSearch } from './features/search.js';
import { initStrip, renderStrip } from './features/livestrip.js';
import { initSheet } from './features/sheet.js';
import { initSpots, spotToPlace } from './features/spots.js';

function placePosition(p) {
  const q = ll(p.lat, p.lon);
  p.pos = new ctx.THREE.Vector3(q.x, groundY(q.x, q.z) + 0.05, q.z);
  return p;
}

function applyStatus(s) {
  const p = byId(s.place_id); if (!p) return;
  p.live = s.text; p.hot = !!s.hot;
}

async function boot() {
  const data = await api.bootstrap();
  state.cats = Object.fromEntries(data.categories.map(c => [c.id, c]));
  state.places = data.places.map(p => ({ ...p }));
  data.status.forEach(applyStatus);
  state.feed = data.feed;

  try {
    initEngine($('#stage'));
  } catch (e) {
    showFallback(e, state.places);
    return;
  }

  state.places.forEach(placePosition);
  state.spots = data.spots.map(s => placePosition(spotToPlace(s)));

  initChrome({ onHome: home, onNorth: northUp, onNight: setNight });
  if (api.offline) setOfflineBadge(true);
  initOverlay(ctx.avatars);
  state.places.forEach(addPin);
  state.spots.forEach(addPin);
  syncHeats();
  initFilters();
  initSearch();
  initStrip();
  initSheet();
  initSpots({ placePosition });

  api.subscribeLive(s => {
    applyStatus(s);
    const p = byId(s.place_id); if (!p) return;
    refreshPin(p); syncHeats();
    state.feed.unshift({ id: Date.now(), place_id: s.place_id, text: s.text, created_at: s.updated_at || new Date().toISOString() });
    renderStrip();
    snack(`${p.short}: ${s.text}`);
  });
}

boot().catch(e => { console.error(e); showFallback(e, state.places); });
