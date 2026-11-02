// Static world: sea and lagoon, toon terrain, coast outline, lakes, vegetation, towns, landmarks.
import * as THREE from 'three';
import { ctx, mergeGeos } from './ctx.js';
import { smooth, hash, mulberry32 } from '../core/util.js';
import { ll, COAST, SOUTH, ISLETS, FLATS, flat, TOWNS, nearTown, coastInfo, landHd, landH, groundY } from './geo.js';

const WS = 200, WN = 2048, KP = WN / WS;
export const WATER_D = { deep: '#1F8FE0', dot: '#1A80CF', reef: '#FFFFFF', lagoon: '#3BD0E6', shallow: '#8BEDE6', foam: '#FFFFFF' };
export const WATER_N = { deep: '#132B66', dot: '#10255A', reef: '#9CC9FF', lagoon: '#1C6E99', shallow: '#2B93AE', foam: '#CFE6FF' };
let waterCanvas, waterTex;

export function drawWater(isNight) {
  const g = waterCanvas.getContext('2d'), P = isNight ? WATER_N : WATER_D;
  const px = (x, z) => [(x + WS / 2) * KP, (z + WS / 2) * KP];
  g.globalAlpha = 1; g.fillStyle = P.deep; g.fillRect(0, 0, WN, WN);
  g.fillStyle = P.dot;
  for (let y = 0, row = 0; y < WN; y += 22, row++) for (let x = (row % 2) * 11; x < WN; x += 22) {
    const dx = x / WN - 0.5, dy = y / WN - 0.5, r = Math.sqrt(dx * dx + dy * dy) * 2;
    if (r > 0.92) continue; g.globalAlpha = 1 - smooth(0.55, 0.92, r); g.beginPath(); g.arc(x, y, 3.4, 0, 6.283); g.fill();
  }
  g.globalAlpha = 1; g.lineJoin = 'round'; g.lineCap = 'round';
  const coast = () => { g.beginPath(); COAST.forEach((p, i) => { const [x, y] = px(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
  const islet = (it, grow) => { const [x, y] = px(it.x, it.z); g.beginPath(); g.ellipse(x, y, (it.a + grow) * KP, (it.b + grow) * KP, it.rot, 0, Math.PI * 2); };
  const band = (w, col, a = 1) => { g.globalAlpha = a; g.fillStyle = col; g.strokeStyle = col; coast(); g.lineWidth = w * 2 * KP; g.stroke(); g.fill(); for (const it of ISLETS) { if (it.reef === false) continue; islet(it, w * 0.55); g.fill(); } };
  band(3.2, P.reef, 0.95); band(2.9, P.lagoon); band(1.2, P.shallow);
  const south = () => { g.beginPath(); SOUTH.forEach((p, i) => { const [x, y] = px(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); };
  g.globalAlpha = 1; g.strokeStyle = P.deep; g.lineWidth = 3.0 * 2 * KP; south(); g.stroke();
  g.strokeStyle = P.foam; g.lineWidth = 0.5 * 2 * KP; g.globalAlpha = 0.9; south(); g.stroke();
  g.globalAlpha = 1;
  for (const it of ISLETS) { islet(it, 0.35); g.fillStyle = P.shallow; g.fill(); }
  g.globalAlpha = 0.85; g.strokeStyle = P.foam; g.lineWidth = 0.28 * 2 * KP; coast(); g.stroke();
  for (const it of ISLETS) { islet(it, 0.12); g.lineWidth = 0.18 * 2 * KP; g.stroke(); }
  g.globalAlpha = 1;
  if (waterTex) waterTex.needsUpdate = true;
}

export function buildWater() {
  const { scene, renderer, mats } = ctx;
  waterCanvas = document.createElement('canvas'); waterCanvas.width = waterCanvas.height = WN;
  waterTex = new THREE.CanvasTexture(waterCanvas); waterTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  drawWater(false);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WS, WS), mats.toon(0xffffff, { map: waterTex }));
  water.rotation.x = -Math.PI / 2; water.receiveShadow = true; scene.add(water);
  const outerSea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), mats.toon(WATER_D.deep));
  outerSea.rotation.x = -Math.PI / 2; outerSea.position.y = -0.2; scene.add(outerSea);
  const wc = document.createElement('canvas'); wc.width = wc.height = 256;
  const g = wc.getContext('2d'); g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.lineCap = 'round'; const r2 = mulberry32(3);
  for (let i = 0; i < 8; i++) { const x = 30 + r2() * 190, y = 30 + r2() * 196; for (let k = 0; k < 2; k++) { g.beginPath(); g.arc(x + k * 20, y, 11, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); } }
  const wTex = new THREE.CanvasTexture(wc); wTex.wrapS = wTex.wrapT = THREE.RepeatWrapping; wTex.repeat.set(36, 36);
  const waves = new THREE.Mesh(new THREE.PlaneGeometry(WS, WS), new THREE.MeshBasicMaterial({ map: wTex, transparent: true, opacity: 0.33, depthWrite: false }));
  waves.rotation.x = -Math.PI / 2; waves.position.y = 0.012; scene.add(waves);
  return { water, outerSea, waves };
}

export function buildTerrain() {
  const X0 = -30, X1 = 31, Z0 = -37, Z1 = 33, ST = 0.5;
  const NX = Math.round((X1 - X0) / ST), NZ = Math.round((Z1 - Z0) / ST), W = NX + 1, N = W * (NZ + 1);
  const PX = new Float32Array(N), PZ = new Float32Array(N), HG = new Float32Array(N), DG = new Float32Array(N);
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const k = j * W + i, edge = i === 0 || j === 0 || i === NX || j === NZ;
    const x = X0 + i * ST + (edge ? 0 : (hash(i, j) - 0.5) * 0.24), z = Z0 + j * ST + (edge ? 0 : (hash(j + 7, i) - 0.5) * 0.24);
    const d = coastInfo(x, z); PX[k] = x; PZ[k] = z; DG[k] = d; HG[k] = landHd(x, z, d);
  }
  const pos = [], nor = [], col = [], c = new THREE.Color();
  const FIELDS = [0xB8E36A, 0x9FD85F, 0xCFEA80, 0x8BD05A, 0xA9DC5C, 0xC4E46E];
  const pick = (x, y, z, d, ny) => {
    let hex;
    if (y < 0.03) hex = 0xE3BE74;
    else if (y < 0.24 && d < 0.9) hex = 0xFBE29C;
    else if (ny < 0.7) hex = y > 2.2 ? 0x8C7666 : 0xA48A73;
    else if (y > 3.7) hex = 0x9C846F;
    else if (y > 2.3) hex = hash(Math.floor(x * 1.3), Math.floor(z * 1.3)) > 0.5 ? 0x23884E : 0x2FA35C;
    else if (y > 1.45) hex = hash(Math.floor(x), Math.floor(z)) > 0.35 ? 0x3DB869 : 0x2FA35C;
    else hex = FIELDS[Math.floor(hash(Math.floor(x / 1.7 + 17), Math.floor(z / 1.4 - 5)) * FIELDS.length)];
    c.setHex(hex); c.offsetHSL(0, 0, (hash(x * 3.1, z * 2.7) - 0.5) * 0.05);
  };
  const tri = (a, b, cc) => {
    if (HG[a] < -0.4 && HG[b] < -0.4 && HG[cc] < -0.4) return;
    let A = [PX[a], HG[a], PZ[a]], B = [PX[b], HG[b], PZ[b]], C = [PX[cc], HG[cc], PZ[cc]];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (ny < 0) { const t = B; B = C; C = t; nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    pick((A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3, (DG[a] + DG[b] + DG[cc]) / 3, ny);
    pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
    for (let k = 0; k < 3; k++) { nor.push(nx, ny, nz); col.push(c.r, c.g, c.b); }
  };
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const a = j * W + i, b = a + 1, d = a + W, e = d + 1;
    if ((i + j) % 2) { tri(a, d, b); tri(b, d, e); } else { tri(a, d, e); tri(a, e, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  const terrain = new THREE.Mesh(g, ctx.mats.toon(0xffffff, { vertexColors: true }));
  terrain.castShadow = true; terrain.receiveShadow = true; ctx.scene.add(terrain);
  return terrain;
}

export function buildCoastAndLakes() {
  const { scene, mats } = ctx, ink = new THREE.MeshBasicMaterial({ color: 0x1B1A2E });
  const coastCurve = new THREE.CatmullRomCurve3(COAST.map(p => new THREE.Vector3(p.x, 0.03, p.z)), true, 'centripetal');
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(coastCurve, 900, 0.1, 4, true), ink));
  for (const it of ISLETS) {
    const pts = [], c = Math.cos(it.rot), s = Math.sin(it.rot);
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, lx = Math.cos(a) * it.a * 1.04, lz = Math.sin(a) * it.b * 1.04; pts.push(new THREE.Vector3(it.x + lx * c - lz * s, 0.03, it.z + lx * s + lz * c)); }
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 80, 0.07, 4, true), ink));
  }
  for (const f of FLATS.filter(f => f.lake)) {
    const lake = new THREE.Mesh(new THREE.CircleGeometry(f.r + 0.14, 32), mats.toon(0x46C4F2));
    lake.rotation.x = -Math.PI / 2; lake.position.set(f.x, f.level + 0.005, f.z); lake.receiveShadow = true; scene.add(lake);
    const ring = new THREE.Mesh(new THREE.RingGeometry(f.r + 0.14, f.r + 0.24, 40), new THREE.MeshBasicMaterial({ color: 0x1B1A2E, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(f.x, f.level + 0.012, f.z); scene.add(ring);
  }
  const pond = flat('pamp'), padMat = mats.toon(0x3FBF5F);
  for (let i = 0; i < 6; i++) { const a = i * 1.1, r = 0.12 + (i % 3) * 0.09; const pad = new THREE.Mesh(new THREE.CircleGeometry(0.07 + (i % 2) * 0.03, 12), padMat); pad.rotation.x = -Math.PI / 2; pad.position.set(pond.x + Math.cos(a) * r, pond.level + 0.02, pond.z + Math.sin(a) * r); scene.add(pad); }
  // Chamarel coloured earth
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
  const cols = ['#C2453A', '#8E3B6B', '#6D4C8C', '#B5652F', '#D9A441', '#7A4A3A', '#9B5DA8', '#C2453A'];
  for (let i = 0; i < cols.length; i++) { g.fillStyle = cols[i]; g.beginPath(); g.moveTo(0, i * 34 - 10); for (let x = 0; x <= 256; x += 8) g.lineTo(x, i * 34 - 10 + Math.sin(x / 26 + i) * 9); g.lineTo(256, 256); g.lineTo(0, 256); g.fill(); }
  const ch = flat('chamarel'), m = new THREE.Mesh(new THREE.CircleGeometry(0.75, 28), mats.toon(0xffffff, { map: new THREE.CanvasTexture(cv) }));
  m.rotation.x = -Math.PI / 2; m.position.set(ch.x, ch.level + 0.03, ch.z); m.receiveShadow = true; scene.add(m);
}

export function buildVegetation(rnd) {
  const { scene, mats } = ctx, inkMat = mats.inkMat;
  const puffs = [], pines = [];
  for (let k = 0; k < 14000 && puffs.length < 1300; k++) {
    const x = -30 + rnd() * 61, z = -37 + rnd() * 70, d = coastInfo(x, z);
    if (d < 0.55 || nearTown(x, z)) continue;
    const h = landHd(x, z, d), p = h > 1.45 && h < 3.8 ? 0.85 : h > 0.9 ? 0.22 : 0.05;
    if (rnd() > p) continue;
    if (h > 2.5 && rnd() < 0.45) { if (pines.length < 420) pines.push([x, h, z, 0.75 + rnd() * 0.6]); }
    else puffs.push([x, h, z, 0.65 + rnd() * 0.75, rnd()]);
  }
  const PC = [0x2FA35C, 0x3CB96A, 0x269552, 0x4CC774, 0x1F8A4C].map(h => new THREE.Color(h));
  const d = new THREE.Object3D();
  const pm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.36, 0), mats.toon(0xffffff), puffs.length);
  const pmo = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.36 * 1.2, 0), inkMat, puffs.length);
  puffs.forEach((t, i) => { d.position.set(t[0], t[1] + 0.26 * t[3], t[2]); d.rotation.set(0, t[4] * 6, 0); d.scale.set(t[3], t[3] * 1.12, t[3]); d.updateMatrix(); pm.setMatrixAt(i, d.matrix); pmo.setMatrixAt(i, d.matrix); pm.setColorAt(i, PC[Math.floor(t[4] * PC.length)]); });
  const cg = new THREE.ConeGeometry(0.28, 0.95, 6); cg.translate(0, 0.45, 0);
  const co = new THREE.ConeGeometry(0.35, 1.12, 6); co.translate(0, 0.42, 0);
  const cm = new THREE.InstancedMesh(cg, mats.toon(0x1E7F49), pines.length), cmo = new THREE.InstancedMesh(co, inkMat, pines.length);
  pines.forEach((t, i) => { d.position.set(t[0], t[1] - 0.05, t[2]); d.rotation.set(0, i, 0); d.scale.setScalar(t[3]); d.updateMatrix(); cm.setMatrixAt(i, d.matrix); cmo.setMatrixAt(i, d.matrix); });
  // palms along the beaches
  const palms = [];
  for (let i = 0; i < COAST.length; i++) {
    const a = COAST[i], b = COAST[(i + 1) % COAST.length], len = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.floor(len / 0.85);
    let nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
    if (coastInfo((a.x + b.x) / 2 + nx * 0.6, (a.z + b.z) / 2 + nz * 0.6) < 0) { nx = -nx; nz = -nz; }
    for (let s = 0; s < steps; s++) {
      if (rnd() < 0.3) continue;
      const t = (s + rnd()) / steps, off = 0.3 + rnd() * 0.65;
      const x = a.x + (b.x - a.x) * t + nx * off, z = a.z + (b.z - a.z) * t + nz * off;
      if (z > 27 && x > -9 && x < 6) continue;
      const h = landH(x, z); if (h < 0.06 || h > 0.9 || (nearTown(x, z) && rnd() < 0.6)) continue;
      palms.push([x, h, z, 0.8 + rnd() * 0.5, rnd()]);
    }
  }
  const tg = new THREE.CylinderGeometry(0.035, 0.055, 0.85, 5); tg.translate(0, 0.425, 0);
  const leaves = []; for (let k = 0; k < 6; k++) { const lg = new THREE.BoxGeometry(0.55, 0.035, 0.13); lg.translate(0.27, 0, 0); lg.rotateZ(-0.38); lg.rotateY(k * Math.PI / 3); leaves.push(lg); }
  const tm = new THREE.InstancedMesh(tg, mats.toon(0x9A6B43), palms.length), crm = new THREE.InstancedMesh(mergeGeos(leaves), mats.toon(0x2DBE5E), palms.length);
  const q = new THREE.Quaternion(), axis = new THREE.Vector3(), up = new THREE.Vector3(), qy = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  palms.forEach((p, i) => {
    axis.set(Math.cos(p[4] * 6.28), 0, Math.sin(p[4] * 6.28)); q.setFromAxisAngle(axis, 0.12 + p[4] * 0.2);
    d.position.set(p[0], p[1] - 0.03, p[2]); d.quaternion.copy(q); d.scale.setScalar(p[3]); d.updateMatrix(); tm.setMatrixAt(i, d.matrix);
    up.set(0, 0.85 * p[3], 0).applyQuaternion(q); d.position.set(p[0] + up.x, p[1] - 0.03 + up.y, p[2] + up.z);
    qy.setFromAxisAngle(Y, p[4] * 9); d.quaternion.copy(q).multiply(qy); d.updateMatrix(); crm.setMatrixAt(i, d.matrix);
  });
  for (const m of [pm, pmo, cm, cmo, tm, crm]) { m.frustumCulled = false; m.instanceMatrix.needsUpdate = true; if (m.material !== inkMat) { m.castShadow = true; m.receiveShadow = true; } scene.add(m); }
  if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
}

