// Core Breach anatomy: sculpted geometry for realistic agents. Every part is generated in code (no files):
// a head sculpted from a sphere (brow ridge, eye sockets, cheekbones, nose, lips, jaw and chin), eyes with
// iris and pupil, ears, a torso built ring by ring (chest, ribcage, waist, shoulders and trapezius), muscled
// limb segments, gloved hands with jointed fingers, combat boots with tread, curved armour plates, pouches
// with flaps, and fabric/skin/webbing surface maps. Geometries are cached and shared between agents.
import * as THREE from 'three';

const cache = new Map();
const shared = (g) => { g.userData.shared = true; return g; };
const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, shared(fn())); return cache.get(key); };
const gauss = (d2, s) => Math.exp(-d2 / (2 * s * s));
const smooth = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

// ───────────── head ─────────────
// a unit-ish sphere pushed into a human head; the face looks down -z
function sculpt(v, variant) {
  let { x, y, z } = v;
  const front = Math.max(0, -z); // 0 at the sides/back, 1 at the face centre
  const wide = variant % 2 ? 1.04 : 1;
  x *= 0.74 * wide; z *= 0.97;
  if (v.z > 0 && v.y > -0.3) z *= 1.06; // fuller back of the skull
  if (v.y < -0.15) { // jaw and chin narrow toward the neck
    const t = smooth(-0.15, -1, v.y);
    x *= 1 - t * 0.3;
    if (v.z > -0.2) z *= 1 - t * 0.5; else z *= 1 - t * 0.06;
    // square the jaw a little at its corners
    x *= 1 + gauss((v.y + 0.55) ** 2, 0.12) * gauss((Math.abs(v.x) - 0.6) ** 2, 0.2) * 0.06;
    y = -0.15 + (y + 0.15) * (1 - t * 0.1);
  }
  x *= 1 - gauss((v.y - 0.25) ** 2, 0.25) * 0.06; // temples
  const brow = gauss((v.y - 0.3) ** 2, 0.06) * gauss(v.x ** 2, 0.5) * front;
  z -= brow * 0.08;
  [-1, 1].forEach((s) => { z += gauss((v.x - 0.36 * s) ** 2 * 0.8 + (v.y - 0.16) ** 2 * 1.4, 0.1) * front * 0.09; }); // eye sockets
  [-1, 1].forEach((s) => { const c = gauss((v.x - 0.5 * s) ** 2 + (v.y + 0.02) ** 2, 0.12) * front; z -= c * 0.035; }); // cheekbones
  [-1, 1].forEach((s) => { z += gauss((v.x - 0.5 * s) ** 2 + (v.y + 0.32) ** 2, 0.12) * front * 0.025; }); // hollow under the cheekbones
  const bridge = gauss(v.x ** 2, 0.04 + smooth(0.1, -0.3, v.y) * 0.035) * smooth(0.22, 0.08, v.y) * smooth(-0.34, -0.24, v.y) * front;
  const tip = gauss(v.x ** 2 * 1.3 + (v.y + 0.25) ** 2, 0.055) * front;
  const under = gauss(v.x ** 2 + (v.y + 0.33) ** 2, 0.04) * front; // tuck under the tip
  z -= bridge * 0.2 + tip * 0.13 - under * 0.02;
  [-1, 1].forEach((s) => { z -= gauss((v.x - 0.12 * s) ** 2 + (v.y + 0.27) ** 2, 0.045) * front * 0.05; }); // nostril wings
  z += gauss(v.x ** 2 + (v.y + 0.37) ** 2, 0.035) * front * 0.02; // philtrum
  const mw = smooth(0.32, 0.18, Math.abs(v.x)); // mouth width
  z -= gauss((v.y + 0.43) ** 2, 0.03) * mw * front * 0.05; // upper lip
  z += gauss((v.y + 0.475) ** 2, 0.01) * mw * front * 0.045; // mouth line
  z -= gauss((v.y + 0.52) ** 2, 0.03) * mw * front * 0.045; // lower lip
  z += gauss(v.x ** 2 + (v.y + 0.6) ** 2, 0.04) * front * 0.025; // dip under the lip
  z -= gauss(v.x ** 2 * 0.8 + (v.y + 0.74) ** 2, 0.09) * front * 0.05; // chin
  return [x, y, z];
}

