// Community spots: add mode (tap the island), save to the spots service, remove your own.
import { $, coarse, isWide } from '../core/util.js';
import { bus } from '../core/bus.js';
import { state, catOf } from '../core/state.js';
import { api } from '../api/client.js';
import { ctx } from '../map/ctx.js';
import { toLatLon } from '../map/geo.js';
import { flyTo, azimuth } from '../map/engine.js';
import { addPin, removeOverlay, pinFor } from './overlay.js';
import { openSheet, closeSheet, select, addCategory } from './sheet.js';

let temp = null, tempPos = null, saving = false;

export function enterAdd() {
  closeSheet();
  state.addMode = true; $('#addBanner').hidden = false; $('#stage').classList.add('adding'); document.body.classList.add('adding');
  bus.emit('map:interact');
}
export function exitAdd() {
  state.addMode = false; $('#addBanner').hidden = true; $('#stage').classList.remove('adding'); document.body.classList.remove('adding');
}
function dropTemp() { if (temp) { removeOverlay(temp); temp = null; } }

function nearestPlace(pos) {
  let best = null, bd = 1e9;
  for (const p of state.places) { const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z); if (d < bd) { bd = d; best = p; } }
  return bd < 9 ? best : null;
}

function startAddAt(pt) {
  exitAdd();
  tempPos = pt.clone();
  temp = addPin({ id: 'temp', name: 'New spot', short: 'New spot', cat: addCategory(), pos: tempPos, temp: true });
  temp.el.classList.add('sel');
  openSheet('add', null, { near: nearestPlace(pt) });
  if (!isWide()) { const th = azimuth(), d = 26; flyTo(pt.x + Math.sin(th) * d * 0.3, pt.y * 0.5, pt.z + Math.cos(th) * d * 0.3, d, 0.95, th); }
  setTimeout(() => { const i = document.querySelector('#sheet input[name=name]'); if (i && !coarse) i.focus(); }, 380);
}

export function spotToPlace(s) {
  const { THREE } = ctx;
  const p = { ...s, user: true, short: s.name, live: '', tags: s.note || '' };
  p.pos = new THREE.Vector3(); // filled by main.placePosition
  return p;
}

export function initSpots({ placePosition }) {
  $('#fabAdd').addEventListener('click', enterAdd);
  $('#addCancel').addEventListener('click', exitAdd);
  bus.on('add:exit', () => { if (state.addMode) exitAdd(); });
  bus.on('escape', () => { if (state.addMode) exitAdd(); });
  bus.on('map:ground', startAddAt);
  bus.on('add:cancel', dropTemp);
  bus.on('add:cat', cat => { if (temp) temp.el.style.setProperty('--c', catOf({ cat }).color); });

  bus.on('spot:save', async ({ name, cat, note }) => {
    if (saving || !tempPos) return;
    saving = true;
    try {
      const { lat, lon } = toLatLon(tempPos.x, tempPos.z);
      const saved = await api.createSpot({ name, cat, note, lat, lon });
      const p = spotToPlace(saved); placePosition(p);
      state.spots.unshift(p);
      dropTemp();
      addPin(p); select(p.id);
      bus.emit('snack', 'Pinned! Only you can see it until it’s reviewed.');
    } catch (e) {
      bus.emit('snack', `Couldn’t save the spot: ${e.message}`);
    } finally { saving = false; }
  });

  bus.on('spot:remove', async p => {
    try {
      await api.deleteSpot(p.id);
      state.spots = state.spots.filter(s => s.id !== p.id);
      const o = pinFor(p.id); if (o) removeOverlay(o);
      closeSheet(); bus.emit('snack', 'Spot removed');
    } catch (e) { bus.emit('snack', `Couldn’t remove it: ${e.message}`); }
  });
}
