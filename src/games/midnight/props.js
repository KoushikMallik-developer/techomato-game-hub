// Midnight Pursuit street props, modelled in detail: a cast-iron hydrant (lathed barrel, bonnet, outlet
// caps with pentagon nuts), a ribbed steel litter bin with a domed lid, a fluted lamp column with a
// cobra-head luminaire, and traffic signal heads with visors and backplates. Geometry is shared and
// instanced by world.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ni = (g) => (g.index ? g.toNonIndexed() : g);
const lathe = (pts, seg = 20) => ni(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
const T = (g, x, y, z) => { g.translate(x, y, z); return g; };
const R = (g, x, y, z) => { if (x) g.rotateX(x); if (y) g.rotateY(y); if (z) g.rotateZ(z); return g; };
const merge = (list) => mergeGeometries(list.map((g) => { const q = ni(g); if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2)); return q; }));

export function hydrantGeometry() {
  const parts = [];
  // base flange with bolts, barrel, bonnet and its top nut
  parts.push(lathe([[0, 0], [0.2, 0], [0.2, 0.05], [0.17, 0.07], [0.15, 0.09], [0.145, 0.4], [0.15, 0.46], [0.165, 0.5], [0.165, 0.55], [0.15, 0.57], [0.13, 0.62], [0.09, 0.68], [0.05, 0.71], [0, 0.72]], 24));
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; parts.push(T(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 6), Math.cos(a) * 0.18, 0.065, Math.sin(a) * 0.18)); }
  parts.push(T(new THREE.CylinderGeometry(0.035, 0.04, 0.07, 5), 0, 0.75, 0)); // pentagon operating nut
  // outlet nozzles: two side hose outlets and a big pumper outlet facing the street
  const nozzle = (dir, r, len, y) => {
    const n = R(T(new THREE.CylinderGeometry(r, r * 1.08, len, 16), 0, len / 2 + 0.12, 0), 0, 0, 0);
    const cap = T(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.05, 16), 0, len + 0.12 + 0.025, 0);
    const nut = T(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 5), 0, len + 0.12 + 0.07, 0);
    const chainRing = T(R(new THREE.TorusGeometry(r * 1.15, 0.008, 6, 16), Math.PI / 2, 0, 0), 0, len + 0.1, 0);
    return [n, cap, nut, chainRing].map((g) => T(R(g, 0, 0, -Math.PI / 2), 0, 0, 0)).map((g) => T(R(g, 0, dir, 0), 0, y, 0));
  };
  parts.push(...nozzle(0, 0.05, 0.08, 0.38), ...nozzle(Math.PI, 0.05, 0.08, 0.38), ...nozzle(-Math.PI / 2, 0.07, 0.1, 0.3));
  return merge(parts);
}

export function binGeometry() {
  const parts = [];
  // ribbed body: a lathed tub with vertical ribs, a band at the top, a domed lid with a dark opening ring
  parts.push(lathe([[0, 0], [0.26, 0], [0.27, 0.03], [0.28, 0.85], [0.3, 0.87], [0.3, 0.92], [0.28, 0.93], [0.26, 0.92]], 28));
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; parts.push(R(T(new THREE.BoxGeometry(0.03, 0.78, 0.025), Math.cos(a) * 0.282, 0.45, Math.sin(a) * 0.282), 0, -a, 0)); }
  parts.push(lathe([[0.3, 0.93], [0.31, 0.95], [0.28, 1.02], [0.2, 1.08], [0.1, 1.11], [0, 1.12]], 24));
  // base feet
  parts.push(T(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 20), 0, 0.02, 0));
  return merge(parts);
}

// local +z is the arm direction; the luminaire hangs at (0, 9.4, 2.9) like the original placement
export function lampGeometry() {
  const parts = [];
  // plinth and fluted column
  parts.push(lathe([[0, 0], [0.3, 0], [0.3, 0.08], [0.26, 0.12], [0.26, 0.55], [0.22, 0.62], [0.16, 0.7], [0.15, 0.8]], 16));
  const col = new THREE.CylinderGeometry(0.09, 0.15, 8.0, 16, 8);
  const p = col.attributes.position;
  for (let i = 0; i < p.count; i++) { // flutes
    const x = p.getX(i); const z = p.getZ(i); const a = Math.atan2(z, x); const k = 1 + Math.cos(a * 16) * 0.035;
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  col.computeVertexNormals();
  parts.push(T(col, 0, 4.8, 0));
  parts.push(T(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 16), 0, 8.8, 0)); // collar
  // curved arm
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 8.8, 0), new THREE.Vector3(0, 9.45, 0.45), new THREE.Vector3(0, 9.6, 1.6), new THREE.Vector3(0, 9.55, 2.4)]);
  parts.push(new THREE.TubeGeometry(curve, 16, 0.055, 8, false));
  // cobra-head luminaire: a stretched, flattened dome
  const head = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  head.scale(0.24, 0.13, 0.62);
  parts.push(T(head, 0, 9.48, 2.9));
  parts.push(T(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 20).scale(1, 1, 2.58), 0, 9.47, 2.9));
  return merge(parts);
}
export function lampLensGeometry() {
  // the refractor bowl under the head (emissive)
  const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  g.scale(0.2, 0.06, 0.52);
  g.translate(0, 9.44, 2.9);
  return merge([g]);
}

// a three-lamp signal head with visors and a backplate; lamps at y = 0, -0.38, -0.76 (relative), facing -z
export function signalHeadGeometry() {
  const parts = [];
  parts.push(T(new THREE.BoxGeometry(0.36, 1.18, 0.3), 0, -0.38, 0)); // housing
  parts.push(T(new THREE.BoxGeometry(0.62, 1.42, 0.03), 0, -0.38, 0.17)); // backplate
  for (let k = 0; k < 3; k++) {
    const visor = new THREE.CylinderGeometry(0.16, 0.16, 0.24, 16, 1, true, -Math.PI * 0.6, Math.PI * 1.2);
    visor.rotateX(Math.PI / 2);
    visor.rotateZ(Math.PI);
    visor.translate(0, -k * 0.38, -0.27);
    parts.push(visor);
  }
  return merge(parts);
}