// a sphere pushed into a human head; the face looks down -z
export function headGeometry(variant = 0) {
  return memo(`head${variant}`, () => {
    const g = new THREE.SphereGeometry(1, 96, 72);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); p.setXYZ(i, ...sculpt(v, variant)); }
    g.computeVertexNormals();
    return g;
  });
}

// hair that follows the skull: a slightly inflated head, trimmed at a hairline (front, temples, nape)
// style: 0 short crop, 1 longer at the back, 2 swept fringe
export function hairGeometry(variant = 0, style = 0) {
  return memo(`hair${variant}_${style}`, () => {
    const g = new THREE.SphereGeometry(1, 40, 28);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const ang = Math.atan2(v.x, -v.z); // 0 at the face, ±pi at the back
      const a = Math.abs(ang) / Math.PI;
      let line = a < 0.18 ? 0.5 - (style === 2 ? 0.12 * Math.max(0, Math.sin(ang * 6)) : 0) : a < 0.42 ? 0.5 - (a - 0.18) * 1.7 : 0.09 - (a - 0.42) * (style === 1 ? 2.4 : 1.25);
      // sideburns in front of the ears
      if (a > 0.3 && a < 0.4) line -= 0.12;
      if (v.y < line) v.y = line + (v.y - line) * 0.02;
      const [x, y, z] = sculpt(v, variant);
      const k = 1.06 + (style === 2 && a < 0.25 && v.y > 0.4 ? 0.04 : 0);
      p.setXYZ(i, x * k, y * k + 0.01, z * k);
    }
    g.computeVertexNormals();
    return g;
  });
}

// eyeball: white sclera with a coloured iris and dark pupil drawn by vertex colours (faces -z)
export function eyeGeometry() {
  return memo('eye', () => {
    const g = new THREE.SphereGeometry(1, 40, 30);
    g.rotateX(Math.PI / 2); // put the sphere's pole at the front so the iris rings follow its latitude lines
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      // the cornea bulges slightly over the iris
      if (z < -0.82) p.setZ(i, z - (z + 0.82) * -0.35);
      const ang = Math.atan2(p.getY(i), p.getX(i));
      const fib = 0.85 + 0.15 * Math.sin(ang * 23);
      const c = z < -0.955 ? [0.01, 0.01, 0.012] : z < -0.84 ? [0.2 * fib, 0.13 * fib, 0.07 * fib] : z < -0.8 ? [0.05, 0.035, 0.025] : [0.82, 0.78, 0.74];
      col.set(c, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
}

// eyelids: an upper lid covering the top of the eyeball and a thinner lower lid (unit eyeball space)
export function lidGeometry(upper) {
  return memo(`lid${upper}`, () => {
    const g = new THREE.SphereGeometry(1.08, 28, 12, 0, Math.PI * 2, 0, Math.PI * (upper ? 0.39 : 0.33));
    if (!upper) g.rotateX(Math.PI);
    g.rotateX(upper ? -0.35 : 0.15); // tilt to open toward the front
    g.scale(1.05, 1, 1);
    return g;
  });
}

export function earGeometry() {
  return memo('ear', () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.5); s.bezierCurveTo(0.45, 0.55, 0.5, 0.0, 0.3, -0.35); s.bezierCurveTo(0.2, -0.55, -0.05, -0.55, -0.1, -0.3); s.bezierCurveTo(-0.15, 0.1, -0.2, 0.45, 0, 0.5);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3, curveSegments: 10 });
    g.translate(0, 0, -0.06);
    g.rotateY(Math.PI / 2);
    return g;
  });
}

