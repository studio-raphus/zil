// App chrome: brand burst, icons in static buttons, snackbar, first-run hint, about dialog,
// compass, home and day/night buttons, Escape handling, and the no-WebGL fallback.
import { $, coarse, esc, starPoly } from '../core/util.js';
import { ic } from '../core/icons.js';
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';

const snackEl = $('#snack'), hintEl = $('#hint');
let snackT = 0;

export function snack(msg, ms = 3200) {
  snackEl.textContent = msg; snackEl.classList.add('show');
  clearTimeout(snackT); snackT = setTimeout(() => snackEl.classList.remove('show'), ms);
}
export const hideHint = () => hintEl.classList.add('gone');

export function initChrome({ onHome, onNorth, onNight }) {
  document.documentElement.style.setProperty('--star', starPoly(12, 36));
  const pts = (cx, cy) => Array.from({ length: 28 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 14, r = i % 2 ? 22 : 31; return (cx + Math.cos(a) * r * 1.12).toFixed(1) + ',' + (cy + Math.sin(a) * r * 0.92).toFixed(1); }).join(' ');
  $('#burstFg').setAttribute('points', pts(36, 30)); $('#burstSh').setAttribute('points', pts(39, 33));
  $('#searchIc').innerHTML = ic('search'); $('#qclear').innerHTML = ic('close'); $('#infoBtn').innerHTML = ic('info');
  $('#fabHome').innerHTML = ic('home'); $('#fabAdd').innerHTML = ic('plus'); $('#sheetX').innerHTML = ic('close'); $('#aboutClose').innerHTML = ic('close');

  hintEl.innerHTML = coarse
    ? '<b>Drag</b> to pan · <b>pinch &amp; twist</b> to zoom and spin · <b>tap</b> pins, boats and clouds'
    : '<b>Drag</b> to pan · <b>right-drag</b> to tilt &amp; spin · <b>scroll</b> to zoom · <b>click</b> pins, boats and clouds';
  setTimeout(hideHint, 9000);
  bus.on('map:interact', hideHint);
  bus.on('snack', snack);

  $('#fabHome').addEventListener('click', onHome);
  $('#compass').addEventListener('click', onNorth);
  const nightBtn = $('#fabNight');
  const paintNight = on => { nightBtn.innerHTML = ic(on ? 'sun' : 'moon'); nightBtn.setAttribute('aria-pressed', String(on)); nightBtn.setAttribute('aria-label', on ? 'Day map' : 'Night map'); };
  let night = document.documentElement.getAttribute('data-theme') ? document.documentElement.getAttribute('data-theme') === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  paintNight(night); onNight(night);
  nightBtn.addEventListener('click', () => { night = !night; paintNight(night); onNight(night); snack(night ? 'Night map: lights on in town' : 'Day map'); });

  const about = $('#aboutModal');
  $('#infoBtn').addEventListener('click', () => { about.hidden = false; $('#aboutClose').focus(); });
  $('#aboutClose').addEventListener('click', () => { about.hidden = true; });
  about.addEventListener('click', e => { if (e.target === about) about.hidden = true; });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!about.hidden) about.hidden = true; else bus.emit('escape');
  });
}

export function setOfflineBadge(on) {
  state.offline = on;
  const tag = document.querySelector('.brand-tag');
  if (tag) tag.textContent = on ? 'OFFLINE' : 'BETA';
  if (on) snack('Backend unreachable: showing bundled places. Your spots stay on this device.', 4500);
}

export function showFallback(err, places) {
  const fb = $('#fallback'); fb.hidden = false;
  fb.innerHTML = `<div class="card"><h1>Zil</h1><p>The 3D map couldn’t start on this device (WebGL is unavailable). Here are the places it would show:</p><ul>${places.map(p => `<li><b>${esc(p.name)}</b>: ${esc(p.blurb)}</li>`).join('')}</ul><p class="fine">${esc(err && err.message || '')}</p></div>`;
}
