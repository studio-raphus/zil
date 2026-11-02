// "Live now" story strip along the bottom, fed by the live service (and its SSE stream).
import { $, esc, timeAgo } from '../core/util.js';
import { ic } from '../core/icons.js';
import { bus } from '../core/bus.js';
import { state, byId, catOf } from '../core/state.js';

const strip = $('#strip');

export function renderStrip() {
  const seen = new Set();
  const items = state.feed.filter(f => byId(f.place_id) && !seen.has(f.place_id) && seen.add(f.place_id)).slice(0, 10);
  strip.innerHTML = '<div class="strip-label">LIVE<br>NOW</div>' + items.map(f => {
    const p = byId(f.place_id), c = catOf(p);
    return `<button class="story" type="button" data-id="${esc(p.id)}" style="--c:${c.color}"><span class="ic">${ic(c.icon)}</span><span class="tx"><b>${esc(p.short)}</b><span>${esc(f.text)}</span><small>${timeAgo(f.created_at)}</small></span></button>`;
  }).join('');
}

export function initStrip() {
  renderStrip();
  strip.addEventListener('click', e => { const b = e.target.closest('.story'); if (b) bus.emit('select', b.dataset.id); });
  setInterval(renderStrip, 60_000);
}