// ───────────── torso ─────────────
// rings from the pelvis (y=0) to the base of the neck; cross-sections are super-ellipses with a fuller chest
export function torsoGeometry(build = 1, t0 = 0, t1 = 1, inflate = 1) {
  return memo(`torso${build}_${t0}_${t1}_${inflate}`, () => {
    const RINGS = 28; const SEG = 32;
    const H = 0.56;
    const pos = []; const idx = [];
    const wAt = (t) => {
      // half-width: hips 0.15, waist 0.135, ribcage 0.16, chest/lats 0.18, shoulders 0.2, then a slope into the neck
      if (t < 0.18) return 0.15 - t * 0.08;
      if (t < 0.5) return 0.136 + (t - 0.18) * 0.14;
      if (t < 0.8) return 0.18 + (t - 0.5) * 0.08;
      return 0.204 - Math.pow((t - 0.8) / 0.2, 1.8) * 0.13;
    };
    const dAt = (t) => {
      if (t < 0.2) return 0.1;
      if (t < 0.85) return 0.1 + Math.sin(((t - 0.2) / 0.65) * Math.PI) * 0.025;
      return 0.1 - Math.pow((t - 0.85) / 0.15, 1.5) * 0.03;
    };
    for (let r = 0; r <= RINGS; r++) {
      const t = t0 + (r / RINGS) * (t1 - t0);
      const y = t * H;
      const a = wAt(t) * build * inflate; const b = dAt(t) * build * inflate;
      for (let s = 0; s <= SEG; s++) {
        const th = (s / SEG) * Math.PI * 2;
        const c = Math.cos(th); const sn = Math.sin(th);
        const e = 2.6; // super-ellipse: boxier than a cylinder
        let x = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
        let z = b * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e);
        // chest (front is -z): pectorals, then the abdomen sits flatter
        if (z < 0) {
          const pec = gauss((t - 0.72) ** 2, 0.08) * (0.6 + 0.4 * Math.abs(c));
          z -= pec * 0.035 * build * Math.abs(sn);
          z += gauss((t - 0.35) ** 2, 0.1) * 0.01;
        } else {
          // shoulder blades and the curve of the spine
          z += gauss((t - 0.75) ** 2, 0.08) * 0.02 * Math.abs(sn);
          z -= gauss((t - 0.3) ** 2, 0.1) * 0.012 * Math.abs(sn);
        }
        // the whole column leans slightly: chest forward of the hips
        z -= t * 0.015;
        pos.push(x, y, z);
      }
    }
    for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
      const a = r * (SEG + 1) + s; const b = a + SEG + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    // caps (only on the full body)
    if (t0 === 0 && t1 === 1) {
      const base = pos.length / 3;
      pos.push(0, 0, 0, 0, H, -0.015);
      for (let s = 0; s < SEG; s++) { idx.push(base, s + 1, s); const top = RINGS * (SEG + 1); idx.push(base + 1, top + s, top + s + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // planar uv for fabric
    const uv = new Float32Array((pos.length / 3) * 2);
    for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = Math.atan2(pos[i * 3], pos[i * 3 + 2]) / Math.PI; uv[i * 2 + 1] = pos[i * 3 + 1] * 2; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  });
}

// pelvis / seat of the trousers: rounded from the belt line down between the hip joints
export function pelvisGeometry() {
  return memo('pelvis', () => {
    const g = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.62);
    g.rotateX(Math.PI); // dome hangs down
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
      p.setXYZ(i, x * 0.152, y * 0.13 + 0.06, z * (z > 0 ? 0.115 : 0.1));
    }
    g.computeVertexNormals();
    return g;
  });
}

