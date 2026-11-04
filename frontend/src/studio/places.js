// Places: list + editor (English and French), map pin, publish toggle.
import { api } from './api.js';
import { $, $$, esc, ago, parseCoords, confirmClick } from './util.js';
import { ic } from '../core/icons.js';
import { createPicker } from './picker.js';

const EMPTY = { name: '', short: '', cat: '', lat: null, lon: null, time: '', best: '', cost: '', blurb: '', fact: '', tips: [], tags: '', translations: {}, published: false };

export default async function places(el, ctx, params = {}) {
  let filter = { q: '', cat: '' }, editing = null, fromSpot = null;

  el.innerHTML = `<div class="st-split">
    <section class="st-list card" aria-label="Places">
      <div class="st-list-head">
        <h1>Places <small id="pCount"></small></h1>
        <button class="btn filled sm" type="button" id="pNew">${ic('plus')}New place</button>
      </div>
      <div class="st-filters">
        <input class="st-input" id="pQ" type="search" placeholder="Search places…" aria-label="Search places">
        <select class="st-input" id="pCat" aria-label="Category"><option value="">All categories</option>${Object.values(ctx.cats).map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select>
      </div>
      <div class="st-rows" id="pRows"></div>
    </section>
    <section class="st-editor card" id="pEditor" aria-label="Place editor"><p class="muted st-empty">Pick a place on the left, or create a new one.</p></section>
  </div>`;

  const rows = $('#pRows', el), editor = $('#pEditor', el);

  function renderList() {
    const q = filter.q.toLowerCase();
    const list = ctx.places.filter(p => (!filter.cat || p.cat === filter.cat) && (!q || `${p.name} ${p.tags}`.toLowerCase().includes(q)));
    $('#pCount', el).textContent = `${ctx.places.length}`;
    rows.innerHTML = list.map(p => { const c = ctx.cats[p.cat] || {}; return `
      <button class="st-row${editing && editing.id === p.id ? ' on' : ''}" type="button" data-id="${esc(p.id)}">
        <span class="st-dot" style="--c:${c.color}">${ic(c.icon)}</span>
        <span class="st-row-tx"><b>${esc(p.name)}</b><small>${esc(c.one || p.cat)} · edited ${ago(p.updated_at)}</small></span>
        <span class="st-pill ${p.published ? 'live' : 'draft'}">${p.published ? 'Live' : 'Draft'}</span>
      </button>`; }).join('') || '<p class="muted st-empty">No places match.</p>';
  }

  function field(name, label, value, { area = false, max = 80, hint = '', ph = '' } = {}) {
    const v = esc(value ?? '');
    return `<label class="field"><span class="lab">${label}</span>${area
      ? `<textarea name="${name}" rows="3" maxlength="${max}" placeholder="${ph}">${v}</textarea>`
      : `<input name="${name}" maxlength="${max}" value="${v}" placeholder="${ph}">`}${hint ? `<small class="st-hint">${hint}</small>` : ''}</label>`;
  }

  function openEditor(p) {
    editing = p ? { ...p } : { ...EMPTY, ...(params.prefill || {}) };
    fromSpot = p ? null : params.fromSpot || null; params = {};
    const fr = editing.translations?.fr || {};
    editor.innerHTML = `<form id="pForm" novalidate>
      <div class="st-ed-head">
        <h2>${p ? esc(p.name) : fromSpot ? 'Promote community spot' : 'New place'}</h2>
        <label class="st-switch"><input type="checkbox" name="published" ${editing.published ? 'checked' : ''}><span></span>Published</label>
      </div>
      <fieldset><legend>Basics</legend>
        <div class="st-2">${field('name', 'Name', editing.name, { ph: 'e.g. Pointe aux Piments' })}${field('short', 'Short name (map label)', editing.short, { max: 24, ph: 'e.g. Piments' })}</div>
        <div class="field"><span class="lab">Category</span><div class="seg">${Object.values(ctx.cats).map(c => `<button class="chip" type="button" data-cat="${c.id}" style="--c:${c.color}" aria-pressed="${editing.cat === c.id}"><span class="dot"></span>${ic('check', 'ck')}<span>${esc(c.one)}</span></button>`).join('')}</div></div>
      </fieldset>
      <fieldset><legend>Location</legend>
        <div class="st-loc"><div class="st-picker" id="pPick"></div>
          <div>
            <div class="st-2">${field('lat', 'Latitude', editing.lat ?? '', { max: 12, ph: '-20.1234' })}${field('lon', 'Longitude', editing.lon ?? '', { max: 12, ph: '57.5678' })}</div>
            <label class="field"><span class="lab">Paste a map link</span><input name="link" placeholder="Google Maps link or “-20.1, 57.5”"><small class="st-hint">Right-click the spot in Google Maps, copy the coordinates, paste here.</small></label>
          </div></div>
      </fieldset>
      <fieldset><legend>Visit info</legend>
        <div class="st-3">${field('time', 'Time needed', editing.time, { max: 40, ph: '2–3 h' })}${field('best', 'Best time', editing.best, { max: 40, ph: 'Morning' })}${field('cost', 'Cost', editing.cost, { max: 60, ph: 'Free' })}</div>
        ${field('blurb', 'Description', editing.blurb, { area: true, max: 600 })}
        ${field('fact', 'Did you know?', editing.fact, { area: true, max: 600 })}
        ${field('tips', 'Tips (one per line, up to 10)', (editing.tips || []).join('\n'), { area: true, max: 900 })}
        ${field('tags', 'Search tags', editing.tags, { max: 200, ph: 'snorkel lagoon family', hint: 'Extra words people might search for.' })}
      </fieldset>
      <fieldset><legend>Français</legend>
        <div class="st-2">${field('fr_name', 'Nom', fr.name)}${field('fr_short', 'Nom court', fr.short, { max: 24 })}</div>
        ${field('fr_blurb', 'Description', fr.blurb, { area: true, max: 600 })}
        ${field('fr_fact', 'Le saviez-vous ?', fr.fact, { area: true, max: 600 })}
        ${field('fr_tips', 'Conseils (un par ligne)', (fr.tips || []).join('\n'), { area: true, max: 900 })}
      </fieldset>
      <div class="actions st-sticky">
        <button class="btn filled" type="submit">${ic('check')}${p ? 'Save changes' : 'Create place'}</button>
        ${p ? `<button class="btn" type="button" id="pDel">${ic('trash')}Delete</button>` : ''}
        ${p?.updated_by ? `<span class="fine">Last edit by ${esc(p.updated_by)}, ${ago(p.updated_at)}</span>` : ''}
      </div>
    </form>`;

    const f = $('#pForm', editor);
    const picker = createPicker($('#pPick', editor), {
      value: editing.lat != null ? editing : null,
      others: ctx.places.filter(x => !p || x.id !== p.id).map(x => ({ lat: x.lat, lon: x.lon, name: x.name, color: ctx.cats[x.cat]?.color })),
      onPick: v => { f.lat.value = v.lat; f.lon.value = v.lon; }
    });
    const syncPin = () => picker.set({ lat: parseFloat(f.lat.value), lon: parseFloat(f.lon.value) });
    f.lat.addEventListener('input', syncPin); f.lon.addEventListener('input', syncPin);
    f.link.addEventListener('input', () => { const c = parseCoords(f.link.value); if (c) { f.lat.value = c.lat; f.lon.value = c.lon; syncPin(); ctx.snack('Coordinates picked up from the link'); } });
    $$('[data-cat]', f).forEach(b => b.addEventListener('click', () => { editing.cat = b.dataset.cat; $$('[data-cat]', f).forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
    if (p) confirmClick($('#pDel', f), 'Delete', async () => {
      await api.del(`/catalog/v1/admin/places/${encodeURIComponent(p.id)}`);
      ctx.snack(`${p.name} deleted`); await ctx.refreshPlaces(); editing = null; renderList();
      editor.innerHTML = '<p class="muted st-empty">Deleted. Pick another place or create a new one.</p>';
    });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const lines = s => s.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 10);
      const lat = parseFloat(f.lat.value), lon = parseFloat(f.lon.value);
      if (!f.name.value.trim()) { ctx.snack('Give the place a name'); f.name.focus(); return; }
      if (!editing.cat) { ctx.snack('Choose a category'); return; }
      if (!isFinite(lat) || !isFinite(lon)) { ctx.snack('Place the pin on the map (or paste coordinates)'); return; }
      const frT = { name: f.fr_name.value.trim(), short: f.fr_short.value.trim(), blurb: f.fr_blurb.value.trim(), fact: f.fr_fact.value.trim(), tips: lines(f.fr_tips.value) };
      Object.keys(frT).forEach(k => { if (!frT[k] || (Array.isArray(frT[k]) && !frT[k].length)) delete frT[k]; });
      const body = {
        name: f.name.value.trim(), short: f.short.value.trim() || f.name.value.trim().slice(0, 24), cat: editing.cat, lat, lon,
        time: f.time.value.trim(), best: f.best.value.trim(), cost: f.cost.value.trim(), blurb: f.blurb.value.trim(), fact: f.fact.value.trim(),
        tips: lines(f.tips.value), tags: f.tags.value.trim(), translations: { ...(editing.translations || {}), fr: frT }, published: f.published.checked
      };
      try {
        const saved = p ? await api.patch(`/catalog/v1/admin/places/${encodeURIComponent(p.id)}`, body) : await api.post('/catalog/v1/admin/places', body);
        if (fromSpot) { await api.del(`/spots/v1/spots/${fromSpot}`).catch(() => {}); ctx.snack(`Promoted to a place: ${saved.name}`); }
        else ctx.snack(p ? 'Saved' : `Created ${saved.name}${saved.published ? '' : ' (draft)'}`);
        await ctx.refreshPlaces(); renderList(); openEditor(ctx.places.find(x => x.id === saved.id));
      } catch (err) { ctx.snack(`Couldn’t save: ${err.message}`, 5000); }
    });
    renderList();
    if (!matchMedia('(min-width: 1000px)').matches) editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  rows.addEventListener('click', e => { const b = e.target.closest('.st-row'); if (b) openEditor(ctx.places.find(p => p.id === b.dataset.id)); });
  $('#pNew', el).addEventListener('click', () => openEditor(null));
  $('#pQ', el).addEventListener('input', e => { filter.q = e.target.value; renderList(); });
  $('#pCat', el).addEventListener('change', e => { filter.cat = e.target.value; renderList(); });
  renderList();
  if (params.prefill) openEditor(null);
}
