// Small helpers shared by the Studio views.
export { esc } from '../core/util.js';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let snackT = 0;
export function snack(msg, ms = 3200) {
  const el = $('#snack'); el.textContent = msg; el.classList.add('show');
  clearTimeout(snackT); snackT = setTimeout(() => el.classList.remove('show'), ms);
}

export function ago(iso) {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// <input type="datetime-local"> works in the browser's local time (Mauritius for the team).
export const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
export const fromLocalInput = v => v ? new Date(v).toISOString() : null;

/** Pull coordinates out of a pasted Google Maps / OpenStreetMap link or "lat, lon" text. */
export function parseCoords(text) {
  const t = String(text || '').trim();
  const pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|query|ll|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/, /^(-?\d+\.\d+)\s*[,; ]\s*(-?\d+\.\d+)$/];
  for (const p of pats) { const m = t.match(p); if (m) return { lat: +(+m[1]).toFixed(6), lon: +(+m[2]).toFixed(6) }; }
  return null;
}

/** Two-step delete button: the first click arms it, the second (within 4 s) confirms. */
export function confirmClick(btn, label, action) {
  let armed = 0;
  btn.addEventListener('click', async () => {
    if (Date.now() - armed < 4000) { btn.disabled = true; try { await action(); } finally { btn.disabled = false; } armed = 0; btn.textContent = label; return; }
    armed = Date.now(); btn.textContent = 'Click again to confirm';
    setTimeout(() => { if (armed && Date.now() - armed >= 4000) { armed = 0; btn.textContent = label; } }, 4100);
  });
}