// ───────────── limbs ─────────────
// a lathed limb hanging down from the origin; prof is [radius, depth] from the joint downward,
// squash < 1 makes it slightly oval (front-back)
function limb(key, prof, squash = 0.92, seg = 18) {
  return memo(key, () => {
    const pts = prof.map(([r, d]) => new THREE.Vector2(Math.max(0.001, r), -d));
    pts.reverse();
    const g = new THREE.LatheGeometry(pts, seg);
    g.scale(1, 1, squash);
    g.computeVertexNormals();
    return g;
  });
}
export const thighGeometry = () => limb('thigh', [[0.0, -0.04], [0.06, -0.035], [0.08, 0.0], [0.083, 0.06], [0.08, 0.16], [0.073, 0.28], [0.064, 0.38], [0.058, 0.43], [0.045, 0.46], [0.0, 0.47]]);
export const shinGeometry = () => limb('shin', [[0.0, -0.03], [0.05, -0.02], [0.058, 0.03], [0.064, 0.1], [0.06, 0.18], [0.048, 0.28], [0.04, 0.36], [0.036, 0.4], [0.0, 0.42]]);
export const upperArmGeometry = (L) => limb(`uarm${L}`, [[0.0, -0.05], [0.05, -0.04], [0.062, 0.0], [0.058, 0.08], [0.054, L * 0.55], [0.046, L * 0.85], [0.042, L], [0.0, L + 0.03]]);
export const foreArmGeometry = (L) => limb(`farm${L}`, [[0.0, -0.03], [0.042, -0.02], [0.05, 0.05], [0.048, L * 0.35], [0.038, L * 0.75], [0.032, L - 0.03], [0.0, L]]);
export const neckGeometry = () => limb('neck', [[0.0, -0.11], [0.048, -0.1], [0.05, -0.04], [0.056, 0.0], [0.072, 0.03], [0.0, 0.04]], 0.92);

// ───────────── hands (gloved) ─────────────
// palm with four two-joint fingers curled around a grip and a thumb; the hand hangs down -y
export function handGeometry(curl = 1) {
  return memo(`hand${curl}`, () => {
    const parts = [];
    const add = (g, m) => { g.applyMatrix4(m); parts.push(g); };
    const m4 = new THREE.Matrix4();
    const palm = new RoundedBox(0.072, 0.085, 0.028, 0.011);
    add(palm, m4.makeTranslation(0, -0.042, 0));
    for (let k = 0; k < 4; k++) {
      const x = -0.026 + k * 0.0175;
      const len = [0.03, 0.034, 0.032, 0.026][k];
      const seg1 = new THREE.CapsuleGeometry(0.0085, len, 2, 6);
      const seg2 = new THREE.CapsuleGeometry(0.008, len * 0.8, 2, 6);
      // curl forward (-z) around the grip
      const a1 = 0.9 * curl; const a2 = 1.1 * curl;
      const base = new THREE.Vector3(x, -0.084, -0.004);
      const m1 = new THREE.Matrix4().makeRotationX(a1);
      m1.premultiply(new THREE.Matrix4().makeTranslation(base.x, base.y, base.z));
      m1.multiply(new THREE.Matrix4().makeTranslation(0, -len / 2, 0));
      add(seg1, m1);
      const tip = new THREE.Vector3(0, -len, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), a1).add(base);
      const m2 = new THREE.Matrix4().makeRotationX(a1 + a2);
      m2.premultiply(new THREE.Matrix4().makeTranslation(tip.x, tip.y, tip.z));
      m2.multiply(new THREE.Matrix4().makeTranslation(0, -len * 0.4, 0));
      add(seg2, m2);
      // knuckle
      add(new THREE.SphereGeometry(0.0095, 6, 4), new THREE.Matrix4().makeTranslation(x, -0.08, -0.003));
    }
    // thumb: two segments from the side of the palm, closing over the front of the grip
    const seg = (from, dir, len, r) => {
      const d = dir.clone().normalize();
      const g = new THREE.CapsuleGeometry(r, len, 2, 6);
      const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
      m.premultiply(new THREE.Matrix4().makeTranslation(from.x + d.x * len / 2, from.y + d.y * len / 2, from.z + d.z * len / 2));
      add(g, m);
      return from.clone().addScaledVector(d, len);
    };
    const t1 = seg(new THREE.Vector3(-0.036, -0.022, -0.012), new THREE.Vector3(-0.25, -0.6, -0.75), 0.034, 0.011);
    seg(t1, new THREE.Vector3(0.35 * curl, -0.9, -0.35 * curl), 0.026, 0.0095);
    return mergeAll(parts);
  });
}

