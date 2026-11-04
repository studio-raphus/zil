// HTML overlay on the 3D map: place pins, route stop numbers, avatar name tags, "POOF!" bursts.
// Positions are projected from 3D every frame; labels fade in and out with zoom level.
import * as THREE from 'three';
import { ctx } from '../map/ctx.js';
import { bus } from '../core/bus.js';
import { state, catOf } from '../core/state.js';
import { ic } from '../core/icons.js';
import { clamp, esc } from '../core/util.js';

const layer = document.getElementById('pins');
const items = [];
const v = new THREE.Vector3();

export function initOverlay(avatars) {
  for (const a of avatars) {
    const el = document.createElement('div');
    el.className = 'tag' + (a.me ? ' me' : '');
    el.innerHTML = `<span>${esc(a.label)}</span>`;
    layer.appendChild(el);
    items.push({ el, pos: a.obj.position, obj: a.obj, type: 'tag', dy: () => 1.15 * ctx.liveK + 0.1 });
  }
  bus.on('frame', update);
  bus.on('poof', (cx, cy) => {
    const el = document.createElement('div'); el.className = 'poof'; el.style.transform = `translate3d(${cx}px,${cy}px,0)`; el.innerHTML = '<span>POOF!</span>';
    layer.appendChild(el); setTimeout(() => el.remove(), 900);
  });
}

function pinHtml(p) {
  const c = catOf(p), badge = p.temp ? '' : p.user ? (p.status === 'approved' ? 'Community spot' : 'Your spot') : p.live;
  return `<span class="pin-body">${badge ? `<span class="pin-badge">${esc(badge)}</span>` : ''}<span class="pin-head">${ic(c.icon)}</span><span class="pin-label">${esc(p.short || p.name)}</span><span class="pin-shadow"></span></span>`;
}

export function addPin(p) {
  const c = catOf(p), el = document.createElement('button');
  el.type = 'button';
  el.className = 'pin' + (p.hot ? ' hot' : '') + (p.user ? ' user' : '') + (p.temp ? ' temp' : '') + (p.event ? ' event' : '');
  el.style.setProperty('--c', c.color);
  el.setAttribute('aria-label', `${p.name}, ${c.one}${p.live ? ', ' + p.live : ''}`);
  el.innerHTML = pinHtml(p);
  if (!p.temp) el.addEventListener('click', e => { e.stopPropagation(); bus.emit('select', p.id); });
  layer.appendChild(el);
  const o = { el, pos: p.pos, type: 'pin', id: p.id, cat: p.cat, hot: !!p.hot, temp: !!p.temp, ev: !!p.event, hidden: false };
  items.push(o); applyFilterTo(o);
  return o;
}

/** Re-render a pin after its live status changed. */
export function refreshPin(p) {
  const o = items.find(i => i.type === 'pin' && i.id === p.id); if (!o) return;
  o.hot = !!p.hot; o.el.classList.toggle('hot', o.hot); o.el.innerHTML = pinHtml(p);
  o.el.classList.toggle('sel', state.selectedId === p.id);
  applyFilterTo(o);
}

export function addStop(pos, n) {
  const el = document.createElement('div'); el.className = 'stop'; el.innerHTML = `<span>${n}</span>`; layer.appendChild(el);
  const o = { el, pos, type: 'stop', dy: () => 2.2 }; items.push(o); return o;
}

export function removeOverlay(o) { const i = items.indexOf(o); if (i >= 0) items.splice(i, 1); o.el.remove(); }
export const pinFor = id => items.find(i => i.type === 'pin' && i.id === id);

export function setSelected(id) { for (const o of items) if (o.type === 'pin') o.el.classList.toggle('sel', o.id === id); }

function applyFilterTo(o) {
  if (o.type !== 'pin') return;
  const f = state.filter;
  const show = o.temp || f === 'all' || (f === 'live' ? o.hot : f === 'events' ? o.ev : o.cat === f);
  o.hidden = !show; o.el.classList.toggle('off', !show);
}
export function applyFilter() { items.forEach(applyFilterTo); return items.filter(o => o.type === 'pin' && !o.hidden && !o.temp).length; }

function update(r) {
  const { camera } = ctx, W = innerWidth, H = innerHeight, small = W < 700;
  layer.classList.toggle('far', r > (small ? 60 : 110));
  layer.classList.toggle('mid', r > 42 && r <= (small ? 60 : 110));
  for (const o of items) {
    if (o.hidden) continue;
    if (o.obj && !o.obj.visible) { if (!o.out) { o.el.style.visibility = 'hidden'; o.out = true; } continue; }
    v.copy(o.pos); if (o.dy) v.y += o.dy();
    const dist = camera.position.distanceTo(v);
    v.project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.25 || Math.abs(v.y) > 1.25) { if (!o.out) { o.el.style.visibility = 'hidden'; o.out = true; } continue; }
    if (o.out) { o.el.style.visibility = ''; o.out = false; }
    const x = (v.x + 1) * 0.5 * W, y = (1 - v.y) * 0.5 * H, s = o.type === 'pin' ? clamp(55 / dist, 0.66, 1.1) : 1;
    o.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${s.toFixed(3)})`;
    if (o.type === 'pin') o.el.style.zIndex = String(10000 - Math.round(dist * 10));
  }
}
