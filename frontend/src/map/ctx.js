// Shared 3D context: filled by engine.js, read by the world/live/route builders and the overlay.
import * as THREE from 'three';

export const ctx = {
  THREE,
  renderer: null, scene: null, camera: null, controls: null,
  terrain: null, mats: null,
  tappables: [],      // objects with userData.tap(obj, hit, clientX, clientY)
  frameHooks: [],     // fn(now, dt, t, cameraDistance) called every frame
  liveK: 1,           // zoom-based scale for live props so they stay visible far out
  night: false,
  paused: false,      // true while the street map covers the 3D island
  you: null,          // THREE.Vector3 where routes start (device location, or the fallback start)
  youLL: null         // { lat, lon, real: bool } for the same point
};

export function makeMaterials() {
  const grad = new THREE.DataTexture(new Uint8Array([118, 188, 255]), 3, 1, THREE.LuminanceFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.generateMipmaps = false; grad.needsUpdate = true;
  const toon = (color, o) => new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: grad }, o || {}));
  const inkMat = new THREE.MeshBasicMaterial({ color: 0x1B1A2E, side: THREE.BackSide });
  const addInk = (mesh, s = 1.08) => { const o = new THREE.Mesh(mesh.geometry, inkMat); o.scale.setScalar(s); mesh.add(o); return o; };
  return { grad, toon, inkMat, addInk };
}

export function mergeGeos(list) {
  const pos = [], nor = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