// ───────────── boots ─────────────
// side profile extruded across the foot, then a sole with tread blocks; the ankle is at the origin, toe to -z
export function bootGeometry() {
  return memo('boot', () => {
    const s = new THREE.Shape();
    s.moveTo(0.06, 0.1); // back of the collar
    s.lineTo(0.065, 0.0);
    s.quadraticCurveTo(0.075, -0.07, 0.06, -0.085); // heel
    s.lineTo(-0.15, -0.085);
    s.quadraticCurveTo(-0.205, -0.085, -0.2, -0.04); // toe cap
    s.quadraticCurveTo(-0.19, -0.015, -0.13, -0.005);
    s.quadraticCurveTo(-0.07, 0.0, -0.045, 0.04); // instep up to the laces
    s.lineTo(-0.05, 0.1);
    s.lineTo(0.06, 0.1);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.022, bevelSize: 0.02, bevelSegments: 4, curveSegments: 12, steps: 2 });
    g.rotateY(-Math.PI / 2);
    g.translate(0.035, 0, 0);
    // shape it like a foot: round the toe in plan view, narrow the heel and the shaft
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i); const y = p.getY(i); const x = p.getX(i);
      let k = 1;
      if (z < -0.12) k *= Math.sqrt(Math.max(0.05, 1 - ((z + 0.12) / 0.105) ** 2)); // rounded toe
      if (z > 0.02) k *= 0.86; // heel
      if (y > 0.0) k *= 1 - Math.min(1, y / 0.1) * 0.25; // shaft
      p.setX(i, x * k);
    }
    g.computeVertexNormals();
    return g;
  });
}
export function soleGeometry() {
  return memo('sole', () => {
    const parts = [];
    const base = new THREE.CylinderGeometry(1, 1, 0.022, 24);
    base.scale(0.06, 1, 0.152);
    base.translate(0, -0.104, -0.052);
    parts.push(base);
    for (let k = 0; k < 9; k++) {
      const lug = new THREE.BoxGeometry(0.085, 0.01, 0.016);
      lug.translate(0, -0.12, 0.075 - k * 0.032);
      parts.push(lug);
    }
    return mergeAll(parts);
  });
}

// ───────────── armour and gear ─────────────
// a rounded plate bent around the body: x² pushes the edges back by k
export function curvedPlate(w, h, d, k, r = 0.02) {
  return memo(`plate${w}_${h}_${d}_${k}_${r}`, () => {
    const g = new RoundedBox(w, h, d, r);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, p.getZ(i) + x * x * k); }
    g.computeVertexNormals();
    return g;
  });
}

// a pouch with a flap and a snap
export function pouchGeometry(w, h, d) {
  return memo(`pouch${w}_${h}_${d}`, () => {
    const body = new RoundedBox(w, h, d, Math.min(w, h, d) * 0.22);
    const flap = new RoundedBox(w * 1.06, h * 0.32, d * 1.1, Math.min(w, d) * 0.2);
    flap.translate(0, h * 0.36, -d * 0.04);
    const snap = new THREE.CylinderGeometry(w * 0.07, w * 0.07, 0.006, 8);
    snap.rotateX(Math.PI / 2);
    snap.translate(0, h * 0.27, -d * 0.6);
    return mergeAll([body, flap, snap]);
  });
}

