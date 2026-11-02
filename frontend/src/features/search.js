// Search box with keyboard-navigable results (client-side over places + spots).
import { $, esc, norm } from '../core/util.js';
import { ic } from '../core/icons.js';
import { bus } from '../core/bus.js';
import { allPlaces, byId, catOf } from '../core/state.js';

export function initSearch() {
  const q = $('#q'), results = $('#results'), clear = $('#qclear');
  let idx = 0, list = [];
  const close = () => { results.hidden = true; q.setAttribute('aria-expanded', 'false'); };
  const render = () => {
    const s = norm(q.value.trim()); clear.hidden = !q.value;
    if (!s) { close(); return; }
    list = allPlaces().filter(p => norm(`${p.name} ${p.tags || ''} ${catOf(p).label}`).includes(s)).slice(0, 7); idx = 0;
    results.innerHTML = list.length
      ? list.map((p, i) => `<button class="res${i === 0 ? ' active' : ''}" type="button" role="option" data-id="${esc(p.id)}" style="--c:${catOf(p).color}"><span class="ic">${ic(catOf(p).icon)}</span><span><b>${esc(p.name)}</b><small>${catOf(p).one}${p.live ? ' · ' + esc(p.live) : p.user ? ' · community spot' : ''}</small></span></button>`).join('')
      : `<div class="res-empty">No spots match “${esc(q.value)}”. Try “beach”, “waterfall” or “market”.</div>`;
    results.hidden = false; q.setAttribute('aria-expanded', 'true');
  };
  const pick = id => { q.value = byId(id).name; clear.hidden = false; close(); q.blur(); bus.emit('select', id); };

  q.addEventListener('input', render);
  q.addEventListener('focus', () => { if (q.value) render(); bus.emit('map:interact'); });
  q.addEventListener('keydown', e => {
    if (e.key === 'Escape') { q.value = ''; render(); q.blur(); return; }
    if (!list.length || results.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      results.querySelectorAll('.res').forEach((r, i) => r.classList.toggle('active', i === idx));
    }
    if (e.key === 'Enter') { e.preventDefault(); pick(list[idx].id); }
  });
  results.addEventListener('click', e => { const b = e.target.closest('.res'); if (b) pick(b.dataset.id); });
  clear.addEventListener('click', () => { q.value = ''; render(); q.focus(); });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.searchwrap')) close(); });
}
