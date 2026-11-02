// Live 3D layer: boats, cargo ship, plane circuit, dolphins, clouds, busy-place glows and avatars.
import * as THREE from 'three';
import { ctx, mergeGeos } from './ctx.js';
import { ll, flat, groundY } from './geo.js';
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { clamp, reduced } from '../core/util.js';
import { config } from '../config.js';

const INK = 0x1B1A2E;
const boats = [], dolphins = [], clouds = [], heats = [], avatars = [];
let plane = null, ship = null, youRing = null, cloudMat = null, heatTex = null;

const tap = (o, fn) => { o.userData.tap = fn; ctx.tappables.push(o); };
const curveOf = pts => new THREE.CatmullRomCurve3(pts.map(([a, b]) => { const p = ll(a, b); return new THREE.Vector3(p.x, 0.03, p.z); }), true, 'centripetal');
const shadows = g => g.traverse(o => { if (o.isMesh && o.material.type !== 'MeshBasicMaterial') o.castShadow = true; });

export function buildLive(rnd) {
  const { scene } = ctx, { toon, addInk } = ctx.mats;

  const boatPaths = [
    [[-20.000, 57.582], [-19.965, 57.598], [-19.945, 57.640], [-19.972, 57.650], [-19.995, 57.610]],
    [[-20.236, 57.797], [-20.252, 57.810], [-20.282, 57.828], [-20.296, 57.800], [-20.262, 57.795]],
    [[-20.330, 57.355], [-20.305, 57.330], [-20.345, 57.318], [-20.360, 57.345]],
    [[-20.438, 57.722], [-20.452, 57.732], [-20.462, 57.722], [-20.455, 57.712]],
    [[-20.420, 57.322], [-20.405, 57.300], [-20.440, 57.290], [-20.452, 57.300]]
  ];
  const sailCols = [0xFF5A36, 0xFFC83D, 0x45B8FF, 0xFF4F8B, 0x3DD47E];
  const msgs = ['Catamaran to Coin de Mire', 'Shuttle boat to Île aux Cerfs', 'Dolphin-watch boat, Tamarin', 'Glass-bottom boat, Blue Bay', 'Kite-surf rescue boat, Le Morne'];
  boatPaths.forEach((path, i) => {
    const g = new THREE.Group();
    for (const sx of [-0.12, 0.12]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.56), toon(0xFFFFFF)); h.position.set(sx, 0.03, 0); addInk(h, 1.18); g.add(h); }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.4), toon(0xD9A86C)); deck.position.y = 0.08; g.add(deck);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 5), toon(0x5A4A3A)); mast.position.y = 0.4; g.add(mast);
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, 0.52); sh.lineTo(0.32, 0.02); sh.lineTo(0, 0);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh), toon(sailCols[i], { side: THREE.DoubleSide })); sail.rotation.y = -Math.PI / 2; sail.position.set(0, 0.12, 0.02); g.add(sail);
    shadows(g); scene.add(g); tap(g, () => bus.emit('snack', msgs[i]));
    const curve = curveOf(path);
    boats.push({ obj: g, curve, len: curve.getLength(), u: rnd(), speed: 0.55 + rnd() * 0.3, ph: rnd() * 6 });
  });

  { // cargo ship off Port Louis
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 1.4), toon(0xD84B3A)); hull.position.y = 0.04; addInk(hull, 1.08); g.add(hull);
    [0x45B8FF, 0xFFC83D, 0x3DD47E, 0xFF7A59, 0xB49BFF].forEach((c, i) => { const ct = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.18), toon(c)); ct.position.set(0, 0.16, 0.42 - i * 0.2); g.add(ct); });
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.16), toon(0xFFFFFF)); br.position.set(0, 0.22, -0.58); addInk(br, 1.1); g.add(br);
    shadows(g); scene.add(g); tap(g, () => bus.emit('snack', 'Container ship heading into Port Louis harbour'));
    const curve = curveOf([[-20.152, 57.478], [-20.13, 57.43], [-20.08, 57.33], [-20.03, 57.25], [-20.12, 57.28], [-20.172, 57.40]]);
    ship = { obj: g, curve, len: curve.getLength(), u: 0.3, speed: 0.35, ph: 1 };
  }

  { // plane circuit over the airport
    const g = new THREE.Group(), white = toon(0xFFFFFF), red = toon(0xFF5A36);
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 8), white); fus.rotation.x = Math.PI / 2; addInk(fus, 1.12); g.add(fus);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 8), white); nose.rotation.x = Math.PI / 2; nose.position.z = 0.55; g.add(nose);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 8), white); tail.rotation.x = -Math.PI / 2; tail.position.z = -0.57; g.add(tail);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.03, 0.2), red); wing.position.z = 0.04; addInk(wing, 1.08); g.add(wing);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.24, 0.18), red); fin.position.set(0, 0.13, -0.4); g.add(fin);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.02, 0.1), red); stab.position.z = -0.42; g.add(stab);
    shadows(g); scene.add(g); tap(g, () => bus.emit('snack', 'Flight on approach to SSR International Airport'));
    const f = flat('airport'), dir = new THREE.Vector3(0.643, 0, 0.766), perp = new THREE.Vector3(0.766, 0, -0.643), c0 = new THREE.Vector3(f.x, f.level + 0.1, f.z);
    const P = (s, p, y) => c0.clone().addScaledVector(dir, s).addScaledVector(perp, p).setY(f.level + y);
    const curve = new THREE.CatmullRomCurve3([P(-1.6, 0, 0.12), P(1.7, 0, 0.3), P(5, 0.5, 2.2), P(9, 5, 4.5), P(4, 12, 6.5), P(-8, 11, 6), P(-12, 4, 3.6), P(-6, 0.3, 1.2)], true, 'centripetal');
    plane = { obj: g, curve, len: curve.getLength(), u: 0, speed: 2.2 };
  }

  { // dolphins in Tamarin Bay
    const tp = ll(-20.318, 57.336), mat = toon(0x6E8FB3);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat); body.scale.set(0.8, 0.8, 2.6); addInk(body, 1.12); g.add(body);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), mat); fin.position.set(0, 0.12, -0.02); fin.rotation.x = -0.4; g.add(fin);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.08), mat); tl.position.z = -0.34; g.add(tl);
      scene.add(g); tap(g, () => bus.emit('select', 'tamarin'));
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.24, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; scene.add(ring);
      dolphins.push({ obj: g, ring, cx: tp.x, cz: tp.z, a: i * 2.1, off: i * 1.05 });
    }
  }

  // clouds (tap to poof)
  cloudMat = toon(0xFFFFFF);
  const cinkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  for (let i = 0; i < 10; i++) {
    const parts = [], inks = [], n = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const r = 0.8 + rnd() * 0.9, x = (k - n / 2) * 0.9 + rnd() * 0.4, y = rnd() * 0.4, z = (rnd() - 0.5) * 1.2;
      const s = new THREE.IcosahedronGeometry(r, 1); s.translate(x, y, z); parts.push(s);
      const so = new THREE.IcosahedronGeometry(r * 1.09, 1); so.translate(x, y, z); inks.push(so);
    }
    const m = new THREE.Mesh(mergeGeos(parts), cloudMat); m.add(new THREE.Mesh(mergeGeos(inks), cinkMat)); m.castShadow = true;
    m.position.set(-55 + rnd() * 110, 10 + rnd() * 4, -40 + rnd() * 80); m.scale.set(1, 0.75, 1);
    scene.add(m);
    const c = { obj: m, v: 0.5 + rnd() * 0.5, poof: 0, gone: 0 };
    tap(m, (o, h, cx, cy) => { if (c.poof) return; c.poof = performance.now(); bus.emit('poof', cx, cy); });
    clouds.push(c);
  }

  { // glow texture for busy places
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,90,140,0.95)'); gr.addColorStop(0.45, 'rgba(255,150,60,0.45)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); heatTex = new THREE.CanvasTexture(c);
  }

  // avatars: you + two demo travel buddies
  const crew = [
    { lat: config.youLatLon[0], lon: config.youLatLon[1], b: 0xFF5A36, c: 0xFFC83D, s: 0xD9A07A, label: 'You', me: true, msg: 'That’s you, at your hotel in Pereybère (demo location).' },
    { lat: -20.441, lon: 57.333, b: 0x45B8FF, c: 0x3DD47E, s: 0x8D5A3B, label: 'Aïsha · on the trail', msg: 'Aïsha is halfway up Le Morne and just sent you a wave.' },
    { lat: -20.268, lon: 57.803, b: 0xB49BFF, c: 0xFF4F8B, s: 0xF2C9A5, label: 'Tom · sandbank chill', msg: 'Tom is on the Île aux Cerfs sandbank. Boats back every 20 min.' }
  ];
  for (const cr of crew) {
    const g = makeAvatar(cr.b, cr.c, cr.s), p = ll(cr.lat, cr.lon), y = groundY(p.x, p.z);
    g.position.set(p.x, y, p.z); g.rotation.y = 0.4; scene.add(g); tap(g, () => bus.emit('snack', cr.msg));
    avatars.push({ obj: g, y, ph: avatars.length * 1.7, label: cr.label, me: !!cr.me });
    if (cr.me) {
      ctx.you = new THREE.Vector3(p.x, y, p.z);
      youRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 28), new THREE.MeshBasicMaterial({ color: 0xFF5A36, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      youRing.rotation.x = -Math.PI / 2; youRing.position.set(p.x, y + 0.03, p.z); scene.add(youRing);
    }
  }

  ctx.frameHooks.push(animate);
  return { avatars, cloudMat };
}

