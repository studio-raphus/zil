// Moderation: community spots waiting for review. Approve (visible to everyone), reject, or
// promote a great one to a full Zil place (opens the place editor pre-filled).
import { api } from './api.js';
import { $, esc, ago } from './util.js';
import { ic } from '../core/icons.js';
import { createPicker } from './picker.js';

export default async function moderation(el, ctx) {
  let queue = await api.get('/spots/v1/moderation/queue');
  ctx.badge('moderation', queue.length);
  el.innerHTML = `<div class="card st-panel"><div class="st-list-head"><h1>Moderation <small>${queue.length} waiting</small></h1></div>
    <p class="muted">Spots travellers dropped on the map. They stay private to the person who added them until approved.</p>
    <div class="st-queue" id="mQ"></div></div>`;
  const box = $('#mQ', el);
  function render() {
    if (!queue.length) { box.innerHTML = '<p class="st-done">All caught up! 🎉</p>'; return; }
    box.innerHTML = queue.map(s => { const c = ctx.cats[s.cat] || {}; return `<article class="st-mcard" data-id="${s.id}">
      <div class="st-mmap" data-map></div>
      <div class="st-mtx"><div class="st-lhead"><span class="st-dot" style="--c:${c.color}">${ic(c.icon)}</span><b>${esc(s.name)}</b><span class="st-pill draft">${esc(c.one || s.cat)}</span></div>
        <p>${s.note ? esc(s.note) : '<span class="muted">No note.</span>'}</p>
        <p class="fine">Added ${ago(s.created_at)} · ${s.lat.toFixed(5)}, ${s.lon.toFixed(5)} · <a href="https://www.google.com/maps?q=${s.lat},${s.lon}" target="_blank" rel="noopener">open in Google Maps</a></p>
        <div class="actions"><button class="btn filled sm" type="button" data-act="approved">${ic('check')}Approve</button><button class="btn sm" type="button" data-act="rejected">${ic('close')}Reject</button><button class="btn tonal sm" type="button" data-act="promote">${ic('plus')}Promote to place</button></div>
      </div></article>`; }).join('');
    box.querySelectorAll('.st-mcard').forEach(card => { const s = queue.find(x => x.id === card.dataset.id); createPicker(card.querySelector('[data-map]'), { value: s, readonly: true }); });
  }
  box.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('.st-mcard').dataset.id, s = queue.find(x => x.id === id);
    if (b.dataset.act === 'promote') { ctx.go('places', { prefill: { name: s.name, short: s.name.slice(0, 24), cat: s.cat, lat: s.lat, lon: s.lon, blurb: s.note }, fromSpot: s.id }); return; }
    try {
      await api.patch(`/spots/v1/spots/${id}/status`, { status: b.dataset.act });
      queue = queue.filter(x => x.id !== id); ctx.badge('moderation', queue.length); render();
      ctx.snack(b.dataset.act === 'approved' ? `Approved: ${s.name} is on everyone’s map` : `Rejected: ${s.name}`);
    } catch (err) { ctx.snack(`Couldn’t update: ${err.message}`); }
  });
  render();
}
