// Stylised geography of Mauritius: projection, coastline, islets, relief, flat zones, towns.
// World units are kilometres; +x = east, +z = south. Heights are exaggerated about 6x.
import { clamp, smooth, fbm } from '../core/util.js';

const LAT0 = -20.25, LON0 = 57.55, KX = 104.6, KZ = 110.6;
export const ll = (lat, lon) => ({ x: (lon - LON0) * KX, z: -(lat - LAT0) * KZ });
export const toLatLon = (x, z) => ({ lat: +(LAT0 - z / KZ).toFixed(6), lon: +(LON0 + x / KX).toFixed(6) });

const COAST_LL = [[-19.984,57.614],[-20.006,57.662],[-20.054,57.692],[-20.110,57.730],[-20.130,57.755],[-20.190,57.776],[-20.240,57.790],[-20.290,57.781],[-20.345,57.765],[-20.380,57.726],[-20.405,57.706],[-20.430,57.722],[-20.447,57.712],[-20.465,57.682],[-20.490,57.625],[-20.523,57.530],[-20.515,57.480],[-20.505,57.405],[-20.490,57.372],[-20.470,57.332],[-20.468,57.306],[-20.445,57.312],[-20.430,57.355],[-20.360,57.365],[-20.330,57.370],[-20.280,57.365],[-20.210,57.400],[-20.170,57.460],[-20.160,57.495],[-20.115,57.510],[-20.065,57.520],[-20.035,57.545],[-20.005,57.560],[-20.015,57.585],[-19.995,57.592]];
export const COAST = COAST_LL.map(([a, b]) => ll(a, b));
export const SOUTH = [14, 15, 16].map(i => COAST[i]);

export const ISLETS = [
  { lat: -20.272, lon: 57.812, a: 1.5, b: 0.8, h: 0.4, rot: 0.5 },
  { lat: -20.420, lon: 57.735, a: 0.62, b: 0.55, h: 0.35, rot: 0 },
  { lat: -19.942, lon: 57.625, a: 0.95, b: 0.5, h: 1.7, rot: -0.3, reef: false },
  { lat: -20.416, lon: 57.336, a: 1.1, b: 0.35, h: 0.25, rot: 0.25 }
].map(o => Object.assign(o, ll(o.lat, o.lon)));

const PEAKS = [
  [-20.405,57.435,3.3,2.0],[-20.188,57.565,2.6,1.0],[-20.203,57.530,2.4,1.1],[-20.453,57.326,3.5,1.0],
  [-20.262,57.468,2.0,1.4],[-20.372,57.725,2.2,1.2],[-20.295,57.690,2.0,2.2],[-20.335,57.425,2.3,1.4],
  [-20.300,57.445,1.7,1.0],[-20.430,57.480,1.5,2.6],[-20.235,57.620,1.0,2.6],[-20.430,57.400,1.2,1.6]
].map(p => { const q = ll(p[0], p[1]); return [q.x, q.z, p[2], 2 * p[3] * p[3]]; });
const PLAT = ll(-20.33, 57.50), CRATER = ll(-20.316, 57.508);

export const FLATS = [
  { key: 'vacoas', lat: -20.375, lon: 57.490, r: 1.1, lake: true },
  { key: 'bassin', lat: -20.418, lon: 57.488, r: 0.5, lake: true },
  { key: 'pamp', lat: -20.104, lon: 57.582, r: 0.35, lake: true },
  { key: 'chamarel', lat: -20.440, lon: 57.375, r: 0.8 },
  { key: 'airport', lat: -20.430, lon: 57.683, r: 2.0 }
].map(f => Object.assign(f, ll(f.lat, f.lon)));
export const flat = key => FLATS.find(f => f.key === key);

export const TOWNS = [
  { lat: -20.162, lon: 57.503, r: 1.7, n: 48, h: [0.25, 0.95] },
  { lat: -20.244, lon: 57.489, r: 0.55, n: 8, h: [1.2, 2.1], glass: true },
  { lat: -20.318, lon: 57.527, r: 0.9, n: 18, h: [0.2, 0.55] },
  { lat: -20.012, lon: 57.590, r: 0.9, n: 16, h: [0.2, 0.5] },
  { lat: -20.404, lon: 57.700, r: 0.7, n: 12, h: [0.18, 0.4] },
  { lat: -20.284, lon: 57.370, r: 0.7, n: 10, h: [0.25, 0.6] },
  { lat: -20.185, lon: 57.770, r: 0.6, n: 8, h: [0.2, 0.4] }
].map(t => Object.assign(t, ll(t.lat, t.lon)));
export const nearTown = (x, z) => TOWNS.some(t => Math.hypot(x - t.x, z - t.z) < t.r + 0.3);

/** Signed distance to the coastline in km: positive on land, negative at sea. */
export function coastInfo(x, z) {
  let inside = false, md = 1e9;
  for (let i = 0, j = COAST.length - 1; i < COAST.length; j = i++) {
    const a = COAST[i], b = COAST[j];
    if (((a.z > z) !== (b.z > z)) && (x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x)) inside = !inside;
    const vx = b.x - a.x, vz = b.z - a.z;
    const t = clamp(((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz), 0, 1);
    const dx = x - (a.x + vx * t), dz = z - (a.z + vz * t), d = dx * dx + dz * dz;
    if (d < md) md = d;
  }
  md = Math.sqrt(md);
  return inside ? md : -md;
}

function rawH(x, z) {
  const px = (x - PLAT.x) / 15, pz = (z - PLAT.z) / 13;
  let h = 0.3 + 1.9 * Math.exp(-(px * px + pz * pz));
  for (const p of PEAKS) { const dx = x - p[0], dz = z - p[1]; h += p[2] * Math.exp(-(dx * dx + dz * dz) / p[3]); }
  h += (fbm(x * 0.35, z * 0.35) - 0.44) * 0.9;
  const cx = x - CRATER.x, cz = z - CRATER.z, r = Math.sqrt(cx * cx + cz * cz);
  h += 0.55 * Math.exp(-((r - 0.75) ** 2) / 0.08) - 0.9 * Math.exp(-(r * r) / 0.18);
  return h;
}

function baseH(x, z, d) {
  let h;
  if (d > 0) { const H = Math.max(0.12, rawH(x, z)); h = 0.05 + (H - 0.05) * smooth(0, 1.6, d); }
  else h = 0.05 - 1.1 * smooth(0, 0.8, -d);
  for (const it of ISLETS) {
    const dx = x - it.x, dz = z - it.z, c = Math.cos(it.rot), s = Math.sin(it.rot);
    const lx = (dx * c + dz * s) / it.a, lz = (-dx * s + dz * c) / it.b, e = Math.sqrt(lx * lx + lz * lz);
    if (e < 1.4) { const ih = e < 1 ? 0.05 + it.h * (1 - e * e) : 0.05 - 1.0 * smooth(1, 1.4, e); h = Math.max(h, ih); }
  }
  return h;
}
FLATS.forEach(f => { f.level = baseH(f.x, f.z, coastInfo(f.x, f.z)); });

export function landHd(x, z, d) {
  let h = baseH(x, z, d);
  if (d > 0) for (const f of FLATS) {
    const dist = Math.hypot(x - f.x, z - f.z);
    if (dist < f.r + 0.9) { const w = 1 - smooth(f.r, f.r + 0.9, dist); h = h * (1 - w) + (f.level - (f.lake ? 0.07 : 0)) * w; }
  }
  return h;
}
export const landH = (x, z) => landHd(x, z, coastInfo(x, z));
export const groundY = (x, z) => Math.max(landH(x, z), 0);
