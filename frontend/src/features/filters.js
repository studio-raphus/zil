// Category filter chips (All, categories from the catalog service, Live now).
import { $ } from '../core/util.js';
import { ic } from '../core/icons.js';
import { state } from '../core/state.js';
import { applyFilter } from './overlay.js';
import { filterHeats } from '../map/live.js';
import { snack } from './chrome.js';
import { bus } from '../core/bus.js';

export function initFilters() {
  const chips = $('#chips');
  const filters = [{ k: 'all', label: 'All', color: '#FFE14D' }]
    .concat(Object.entries(state.cats).map(([k, c]) => ({ k, label: c.label, color: c.color })))
    .concat(state.events.length ? [{ k: 'events', label: 'Events', color: '#45B8FF' }] : [])
    .concat([{ k: 'live', label: 'Live now', color: '#FF4F8B' }]);
  chips.innerHTML = filters.map(f => `<button class="chip" type="button" data-k="${f.k}" aria-pressed="${f.k === 'all'}" style="--c:${f.color}"><span class="dot"></span>${ic('check', 'ck')}<span>${f.label}</span></button>`).join('');
  chips.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.filter = state.filter === b.dataset.k && b.dataset.k !== 'all' ? 'all' : b.dataset.k;
    chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.k === state.filter)));
    const n = applyFilter(); filterHeats(state.filter); bus.emit('filter', state.filter);
    if (state.filter !== 'all') snack(state.filter === 'live' ? `${n} places buzzing right now` : state.filter === 'events' ? `${n} event${n === 1 ? '' : 's'} in the next 7 days` : `${n} ${state.cats[state.filter].label.toLowerCase()} on the map`);
  });
}
