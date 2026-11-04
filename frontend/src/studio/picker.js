// Location picker drawn from the same stylised Mauritius outline the 3D map uses, so a pin
// placed here lands in the same spot on the island. Click to place; exact coordinates can be
// typed or pasted from a Google Maps link next to it.
import { COAST, ISLETS, ll, toLatLon } from '../map/geo.js';

const NS = 'http://www.w3.org/2000/svg';
const PAD = 3;

export function createPicker(host, { value = null, others = [], onPick = () => {}, readonly = false } = {}) {
  const xs = COAST.map(p => p.x), zs = COAST.map(p => p.z);
  const x0 = Math.min(...xs) - PAD, x1 = Math.max(...xs) + PAD + 4, z0 = Math.min(...zs) - PAD - 3, z1 = Math.max(...zs) + PAD;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${x0} ${z0} ${x1 - x0} ${z1 - z0}`);
  svg.setAttribute('class', 'picker' + (readonly ? ' ro' : ''));
  svg.setAttribute('role', readonly ? 'img' : 'application');
  svg.setAttribute('aria-label', readonly ? 'Location on the island' : 'Island map: click to place the pin');
  const islets = ISLETS.map(i => `<ellipse cx="${i.x}" cy="${i.z}" rx="${i.a}" ry="${i.b}" transform="rotate(${i.rot * 57.3} ${i.x} ${i.z})" class="land"/>`).join('');
  svg.innerHTML = `<rect x="${x0}" y="${z0}" width="${x1 - x0}" height="${z1 - z0}" class="sea"/>
    <polygon class="land" points="${COAST.map(p => `${p.x},${p.z}`).join(' ')}"/>${islets}
    <g class="others">${others.map(o => { const p = ll(o.lat, o.lon); return `<circle cx="${p.x}" cy="${p.z}" r="0.55" fill="${o.color || '#fff'}"><title>${(o.name || '').replace(/</g, '')}</title></circle>`; }).join('')}</g>
    <g class="sel" visibility="hidden"><circle r="1.6" class="sel-ring"/><path d="M0 0 C -1.6 -2.2 -1.6 -3.8 0 -3.8 C 1.6 -3.8 1.6 -2.2 0 0Z" class="sel-pin"/></g>`;
  host.replaceChildren(svg);
  const sel = svg.querySelector('.sel');

  function set(v) {
    if (!v || !isFinite(v.lat) || !isFinite(v.lon)) { sel.setAttribute('visibility', 'hidden'); return; }
    const p = ll(v.lat, v.lon);
    sel.setAttribute('transform', `translate(${p.x} ${p.z})`); sel.setAttribute('visibility', 'visible');
  }
  if (!readonly) svg.addEventListener('click', e => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    const v = toLatLon(q.x, q.y); set(v); onPick(v);
  });
  set(value);
  return { set };
}
