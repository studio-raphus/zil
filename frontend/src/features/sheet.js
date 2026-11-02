// Place sheet (bottom sheet on phones, side panel on wide screens) and the select flow.
// Phase 1 views: place detail, community spot, add-a-spot form. Booking, AR and the
// assistant buttons only render when their feature flags are on (phase 2).
import { $, esc, isWide } from '../core/util.js';
import { ic } from '../core/icons.js';
import { bus } from '../core/bus.js';
import { state, byId, catOf } from '../core/state.js';
import { ctx } from '../map/ctx.js';
import { focusPoint } from '../map/engine.js';
import { drawRoute, clearRoute } from '../map/route.js';
import { setSelected } from './overlay.js';
import { config } from '../config.js';

const sheet = $('#sheet'), body = $('#sheetBody'), routeChip = $('#routeChip');
const view = { name: null, place: null, addCat: 'beach', near: null };

function fromYou(p) {
  const km = Math.hypot(p.pos.x - ctx.you.x, p.pos.z - ctx.you.z) * 1.35, m = Math.round(km / 38 * 60 + 5);
  return m < 60 ? `≈ ${m} min` : `≈ ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
function art(p) {
  const c = catOf(p);
  return `<div class="art" style="--c:${c.color}"><div class="burst"></div><span class="big">${ic(c.icon)}</span>${p.hot ? '<span class="livetag">LIVE</span>' : ''}<span class="cat">${p.user ? 'Community · ' : ''}${esc(c.one)}</span></div>`;
}

const RENDER = {
  detail: p => {
    const c = catOf(p), f = config.features;
    return `${art(p)}<h2 class="title" style="--c:${c.color}">${esc(p.name)}</h2>
      ${p.live ? `<div class="live-pill"><i></i>${esc(p.live)}</div>` : ''}
      <p class="blurb">${esc(p.blurb)}</p>
      <dl class="facts3"><div><dt>Time</dt><dd>${esc(p.time)}</dd></div><div><dt>Best</dt><dd>${esc(p.best)}</dd></div><div><dt>From you</dt><dd>${fromYou(p)}</dd></div></dl>
      <div class="actions">
        <button class="btn filled" type="button" data-act="route">${ic('route')}Route from my hotel</button>
        <span class="btn tonal" aria-disabled="true">${esc(p.cost)}</span>
        ${f.booking ? '<button class="btn" type="button" data-act="book">Book</button>' : ''}
        ${f.ar ? '<button class="btn" type="button" data-act="ar">AR</button>' : ''}
        ${f.assistant ? '<button class="btn" type="button" data-act="ask">Ask Dodo</button>' : ''}
      </div>
      <div class="didyou"><b>Did you know?</b>${esc(p.fact)}</div>
      <div class="tips">${(p.tips || []).map(t => `<span class="tip">${esc(t)}</span>`).join('')}</div>
      <p class="fine">Live info comes from Zil’s live feed and may change during the day.</p>`;
  },
  spot: p => `${art(p)}<h2 class="title" style="--c:${catOf(p).color}">${esc(p.name)}</h2>
      <div class="live-pill"><i></i>${p.status === 'approved' ? 'Community spot' : p.status === 'rejected' ? 'Not approved' : 'Pending review · only you can see it'}</div>
      <p class="blurb">${p.note ? esc(p.note) : '<span class="muted">No notes yet.</span>'}</p>
      <div class="actions"><button class="btn filled" type="button" data-act="route">${ic('route')}Route</button>${p.mine ? `<button class="btn" type="button" data-act="remove">${ic('trash')}Remove spot</button>` : ''}</div>
      <p class="fine">${state.offline ? 'Saved on this device only (offline mode).' : 'Community spots are checked by the Zil team before other travellers can see them.'}</p>`,
  add: () => `<h2 class="title" style="--c:var(--sun)">Drop a new spot</h2>
      <p class="muted" style="margin:0 0 16px">Pinned ${view.near ? 'near ' + esc(view.near.short) : 'on the island'}. Tell travellers what makes it special.</p>
      <form id="addForm" novalidate>
        <label class="field"><span class="lab">Name</span><input name="name" maxlength="40" placeholder="e.g. Secret snorkel cove" required></label>
        <div class="field"><span class="lab">Type</span><div class="seg">${Object.entries(state.cats).map(([k, c]) => `<button class="chip" type="button" style="--c:${c.color}" data-act="pickcat" data-k="${k}" aria-pressed="${k === view.addCat}"><span class="dot"></span>${ic('check', 'ck')}<span>${esc(c.one)}</span></button>`).join('')}</div></div>
        <label class="field"><span class="lab">Why go?</span><textarea name="note" rows="3" maxlength="200" placeholder="Best time, how to find it, what to bring…"></textarea></label>
        <div class="actions"><button class="btn filled" type="submit">${ic('check')}Save spot</button><button class="btn" type="button" data-act="close">Cancel</button></div>
        <p class="fine">New spots stay private until the Zil team approves them.</p>
      </form>`
};

export function openSheet(name, p, extra = {}) {
  Object.assign(view, { name, place: p }, extra);
  body.innerHTML = RENDER[name](p); sheet.scrollTop = 0;
  sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false'); document.body.classList.add('sheet-open');
}
export function closeSheet() {
  if (!sheet.classList.contains('open')) return;
  sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); document.body.classList.remove('sheet-open');
  state.selectedId = null; setSelected(null);
  if (view.name === 'add') bus.emit('add:cancel');
  view.name = null;
}
export const sheetView = () => view.name;
export const addCategory = () => view.addCat;

export function select(id) {
  const p = byId(id); if (!p) return;
  bus.emit('add:exit');
  state.selectedId = id; setSelected(id);
  focusPoint(p.pos);
  openSheet(p.user ? 'spot' : 'detail', p);
}

function showRoute(p) {
  const { km, minutes } = drawRoute([p], { sheetOpen: sheet.classList.contains('open') });
  const time = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;
  routeChip.innerHTML = `<span class="rc-ic">${ic('route')}</span><b>You → ${esc(p.short || p.name)}</b><span class="meta">≈ ${Math.round(km)} km · ${time} driving</span><button class="iconbtn sm" type="button" id="rcX" aria-label="Clear route">${ic('close')}</button>`;
  routeChip.hidden = false;
  $('#rcX').onclick = () => { clearRoute(); routeChip.hidden = true; };
}

export function initSheet() {
  bus.on('select', select);
  bus.on('map:empty', () => { if (view.name && view.name !== 'add') closeSheet(); });
  bus.on('escape', closeSheet);
  sheet.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const p = view.place, a = b.dataset.act;
    if (a === 'close') closeSheet();
    else if (a === 'route') { showRoute(p); if (!isWide()) closeSheet(); }
    else if (a === 'remove') bus.emit('spot:remove', p);
    else if (a === 'pickcat') {
      view.addCat = b.dataset.k;
      b.parentElement.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === b)));
      bus.emit('add:cat', view.addCat);
    }
  });
  sheet.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, name = f.name.value.trim();
    if (!name) { f.name.focus(); bus.emit('snack', 'Give your spot a name first'); return; }
    bus.emit('spot:save', { name, cat: view.addCat, note: f.note.value.trim() });
  });
}
