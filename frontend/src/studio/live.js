// Live updates: the one-line status on a place ("Dholl puri queue: 5 min"). Posting pushes it
// to every open app within a second; clearing removes the badge.
import { api } from './api.js';
import { $, esc, ago } from './util.js';
import { ic } from '../core/icons.js';

const QUICK = ['Busy right now', 'Quiet right now', 'Queue: 10 min', 'Sold out today', 'Closed today', 'Sunset in 20 min', 'Boats every 20 min', 'Live music tonight'];

function pushPanel(p) {
  return `<div class="card st-panel st-push">
    <div class="st-list-head"><h1>Send a notification</h1><span class="st-pill ${p.configured ? 'live' : 'draft'}">${p.configured ? `${p.devices} phone${p.devices === 1 ? '' : 's'} with alerts on` : 'Not set up'}</span></div>
    ${p.configured ? `<form id="pushForm" class="st-pushform">
      <input class="st-input" name="title" maxlength="60" placeholder="Title, e.g. Sunset cruise: 4 seats left" aria-label="Title">
      <input class="st-input" name="body" maxlength="180" placeholder="Message" aria-label="Message">
      <select class="st-input" name="place" aria-label="Opens place"><option value="">Opens the map</option>%PLACES%</select>
      <button class="btn filled sm" type="submit">${ic('check')}Send to everyone</button></form>
      <p class="fine">Goes to every phone with Zil alerts on. Use sparingly: big events, weather, closures.</p>
      ${p.log.length ? `<details><summary class="fine">Recently sent</summary>${p.log.map(l => `<p class="fine"><b>${esc(l.title)}</b> · ${esc(l.body)} · ${l.sent} sent · ${esc(l.sent_by || '')} · ${ago(l.created_at)}</p>`).join('')}</details>` : ''}`
    : '<p class="muted">Add the Firebase service account file to <code>secrets/firebase-service-account.json</code> and restart the live service to send push notifications to the Android app.</p>'}
  </div>`;
}

export default async function live(el, ctx) {
  const status = Object.fromEntries((await api.get('/live/v1/status')).map(s => [s.place_id, s]));
  const push = await api.get('/live/v1/push').catch(() => null);
  el.innerHTML = `${push ? pushPanel(push).replace('%PLACES%', ctx.places.filter(p => p.published).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')) : ''}<div class="card st-panel">
    <div class="st-list-head"><h1>Live updates</h1><input class="st-input" id="lQ" type="search" placeholder="Find a place…" aria-label="Find a place"></div>
    <p class="muted">Short and current: 60 characters max. “Hot” makes the pin glow and adds it to Live now.</p>
    <div class="st-live" id="lGrid"></div></div>`;
  const grid = $('#lGrid', el);

  function card(p) {
    const s = status[p.id], c = ctx.cats[p.cat] || {};
    return `<form class="st-lcard${s ? ' has' : ''}" data-id="${esc(p.id)}">
      <div class="st-lhead"><span class="st-dot" style="--c:${c.color}">${ic(c.icon)}</span><b>${esc(p.name)}</b>
        ${s ? `<span class="st-pill ${s.hot ? 'hot' : 'live'}">${s.hot ? 'Hot' : 'Live'} · ${ago(s.updated_at)}</span>` : '<span class="st-pill draft">No update</span>'}</div>
      <div class="st-lrow"><input class="st-input" name="text" maxlength="60" value="${esc(s?.text || '')}" placeholder="What’s happening there now?" aria-label="Status for ${esc(p.name)}">
        <label class="st-hot"><input type="checkbox" name="hot" ${s?.hot ? 'checked' : ''}>Hot</label></div>
      <div class="st-quick">${QUICK.map(q => `<button type="button" class="tip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="actions"><button class="btn filled sm" type="submit">${ic('check')}Post</button>${s ? `<button class="btn sm" type="button" data-clear>${ic('close')}Clear</button>` : ''}</div>
    </form>`;
  }
  function render(q = '') {
    const list = ctx.places.filter(p => p.published && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
      .sort((a, b) => (!!status[b.id] - !!status[a.id]) || a.name.localeCompare(b.name));
    grid.innerHTML = list.map(card).join('') || '<p class="muted">No places match.</p>';
  }
  grid.addEventListener('click', async e => {
    const f = e.target.closest('form'); if (!f) return;
    if (e.target.dataset.q) { f.text.value = e.target.dataset.q; f.text.focus(); }
    if (e.target.closest('[data-clear]')) {
      try { await api.del(`/live/v1/status/${encodeURIComponent(f.dataset.id)}`); delete status[f.dataset.id]; f.outerHTML = card(ctx.places.find(p => p.id === f.dataset.id)); ctx.snack('Cleared'); }
      catch (err) { ctx.snack(`Couldn’t clear: ${err.message}`); }
    }
  });
  grid.addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target, text = f.text.value.trim();
    if (!text) { ctx.snack('Write a short update first'); f.text.focus(); return; }
    try {
      const s = await api.post('/live/v1/status', { place_id: f.dataset.id, text, hot: f.hot.checked });
      status[f.dataset.id] = s; f.outerHTML = card(ctx.places.find(p => p.id === s.place_id));
      ctx.snack('Posted: it’s on everyone’s map now');
    } catch (err) { ctx.snack(`Couldn’t post: ${err.message}`); }
  });
  $('#lQ', el).addEventListener('input', e => render(e.target.value));
  $('#pushForm', el)?.addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    if (!f.title.value.trim() || !f.body.value.trim()) { ctx.snack('Add a title and a message'); return; }
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const r = await api.post('/live/v1/push/send', { title: f.title.value.trim(), body: f.body.value.trim(), ...(f.place.value ? { place_id: f.place.value } : {}) });
      ctx.snack(`Sent to ${r.sent} phone${r.sent === 1 ? '' : 's'}${r.failed ? ` (${r.failed} failed)` : ''}`); f.reset();
    } catch (err) { ctx.snack(`Couldn’t send: ${err.message}`, 5000); }
    finally { btn.disabled = false; }
  });
  render();
}
