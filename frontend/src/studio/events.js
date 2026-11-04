// Events: night markets, festivals, food fairs. One-off or weekly, at a place or at their own pin.
import { api } from './api.js';
import { $, $$, esc, toLocalInput, fromLocalInput, parseCoords, confirmClick } from './util.js';
import { ic } from '../core/icons.js';
import { createPicker } from './picker.js';

const fmt = iso => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const DAY = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const when = e => e.repeat_weekly
  ? `Every ${DAY[new Date(e.starts_at).getDay()].slice(0, -1)}, ${new Date(e.starts_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}${e.repeat_until ? ` until ${new Date(e.repeat_until).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}`
  : fmt(e.starts_at);
const isPast = e => !e.repeat_weekly && new Date(e.ends_at) < new Date();

export default async function events(el, ctx) {
  let list = await api.get('/catalog/v1/admin/events'), editing = null;

  el.innerHTML = `<div class="st-split">
    <section class="st-list card" aria-label="Events">
      <div class="st-list-head"><h1>Events <small>${list.length}</small></h1><button class="btn filled sm" type="button" id="eNew">${ic('plus')}New event</button></div>
      <div class="st-rows" id="eRows"></div>
    </section>
    <section class="st-editor card" id="eEditor" aria-label="Event editor"><p class="muted st-empty">Night market, food festival, live music… Create an event and it appears on the map while it’s on and in the days before.</p></section>
  </div>`;
  const rows = $('#eRows', el), editor = $('#eEditor', el);

  function renderList() {
    rows.innerHTML = list.map(e => { const c = ctx.cats[e.cat] || {}; return `
      <button class="st-row${editing?.id === e.id ? ' on' : ''}${isPast(e) ? ' past' : ''}" type="button" data-id="${e.id}">
        <span class="st-dot" style="--c:${c.color}">${ic(c.icon)}</span>
        <span class="st-row-tx"><b>${esc(e.title)}</b><small>${esc(when(e))} · ${esc(e.place_name || e.venue || 'own pin')}</small></span>
        <span class="st-pill ${isPast(e) ? 'draft' : e.published ? 'live' : 'draft'}">${isPast(e) ? 'Past' : e.published ? 'Live' : 'Draft'}</span>
      </button>`; }).join('') || '<p class="muted st-empty">No events yet.</p>';
  }

  function openEditor(ev) {
    const now = new Date(); now.setMinutes(0, 0, 0); now.setHours(now.getHours() + 24);
    editing = ev ? { ...ev } : { title: '', cat: 'food', place_id: null, own_lat: null, own_lon: null, venue: '', blurb: '', price: '', starts_at: now.toISOString(), ends_at: new Date(now.getTime() + 3 * 3600000).toISOString(), repeat_weekly: false, repeat_until: null, translations: {}, published: true };
    const atPlace = ev ? !!ev.place_id : true, fr = editing.translations?.fr || {};
    editor.innerHTML = `<form id="eForm" novalidate>
      <div class="st-ed-head"><h2>${ev ? esc(ev.title) : 'New event'}</h2>
        <label class="st-switch"><input type="checkbox" name="published" ${editing.published ? 'checked' : ''}><span></span>Published</label></div>
      <fieldset><legend>What</legend>
        <label class="field"><span class="lab">Title</span><input name="title" maxlength="80" value="${esc(editing.title)}" placeholder="e.g. Port Louis night market"></label>
        <div class="field"><span class="lab">Category</span><div class="seg">${Object.values(ctx.cats).map(c => `<button class="chip" type="button" data-cat="${c.id}" style="--c:${c.color}" aria-pressed="${editing.cat === c.id}"><span class="dot"></span>${ic('check', 'ck')}<span>${esc(c.one)}</span></button>`).join('')}</div></div>
        <label class="field"><span class="lab">Description</span><textarea name="blurb" rows="3" maxlength="600">${esc(editing.blurb)}</textarea></label>
        <label class="field"><span class="lab">Price</span><input name="price" maxlength="60" value="${esc(editing.price)}" placeholder="Free entry · Rs 150"></label>
      </fieldset>
      <fieldset><legend>When</legend>
        <div class="st-2">
          <label class="field"><span class="lab">Starts</span><input type="datetime-local" name="starts" value="${toLocalInput(editing.starts_at)}"></label>
          <label class="field"><span class="lab">Ends</span><input type="datetime-local" name="ends" value="${toLocalInput(editing.ends_at)}"></label>
        </div>
        <label class="st-switch"><input type="checkbox" name="weekly" ${editing.repeat_weekly ? 'checked' : ''}><span></span>Repeats every week (same day and hours)</label>
        <label class="field st-until" ${editing.repeat_weekly ? '' : 'hidden'}><span class="lab">Last date (optional)</span><input type="date" name="until" value="${editing.repeat_until ? String(editing.repeat_until).slice(0, 10) : ''}"></label>
      </fieldset>
      <fieldset><legend>Where</legend>
        <div class="seg st-where">
          <button class="chip" type="button" data-where="place" aria-pressed="${atPlace}" style="--c:var(--sun)">${ic('check', 'ck')}<span>At a Zil place</span></button>
          <button class="chip" type="button" data-where="pin" aria-pressed="${!atPlace}" style="--c:var(--sun)">${ic('check', 'ck')}<span>Somewhere else</span></button>
        </div>
        <label class="field st-at-place" ${atPlace ? '' : 'hidden'}><span class="lab">Place</span><select class="st-input" name="place_id"><option value="">Choose…</option>${ctx.places.map(p => `<option value="${esc(p.id)}" ${editing.place_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <div class="st-at-pin" ${atPlace ? 'hidden' : ''}>
          <label class="field"><span class="lab">Venue name</span><input name="venue" maxlength="80" value="${esc(editing.venue)}" placeholder="e.g. Caudan Waterfront car park"></label>
          <div class="st-loc"><div class="st-picker" id="ePick"></div><div>
            <div class="st-2"><label class="field"><span class="lab">Latitude</span><input name="lat" value="${editing.own_lat ?? ''}"></label><label class="field"><span class="lab">Longitude</span><input name="lon" value="${editing.own_lon ?? ''}"></label></div>
            <label class="field"><span class="lab">Paste a map link</span><input name="link" placeholder="Google Maps link or “-20.1, 57.5”"></label>
          </div></div>
        </div>
      </fieldset>
      <fieldset><legend>Français</legend>
        <label class="field"><span class="lab">Titre</span><input name="fr_title" maxlength="80" value="${esc(fr.title || '')}"></label>
        <label class="field"><span class="lab">Description</span><textarea name="fr_blurb" rows="3" maxlength="600">${esc(fr.blurb || '')}</textarea></label>
      </fieldset>
      <div class="actions st-sticky"><button class="btn filled" type="submit">${ic('check')}${ev ? 'Save changes' : 'Create event'}</button>${ev ? `<button class="btn" type="button" id="eDel">${ic('trash')}Delete</button>` : ''}</div>
    </form>`;

    const f = $('#eForm', editor);
    let where = atPlace ? 'place' : 'pin';
    const picker = createPicker($('#ePick', editor), { value: editing.own_lat != null ? { lat: editing.own_lat, lon: editing.own_lon } : null, others: ctx.places.map(p => ({ lat: p.lat, lon: p.lon, name: p.name, color: ctx.cats[p.cat]?.color })), onPick: v => { f.lat.value = v.lat; f.lon.value = v.lon; } });
    const syncPin = () => picker.set({ lat: parseFloat(f.lat.value), lon: parseFloat(f.lon.value) });
    f.lat.addEventListener('input', syncPin); f.lon.addEventListener('input', syncPin);
    f.link.addEventListener('input', () => { const c = parseCoords(f.link.value); if (c) { f.lat.value = c.lat; f.lon.value = c.lon; syncPin(); } });
    f.weekly.addEventListener('change', () => { $('.st-until', f).hidden = !f.weekly.checked; });
    $$('[data-cat]', f).forEach(b => b.addEventListener('click', () => { editing.cat = b.dataset.cat; $$('[data-cat]', f).forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
    $$('[data-where]', f).forEach(b => b.addEventListener('click', () => {
      where = b.dataset.where; $$('[data-where]', f).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      $('.st-at-place', f).hidden = where !== 'place'; $('.st-at-pin', f).hidden = where !== 'pin';
    }));
    if (ev) confirmClick($('#eDel', f), 'Delete', async () => {
      await api.del(`/catalog/v1/admin/events/${ev.id}`); ctx.snack('Event deleted');
      list = list.filter(x => x.id !== ev.id); editing = null; renderList(); editor.innerHTML = '<p class="muted st-empty">Deleted.</p>';
    });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const starts = fromLocalInput(f.starts.value), ends = fromLocalInput(f.ends.value);
      if (!f.title.value.trim()) { ctx.snack('Give the event a title'); f.title.focus(); return; }
      if (!starts || !ends) { ctx.snack('Set when it starts and ends'); return; }
      if (new Date(ends) <= new Date(starts)) { ctx.snack('The end must be after the start'); return; }
      const body = {
        title: f.title.value.trim(), cat: editing.cat, blurb: f.blurb.value.trim(), price: f.price.value.trim(),
        starts_at: starts, ends_at: ends, repeat_weekly: f.weekly.checked, repeat_until: f.weekly.checked && f.until.value ? f.until.value : null,
        published: f.published.checked, translations: { ...(editing.translations || {}), fr: Object.fromEntries(Object.entries({ title: f.fr_title.value.trim(), blurb: f.fr_blurb.value.trim() }).filter(([, v]) => v)) }
      };
      if (where === 'place') {
        if (!f.place_id.value) { ctx.snack('Choose the place'); return; }
        Object.assign(body, { place_id: f.place_id.value, lat: null, lon: null, venue: '' });
      } else {
        const lat = parseFloat(f.lat.value), lon = parseFloat(f.lon.value);
        if (!isFinite(lat) || !isFinite(lon)) { ctx.snack('Drop the pin on the map'); return; }
        Object.assign(body, { place_id: null, lat, lon, venue: f.venue.value.trim() });
      }
      try {
        const saved = ev ? await api.patch(`/catalog/v1/admin/events/${ev.id}`, body) : await api.post('/catalog/v1/admin/events', body);
        ctx.snack(ev ? 'Saved' : 'Event created');
        list = await api.get('/catalog/v1/admin/events'); renderList(); openEditor(list.find(x => x.id === saved.id));
      } catch (err) { ctx.snack(`Couldn’t save: ${err.message}`, 5000); }
    });
    renderList();
  }

  rows.addEventListener('click', e => { const b = e.target.closest('.st-row'); if (b) openEditor(list.find(x => x.id === b.dataset.id)); });
  $('#eNew', el).addEventListener('click', () => openEditor(null));
  renderList();
}
