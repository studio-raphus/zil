// 3D engine: renderer, camera, controls, lights, day/night, camera flights, tap handling, frame loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ctx, makeMaterials } from './ctx.js';
import { buildWater, drawWater, buildTerrain, buildCoastAndLakes, buildVegetation, buildTowns, buildLandmarks, WATER_D, WATER_N } from './world.js';
import { buildLive, setLiveNight, liveScale } from './live.js';
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { clamp, lerp, reduced, isWide, mulberry32 } from '../core/util.js';

let tw = null, skyDay, skyNight, hemi, sun, stars, sea, bldMat, needle, lastAz = 99, last = performance.now();

export function initEngine(stageEl) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  stageEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 1, 5000);
  Object.assign(ctx, { renderer, scene, camera, mats: makeMaterials() });

  const gradTex = (a, b) => { const c = document.createElement('canvas'); c.width = 2; c.height = 256; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, 2, 256); return new THREE.CanvasTexture(c); };
  skyDay = gradTex('#58C2FF', '#D3F1FF'); skyNight = gradTex('#060A28', '#2B2F70');
  scene.background = skyDay;
  scene.fog = new THREE.Fog(0xD3F1FF, 280, 900);
  hemi = new THREE.HemisphereLight(0xffffff, 0x9fc3dd, 0.62); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff3dc, 0.82);
  sun.position.set(-34, 64, -26); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 1, far: 220 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const rnd = mulberry32(42);
  sea = buildWater();
  ctx.terrain = buildTerrain();
  buildCoastAndLakes();
  buildVegetation(rnd);
  bldMat = buildTowns(rnd);
  buildLandmarks();
  ctx.avatars = buildLive(rnd).avatars;

  { // stars
    const g = new THREE.BufferGeometry(), p = [], r3 = mulberry32(9);
    for (let i = 0; i < 500; i++) { const th = r3() * Math.PI * 2, ph = r3() * 1.25; p.push(Math.sin(ph) * Math.cos(th) * 1500, Math.cos(ph) * 1500 + 40, Math.sin(ph) * Math.sin(th) * 1500); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false })); stars.visible = false; scene.add(stars);
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.09, screenSpacePanning: false, minDistance: 7, maxDistance: 175, minPolarAngle: 0.12, maxPolarAngle: 1.3, zoomSpeed: 1.1, panSpeed: 1.0, rotateSpeed: 0.6 });
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  if (typeof controls.listenToKeyEvents === 'function') controls.listenToKeyEvents(window);
  controls.target.set(0, 0, 1);
  ctx.controls = controls;

  const od = overviewDist();
  if (reduced) camera.position.setFromSpherical(new THREE.Spherical(od, 0.82, 0)).add(controls.target);
  else { camera.position.setFromSpherical(new THREE.Spherical(od * 2.2, 0.15, -0.6)).add(controls.target); flyTo(0, 0, 1, od, 0.82, 0, 2600); }
  camera.lookAt(controls.target);

  bindInput(renderer.domElement);
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  needle = document.getElementById('needle');
  requestAnimationFrame(loop);
}

function bindInput(cv) {
  let dn = null, maxPtr = 0, active = 0;
  cv.addEventListener('pointerdown', e => {
    active++; maxPtr = Math.max(maxPtr, active);
    if (active === 1) dn = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (tw) endTween();
    bus.emit('map:interact');
  });
  cv.addEventListener('pointerup', e => {
    active = Math.max(0, active - 1);
    if (dn && active === 0) {
      if (maxPtr === 1 && Math.hypot(e.clientX - dn.x, e.clientY - dn.y) < 7 && performance.now() - dn.t < 600) onTap(e.clientX, e.clientY);
      dn = null; maxPtr = 0;
    }
  });
  cv.addEventListener('pointercancel', () => { active = 0; dn = null; maxPtr = 0; });
  cv.addEventListener('wheel', () => { if (tw) endTween(); bus.emit('map:interact'); }, { passive: true });
}

const ray = new THREE.Raycaster();
function onTap(cx, cy) {
  ray.setFromCamera(new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1), ctx.camera);
  if (state.addMode) {
    const hit = ray.intersectObject(ctx.terrain, false)[0];
    if (!hit || hit.point.y < 0.04) bus.emit('snack', 'That’s the lagoon! Tap on land to drop your spot.');
    else bus.emit('map:ground', hit.point);
    return;
  }
  for (const h of ray.intersectObjects(ctx.tappables, true)) {
    let o = h.object; while (o && !o.userData.tap) o = o.parent;
    if (o) { o.userData.tap(o, h, cx, cy); return; }
  }
  bus.emit('map:empty');
}

