// Routes: an animated toon tube from "you" through one or more stops, with numbered markers.
import * as THREE from 'three';
import { ctx } from './ctx.js';
import { groundY } from './geo.js';
import { flyTo, overviewDist } from './engine.js';
import { addStop, removeOverlay } from '../features/overlay.js';
import { clamp, lerp, reduced, isWide } from '../core/util.js';

let route = null;
const INK = 0x1B1A2E;

/** Draws a route and returns { km, minutes }. */
export function drawRoute(places, { sheetOpen = false } = {}) {
  clearRoute();
  const pts = [ctx.you.clone()].concat(places.map(p => p.pos.clone()));
  const path = []; let km = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(10, Math.ceil(L / 0.7)), lift = Math.min(3, L * 0.08) + 0.4; km += L * 1.35;
    for (let k = i ? 1 : 0; k <= n; k++) {
      const s = k / n, x = a.x + (b.x - a.x) * s, z = a.z + (b.z - a.z) * s;
      path.push(new THREE.Vector3(x, Math.max(groundY(x, z), lerp(a.y, b.y, s)) + 0.35 + Math.sin(Math.PI * s) * lift, z));
    }
  }
  const curve = new THREE.CatmullRomCurve3(path), segs = Math.min(1400, path.length * 5);
  const g1 = new THREE.TubeGeometry(curve, segs, 0.15, 6, false), g2 = new THREE.TubeGeometry(curve, segs, 0.25, 6, false);
  const m1 = new THREE.Mesh(g1, new THREE.MeshBasicMaterial({ color: 0xFF5A36 })), m2 = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  g1.setDrawRange(0, 0); g2.setDrawRange(0, 0); ctx.scene.add(m2, m1);
  const dotG = new THREE.SphereGeometry(0.16, 10, 8), dotM = new THREE.MeshBasicMaterial({ color: 0xFFE14D }), dots = [];
  for (let i = 0; i < 7; i++) { const d = new THREE.Mesh(dotG, dotM); d.visible = false; ctx.scene.add(d); dots.push(d); }
  const stops = places.map((p, i) => addStop(p.pos, i + 1));
  route = { m1, m2, g1, g2, n: g1.index.count, curve, dots, stops, start: performance.now() };
  ctx.frameHooks.push(step);

  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const narrow = ctx.camera.aspect < 1, size = Math.max(x1 - x0, (z1 - z0) * (narrow ? 1 : 0.8));
  const fit = clamp(size * (narrow ? 2.2 : 1.35) + 14, 24, overviewDist());
  flyTo((x0 + x1) / 2 + (isWide() && sheetOpen ? -fit * 0.15 : 0), 0, (z0 + z1) / 2 + (isWide() ? 0 : fit * 0.12), fit, 0.8, 0);
  return { km, minutes: Math.round(km / 38 * 60) };
}

function step(now, dt, t) {
  if (!route) return;
  const f = clamp((now - route.start) / (reduced ? 1 : 1500), 0, 1), cnt = Math.floor(f * route.n / 36) * 36;
  route.g1.setDrawRange(0, cnt); route.g2.setDrawRange(0, cnt);
  route.dots.forEach((d, i) => { const u = (t * 0.06 + i / route.dots.length) % 1; d.visible = f >= 1; if (d.visible) { d.position.copy(route.curve.getPointAt(u)); d.position.y += 0.05; } });
}

export function clearRoute() {
  if (!route) return;
  ctx.scene.remove(route.m1, route.m2); route.g1.dispose(); route.g2.dispose();
  route.dots.forEach(d => ctx.scene.remove(d)); route.stops.forEach(removeOverlay);
  const i = ctx.frameHooks.indexOf(step); if (i >= 0) ctx.frameHooks.splice(i, 1);
  route = null;
}
export const hasRoute = () => !!route;