function makeAvatar(bodyC, capC, skin) {
  const { toon, addInk } = ctx.mats, g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 12), toon(bodyC)); body.position.y = 0.25; addInk(body, 1.1);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), toon(skin)); head.position.y = 0.74; addInk(head, 1.09);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.275, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(capC)); cap.position.y = 0.77;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.16), toon(capC)); brim.position.set(0, 0.78, 0.26);
  const eyeM = new THREE.MeshBasicMaterial({ color: INK });
  for (const sx of [-0.085, 0.085]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeM); e.position.set(sx, 0.72, 0.235); g.add(e); }
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02;
  g.add(body, head, cap, brim, sh); body.castShadow = head.castShadow = true;
  return g;
}

/** Rebuild the glows from the current live status (called on load and on live updates). */
export function syncHeats() {
  for (const s of heats) ctx.scene.remove(s);
  heats.length = 0;
  for (const p of state.places.filter(p => p.hot)) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heatTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: ctx.night ? 0.95 : 0.6 }));
    s.position.set(p.pos.x, p.pos.y + 0.6, p.pos.z); s.userData.ph = Math.random() * 6; s.userData.cat = p.cat;
    ctx.scene.add(s); heats.push(s);
  }
  filterHeats(state.filter);
}
export function filterHeats(f) { heats.forEach(h => { h.visible = f === 'all' || f === 'live' || h.userData.cat === f; }); }
export function setLiveNight(on) { cloudMat.color.set(on ? 0x9AA6D6 : 0xffffff); heats.forEach(s => { s.material.opacity = on ? 0.95 : 0.6; }); }