// knee / elbow pad: a dome cap
export function padGeometry(r) {
  return memo(`pad${r}`, () => {
    const g = new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
    g.scale(1, 1.25, 0.6);
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

// ballistic helmet: a dome with a brim cut and side rails
export function helmetGeometry() {
  return memo('helmet', () => {
    const g = new THREE.SphereGeometry(1, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.58);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i); let y = p.getY(i); const z = p.getZ(i);
      // cut higher at the front (face), lower at the back and over the ears
      if (z < 0) y = Math.max(y, -0.05 + (-z) * 0.32);
      p.setXYZ(i, x * 0.86, y, z * 0.98);
    }
    g.computeVertexNormals();
    const parts = [g];
    [-1, 1].forEach((s) => { const r = new THREE.BoxGeometry(0.06, 0.12, 0.42); r.translate(s * 0.86, 0.12, 0.05); parts.push(r); });
    const mount = new THREE.BoxGeometry(0.22, 0.14, 0.06); mount.translate(0, 0.55, -0.8); parts.push(mount);
    return mergeAll(parts);
  });
}

// ───────────── surface maps ─────────────
const maps = {};
function canvas(S) { const c = document.createElement('canvas'); c.width = c.height = S; return c; }
function normalFromHeight(h, S, strength) {
  const c = canvas(S); const g = c.getContext('2d'); const img = g.createImageData(S, S);
  const H = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x - 1, y) - H(x + 1, y)) * strength; const dy = (H(x, y - 1) - H(x, y + 1)) * strength;
    const l = Math.hypot(dx, dy, 1); const i = (y * S + x) * 4;
    img.data[i] = (dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// woven cloth with soft wrinkles running across the fabric
export function clothNormal() {
  if (maps.cloth) return maps.cloth;
  const S = 256; const h = new Float32Array(S * S); const r = rng(7);
  const waves = Array.from({ length: 7 }, () => ({ a: r() * Math.PI, f: 1 + Math.floor(r() * 3), p: r() * 6, amp: 0.4 + r() * 0.6 }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = Math.sin(((x + y) / S) * Math.PI * 2 * 64) * 0.06 + Math.sin(((x - y) / S) * Math.PI * 2 * 128) * 0.03;
    for (const w of waves) { const u = (Math.cos(w.a) * x + Math.sin(w.a) * y) / S; v += Math.sin(u * Math.PI * 2 * w.f + w.p) ** 6 * w.amp * 0.3; }
    h[y * S + x] = v + r() * 0.05;
  }
  maps.cloth = normalFromHeight(h, S, 0.9);
  maps.cloth.repeat.set(4, 4);
  return maps.cloth;
}

// MOLLE webbing: horizontal straps with stitched gaps
export function webbingNormal() {
  if (maps.web) return maps.web;
  const S = 128; const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const band = (y % 32) < 18 ? 1 : 0;
    const gap = band && (x % 32) < 3 ? 0.3 : 1;
    const weave = Math.sin(x * 1.6) * 0.04 + Math.sin(y * 2.2) * 0.04;
    h[y * S + x] = band * gap + weave;
  }
  maps.web = normalFromHeight(h, S, 2.4);
  maps.web.repeat.set(4, 4);
  return maps.web;
}

// skin: fine pores and soft unevenness
export function skinNormal() {
  if (maps.skin) return maps.skin;
  const S = 128; const h = new Float32Array(S * S); const r = rng(3);
  for (let i = 0; i < h.length; i++) h[i] = r() * 0.25;
  for (let k = 0; k < 400; k++) { const x = Math.floor(r() * S); const y = Math.floor(r() * S); h[y * S + x] -= 0.6; }
  maps.skin = normalFromHeight(h, S, 0.5);
  maps.skin.repeat.set(8, 8);
  return maps.skin;
}

// ───────────── helpers ─────────────
class RoundedBox extends THREE.BufferGeometry {
  constructor(w, h, d, r) {
    super();
    // a sphere stretched into a box with rounded edges (16x12 segments is plenty at this size)
    const g = new THREE.SphereGeometry(1, 16, 12);
    const p = g.attributes.position;
    const hw = w / 2 - r; const hh = h / 2 - r; const hd = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
      p.setXYZ(i, x * r + Math.sign(x) * hw, y * r + Math.sign(y) * hh, z * r + Math.sign(z) * hd);
    }
    g.computeVertexNormals();
    this.copy(g);
  }
}

export function mergeAll(geos) {
  const list = geos.map((g) => {
    let q = g.index ? g.toNonIndexed() : g;
    if (!q.attributes.normal) q.computeVertexNormals();
    if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
    return q;
  });
  let n = 0;
  list.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3); const nor = new Float32Array(n * 3); const uv = new Float32Array(n * 2);
  let o = 0;
  list.forEach((g) => {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array.subarray(0, g.attributes.position.count * 2), o * 2);
    o += g.attributes.position.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