export function buildTowns(rnd) {
  const { scene, mats } = ctx, items = [];
  const PAL = [0xFFFFFF, 0xFFE3A3, 0xFFC9B5, 0xC6EAFF, 0xDCCBFF, 0xCFF2C9, 0xFFF1E0].map(h => new THREE.Color(h)), GL = new THREE.Color(0x8FD3FF);
  for (const t of TOWNS) {
    const ang = rnd() * Math.PI;
    for (let k = 0, n = 0; k < t.n * 5 && n < t.n; k++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * t.r, x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
      const d = coastInfo(x, z); if (d < 0.25) continue;
      const h = landHd(x, z, d), hh = t.h[0] + rnd() * (t.h[1] - t.h[0]) * (1 - r / t.r * 0.5), w = t.glass ? 0.32 + rnd() * 0.12 : 0.18 + rnd() * 0.2;
      items.push([x, h - 0.06, z, w, hh, t.glass ? w : 0.18 + rnd() * 0.2, ang + (rnd() < 0.2 ? 0.4 : 0), t.glass ? GL : PAL[Math.floor(rnd() * PAL.length)]]); n++;
    }
  }
  const bg = new THREE.BoxGeometry(1, 1, 1); bg.translate(0, 0.5, 0);
  const bo = new THREE.BoxGeometry(1.14, 1.06, 1.14); bo.translate(0, 0.49, 0);
  const bldMat = mats.toon(0xffffff, { emissive: 0xFFC75A, emissiveIntensity: 0 });
  const m = new THREE.InstancedMesh(bg, bldMat, items.length), mo = new THREE.InstancedMesh(bo, mats.inkMat, items.length), d = new THREE.Object3D();
  items.forEach((b, i) => { d.position.set(b[0], b[1], b[2]); d.rotation.set(0, b[6], 0); d.scale.set(b[3], b[4], b[5]); d.updateMatrix(); m.setMatrixAt(i, d.matrix); mo.setMatrixAt(i, d.matrix); m.setColorAt(i, b[7]); });
  m.castShadow = m.receiveShadow = true; m.frustumCulled = mo.frustumCulled = false; scene.add(m, mo);
  return bldMat;
}

