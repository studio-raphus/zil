// Routes: an animated toon tube from "you" through one or more stops, with numbered markers.
import * as THREE from 'three';
import { ctx } from './ctx.js';
import { groundY, ll } from './geo.js';
import { flyTo, overviewDist } from './engine.js';
import { addStop, removeOverlay } from '../features/overlay.js';
import { clamp, lerp, reduced, isWide } from '../core/util.js';

let route = null;
const INK = 0x1B1A2E;

/**
 * Draws a route from "you" to the given places and returns { km, minutes }.
 * With `road` (a routing-service response) the tube follows the real roads; without it, a
 * gentle arc stands in (offline, or routing unavailable).
 */
export function drawRoute(places, { sheetOpen = false, road = null } = {}) {
  clearRoute();
  const pts = [ctx.you.clone()].concat(places.map(p => p.pos.clone()));
  const path = road ? roadPath(road, pts[pts.length - 1]) : arcPath(pts);
  let km = 0;
  if (!road) for (let i = 0; i < pts.length - 1; i++) km += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) * 1.35;
  const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal'), segs = Math.min(4000, path.length * 4);
  const g1 = new THREE.TubeGeometry(curve, segs, 0.15, 6, false), g2 = new THREE.TubeGeometry(curve, segs, 0.25, 6, false);
  const m1 = new THREE.Mesh(g1, new THREE.MeshBasicMaterial({ color: 0xFF5A36 })), m2 = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  g1.setDrawRange(0, 0); g2.setDrawRange(0, 0); ctx.scene.add(m2, m1);
  const dotG = new THREE.SphereGeometry(0.16, 10, 8), dotM = new THREE.MeshBasicMaterial({ color: 0xFFE14D }), dots = [];
  for (let i = 0; i < 7; i++) { const d = new THREE.Mesh(dotG, dotM); d.visible = false; ctx.scene.add(d); dots.push(d); }
  const stops = places.map((p, i) => addStop(p.pos, i + 1));
  route = { m1, m2, g1, g2, n: g1.index.count, curve, dots, stops, start: performance.now() };
  ctx.frameHooks.push(step);

  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of road ? path : pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const narrow = ctx.camera.aspect < 1, size = Math.max(x1 - x0, (z1 - z0) * (narrow ? 1 : 0.8));
  const fit = clamp(size * (narrow ? 2.2 : 1.35) + 14, 24, overviewDist());
  flyTo((x0 + x1) / 2 + (isWide() && sheetOpen ? -fit * 0.15 : 0), 0, (z0 + z1) / 2 + (isWide() ? 0 : fit * 0.12), fit, 0.8, 0);
  if (road) return { km: road.distance_m / 1000, minutes: Math.max(1, Math.round(road.duration_s / 60)), road: true, offroadKm: road.offroad_m.to / 1000 };
  return { km, minutes: Math.round(km / 38 * 60), road: false };
}

// Straight-ish arcs between stops (fallback when no road route is available).
function arcPath(pts) {
  const path = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(10, Math.ceil(L / 0.7)), lift = Math.min(3, L * 0.08) + 0.4;
    for (let k = i ? 1 : 0; k <= n; k++) {
      const s = k / n, x = a.x + (b.x - a.x) * s, z = a.z + (b.z - a.z) * s;
      path.push(new THREE.Vector3(x, Math.max(groundY(x, z), lerp(a.y, b.y, s)) + 0.35 + Math.sin(Math.PI * s) * lift, z));
    }
  }
  return path;
}

// Road polyline projected onto the toon island: thinned (tiny steps add nothing at this scale),
// densified (so the tube hugs the exaggerated relief), then a last hop to the place itself when
// the road stops short of it (a beach, a summit, an islet reached by boat).
function roadPath(road, dest) {
  const raw = road.coords.map(([lat, lon]) => ll(lat, lon));
  const thin = [raw[0]];
  for (let i = 1; i < raw.length; i++) { const q = thin[thin.length - 1]; if (Math.hypot(raw[i].x - q.x, raw[i].z - q.z) > 0.12 || i === raw.length - 1) thin.push(raw[i]); }
  const path = [], lift = 0.3;
  const push = (x, z) => path.push(new THREE.Vector3(x, groundY(x, z) + lift, z));
  push(ctx.you.x, ctx.you.z);
  for (const q of thin) {
    const last = path[path.length - 1], L = Math.hypot(q.x - last.x, q.z - last.z), n = Math.ceil(L / 0.35);
    for (let k = 1; k <= n; k++) push(last.x + (q.x - last.x) * k / n, last.z + (q.z - last.z) * k / n);
  }
  const last = path[path.length - 1], gap = Math.hypot(dest.x - last.x, dest.z - last.z);
  if (gap > 0.05) {
    const n = Math.max(4, Math.ceil(gap / 0.35)), hop = Math.min(1.2, gap * 0.15);
    for (let k = 1; k <= n; k++) { const s = k / n, x = last.x + (dest.x - last.x) * s, z = last.z + (dest.z - last.z) * s; path.push(new THREE.Vector3(x, Math.max(groundY(x, z), 0) + lift + Math.sin(Math.PI * s) * hop, z)); }
  }
  return path;
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