export function overviewDist() {
  const t = Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov / 2));
  return clamp(Math.max(27 / t, 31 / (t * ctx.camera.aspect)) * 0.95, 50, 155);
}

export function flyTo(tx, ty, tz, r, phi, theta, dur = 1300) {
  const { controls, camera } = ctx;
  controls.enableDamping = false; controls.update(); controls.enableDamping = true;
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  let dth = (theta === undefined ? sph.theta : theta) - sph.theta; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
  tw = {
    t0: controls.target.clone(), t1: new THREE.Vector3(tx, ty, tz), r0: sph.radius, r1: clamp(r, controls.minDistance, controls.maxDistance),
    p0: sph.phi, p1: phi === undefined ? sph.phi : phi, th0: sph.theta, dth,
    hop: Math.min(36, Math.hypot(tx - controls.target.x, tz - controls.target.z) * 0.35), start: performance.now(), dur: reduced ? 1 : dur
  };
}
function endTween() { tw = null; ctx.controls.update(); }
function stepTween(now) {
  const { controls, camera } = ctx;
  const k = clamp((now - tw.start) / tw.dur, 0, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  controls.target.lerpVectors(tw.t0, tw.t1, e);
  camera.position.setFromSpherical(new THREE.Spherical(lerp(tw.r0, tw.r1, e) + Math.sin(Math.PI * e) * tw.hop, lerp(tw.p0, tw.p1, e), tw.th0 + tw.dth * e)).add(controls.target);
  camera.lookAt(controls.target);
  if (k >= 1) endTween();
}
export const azimuth = () => Math.atan2(ctx.camera.position.x - ctx.controls.target.x, ctx.camera.position.z - ctx.controls.target.z);
export const home = () => flyTo(0, 0, 1, overviewDist(), 0.82, 0);
export function northUp() { const s = new THREE.Spherical().setFromVector3(ctx.camera.position.clone().sub(ctx.controls.target)); const t = ctx.controls.target; flyTo(t.x, t.y, t.z, s.radius, s.phi, 0, 700); }

/** Fly to a point, leaving room for the bottom sheet (phones) or side panel (wide screens). */
export function focusPoint(pos, dist) {
  const d = dist || (isWide() ? 22 : 30), th = azimuth();
  let tx = pos.x, tz = pos.z;
  if (isWide()) { tx -= Math.cos(th) * d * 0.17; tz += Math.sin(th) * d * 0.17; }
  else { tx += Math.sin(th) * d * 0.3; tz += Math.cos(th) * d * 0.3; }
  flyTo(tx, pos.y * 0.6, tz, d, 0.95, th);
}

export function setNight(on) {
  ctx.night = on;
  const scene = ctx.scene;
  scene.background = on ? skyNight : skyDay; scene.fog.color.set(on ? 0x2B2F70 : 0xD3F1FF);
  hemi.color.set(on ? 0x8090FF : 0xffffff); hemi.groundColor.set(on ? 0x151538 : 0x9fc3dd); hemi.intensity = on ? 0.5 : 0.62;
  sun.color.set(on ? 0xAFC0FF : 0xfff3dc); sun.intensity = on ? 0.42 : 0.82; sun.position.set(on ? 26 : -34, on ? 58 : 64, on ? -30 : -26);
  drawWater(on); sea.outerSea.material.color.set(on ? WATER_N.deep : WATER_D.deep);
  sea.waves.material.opacity = on ? 0.14 : 0.33; stars.visible = on;
  bldMat.emissiveIntensity = on ? 0.6 : 0;
  setLiveNight(on);
}

function loop(now) {
  requestAnimationFrame(loop);
  const { controls, camera, renderer, scene } = ctx;
  const dt = Math.min(0.05, (now - last) / 1000), t = now / 1000; last = now;
  if (tw) stepTween(now); else controls.update();
  const tx = clamp(controls.target.x, -36, 36), tz = clamp(controls.target.z, -40, 38);
  if (tx !== controls.target.x || tz !== controls.target.z) {
    camera.position.x += tx - controls.target.x; camera.position.z += tz - controls.target.z; controls.target.x = tx; controls.target.z = tz;
  }
  const r = camera.position.distanceTo(controls.target);
  ctx.liveK = liveScale(r);
  const map = sea.waves.material.map;
  map.offset.x = (map.offset.x + dt * 0.02 * (reduced ? 0.5 : 1)) % 1; map.offset.y = Math.sin(t * 0.3) * 0.02;
  for (const fn of ctx.frameHooks) fn(now, dt, t, r);
  renderer.render(scene, camera);
  bus.emit('frame', r);
  const az = azimuth();
  if (needle && Math.abs(az - lastAz) > 0.002) { needle.style.transform = `rotate(${az}rad)`; lastAz = az; }
}