function placeOn(obj, lat, lon, dy = 0) { const p = ll(lat, lon); obj.position.set(p.x, groundY(p.x, p.z) + dy, p.z); ctx.scene.add(obj); return obj; }

export function buildLandmarks() {
  const { toon, addInk } = ctx.mats;
  { // Cap Malheureux chapel
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.56), toon(0xFFFFFF)); body.position.y = 0.15; addInk(body, 1.1);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.3, 4), toon(0xE8463A)); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 1.55); roof.position.y = 0.45; addInk(roof, 1.1);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.14), toon(0xFFFFFF)); tower.position.set(0, 0.36, 0.3); addInk(tower, 1.12);
    g.add(body, roof, tower); body.castShadow = roof.castShadow = tower.castShadow = true; g.rotation.y = 0.5; g.scale.setScalar(1.6); placeOn(g, -19.989, 57.608, -0.02);
  }
  { // Grand Bassin temple
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.42), toon(0xFFF4E0)); b.position.y = 0.13; addInk(b, 1.1);
    const r = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.42, 4), toon(0xFF8A3D)); r.position.y = 0.47; r.rotation.y = Math.PI / 4; addInk(r, 1.1);
    g.add(b, r); g.scale.setScalar(1.5); b.castShadow = r.castShadow = true; placeOn(g, -20.414, 57.494, -0.02);
  }
  { // sugar-mill chimney
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 1.4, 8), toon(0xB5533C)); c.position.y = 0.7; addInk(c, 1.1); c.castShadow = true;
    const g = new THREE.Group(); g.add(c); g.scale.setScalar(1.3); placeOn(g, -20.092, 57.594, -0.05);
  }
  { // airport runway
    const f = flat('airport'), dir = new THREE.Vector3(0.643, 0, 0.766), g = new THREE.Group();
    const rw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 3.4), toon(0x4E4C63)); rw.receiveShadow = true; g.add(rw);
    const dash = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = -6; i <= 6; i++) { const ds = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.055, 0.14), dash); ds.position.z = i * 0.25; g.add(ds); }
    g.rotation.y = Math.atan2(dir.x, dir.z); g.position.set(f.x, f.level + 0.01, f.z); ctx.scene.add(g);
  }
}