function animate(now, dt, t) {
  const k = ctx.liveK, sp = reduced ? 0.5 : 1;
  for (const b of boats.concat(ship ? [ship] : [])) {
    b.u = (b.u + dt * b.speed * sp / b.len) % 1;
    const p = b.curve.getPointAt(b.u), tg = b.curve.getTangentAt(b.u), y = 0.03 + Math.sin(t * 2.2 + b.ph) * 0.02;
    b.obj.position.set(p.x, y, p.z); b.obj.lookAt(p.x + tg.x, y, p.z + tg.z); b.obj.rotateZ(Math.sin(t * 1.7 + b.ph) * 0.06);
    b.obj.scale.setScalar(b === ship ? Math.max(1, k * 0.8) : k);
  }
  if (plane) {
    plane.u = (plane.u + dt * plane.speed * sp / plane.len) % 1;
    const p = plane.curve.getPointAt(plane.u), tg = plane.curve.getTangentAt(plane.u);
    plane.obj.position.copy(p); plane.obj.lookAt(p.x + tg.x, p.y + tg.y, p.z + tg.z); plane.obj.scale.setScalar(Math.min(k, 2.6));
  }
  for (const d of dolphins) {
    d.a += dt * 0.25 * sp; const cx = d.cx + Math.cos(d.a) * 1.0, cz = d.cz + Math.sin(d.a) * 0.7, cyc = (t + d.off) % 3.4;
    if (cyc < 1) {
      const y = Math.sin(cyc * Math.PI) * 0.55 * Math.min(k, 2) - 0.04; d.obj.visible = true; d.obj.position.set(cx, y, cz);
      d.obj.lookAt(cx - Math.sin(d.a), y + Math.cos(cyc * Math.PI) * 0.9, cz + Math.cos(d.a) * 0.7);
    } else d.obj.visible = false;
    d.obj.scale.setScalar(Math.min(k, 2.4));
    const rr = cyc - 1; d.ring.position.set(cx, 0.03, cz);
    if (rr > 0 && rr < 0.8) { d.ring.material.opacity = 0.9 * (1 - rr / 0.8); d.ring.scale.setScalar((1 + rr * 3) * Math.min(k, 2.4)); } else d.ring.material.opacity = 0;
  }
  for (const c of clouds) {
    c.obj.position.x -= dt * c.v * sp; if (c.obj.position.x < -62) c.obj.position.x = 62;
    if (c.poof) { const q = (now - c.poof) / 500; if (q < 1) c.obj.scale.set(1 + q * 0.4, (1 + q * 0.4) * 0.75, 1 + q * 0.4); else if (!c.gone) { c.obj.visible = false; c.gone = now; } }
    if (c.gone && now - c.gone > 7000) { c.obj.visible = true; c.obj.scale.set(1, 0.75, 1); c.obj.position.x = 60; c.poof = 0; c.gone = 0; }
  }
  for (const s of heats) s.scale.setScalar(5.5 * (1 + Math.sin(t * 2 + s.userData.ph) * 0.12) * Math.min(k, 2));
  for (const a of avatars) { a.obj.scale.setScalar(k * 1.15); a.obj.position.y = a.y + Math.abs(Math.sin(t * 3 + a.ph)) * 0.06 * k; }
  if (youRing) { const f = (t % 1.6) / 1.6; youRing.scale.setScalar((1 + f * 1.6) * k); youRing.material.opacity = 0.9 * (1 - f); }
}

export const liveScale = r => clamp(r / 26, 1, 3.4);
