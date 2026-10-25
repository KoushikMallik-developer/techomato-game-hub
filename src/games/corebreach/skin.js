// Core Breach agent body as one continuous skinned mesh.
//
// The clothed body (pelvis, abdomen, chest, shoulders, neck, arms and legs, with fabric folds at the
// elbows, knees and waist) is described as a signed distance field: tapered capsules and ellipsoids
// joined with smooth unions, so the shapes flow into each other like a real body instead of meeting at
// hard seams. A surface-nets mesher turns the field into triangles once (cached, shared by every agent),
// normals come from the field's gradient, and each vertex is skinned to the bones of the primitives it
// lies on, so shoulders, elbows, hips and knees bend smoothly when the rig moves.
//
// The mesh is built in an A-pose (arms angled out, so they don't fuse with the torso); buildAgent poses
// its rig the same way while binding the skeleton.
import * as THREE from 'three';

export const A_POSE = 0.62; // arm angle from vertical while binding

// ── SDF primitives ──
const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
export function roundCone(px, py, pz, a, b, r1, r2) {
  // tapered capsule from a (radius r1) to b (radius r2) — Inigo Quilez
  const bax = b[0] - a[0]; const bay = b[1] - a[1]; const baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2; const a2 = l2 - rr * rr; const il2 = 1 / l2;
  const pax = px - a[0]; const pay = py - a[1]; const paz = pz - a[2];
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y; const qy = pay * l2 - bay * y; const qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2; const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
export function ellipsoid(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0]; const y = (py - c[1]) / r[1]; const z = (pz - c[2]) / r[2];
  const k0 = len(x, y, z);
  const k1 = len(x / r[0], y / r[1], z / r[2]);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
}
export function roundBox(px, py, pz, c, h, rad) {
  const qx = Math.abs(px - c[0]) - h[0] + rad; const qy = Math.abs(py - c[1]) - h[1] + rad; const qz = Math.abs(pz - c[2]) - h[2] + rad;
  return len(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rad;
}
export const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

// ── the body description ──
// bones: 0 pelvis, 1 spine, 2 neck, 3/4 upper arm L/R, 5/6 forearm L/R, 7/8 thigh L/R, 9/10 shin L/R
// region: 0 top (jacket), 1 bottom (trousers), 2 skin
function bodyParts(build) {
  const P = [];
  const add = (bone, region, f, chain = 0) => P.push({ bone, region, f, chain });
  const B = build; // overall girth
  add(0, 1, (x, y, z) => roundBox(x, y, z, [0, 0.955, 0.005], [0.145 * B, 0.085, 0.096 * B], 0.07));
  add(1, 0, (x, y, z) => roundCone(x, y, z / 0.74, [0, 0.99, 0], [0, 1.25, -0.005], 0.135 * B, 0.15 * B) * 0.74);
  add(1, 0, (x, y, z) => ellipsoid(x, y, z, [0, 1.37, -0.008], [0.19 * B, 0.155, 0.118 * B]));
  add(1, 0, (x, y, z) => roundCone(x, y, z, [-0.15, 1.495, 0.005], [0.15, 1.495, 0.005], 0.075, 0.075));
  add(2, 2, (x, y, z) => roundCone(x, y, z, [0, 1.5, 0.008], [0, 1.69, 0.004], 0.068, 0.05));
  [-1, 1].forEach((s) => {
    const ui = s < 0 ? 3 : 4; const fi = s < 0 ? 5 : 6; const ti = s < 0 ? 7 : 8; const si = s < 0 ? 9 : 10;
    const S = [s * 0.205, 1.5, -0.02];
    const dir = [s * Math.sin(A_POSE), -Math.cos(A_POSE), 0];
    const E = [S[0] + dir[0] * 0.29, S[1] + dir[1] * 0.29, S[2]];
    const W = [E[0] + dir[0] * 0.24, E[1] + dir[1] * 0.24, E[2]];
    const ca = s < 0 ? 1 : 2; const cl = s < 0 ? 3 : 4; // limb chains blend with the core, not with each other
    add(ui, 0, (x, y, z) => len(x - s * 0.196, y - 1.495, z + 0.012) - 0.07, ca); // deltoid
    add(ui, 0, (x, y, z) => roundCone(x, y, z, S, E, 0.058, 0.045), ca);
    add(fi, 0, (x, y, z) => roundCone(x, y, z, E, W, 0.047, 0.036), ca);
    const H = [s * 0.093, 0.885, 0.0]; const K = [s * 0.096, 0.47, -0.004]; const A = [s * 0.093, 0.13, 0.008];
    add(ti, 1, (x, y, z) => roundCone(x, y, z, H, K, 0.077 * B, 0.054), cl);
    add(ti, 1, (x, y, z) => ellipsoid(x, y, z, [s * 0.1, 0.72, -0.012], [0.068 * B, 0.17, 0.07 * B]), cl); // quadriceps
    add(si, 1, (x, y, z) => len(x - K[0], y - K[1], z - K[2]) - 0.055, cl); // knee
    add(si, 1, (x, y, z) => roundCone(x, y, z, K, A, 0.052, 0.04), cl);
    add(si, 1, (x, y, z) => ellipsoid(x, y, z, [s * 0.093, 0.34, 0.02], [0.05, 0.1, 0.048]), cl); // calf
  });
  return P;
}

// fabric folds: soft ripples bunching around the elbows, knees, waist and the trouser hems
function folds(x, y, z) {
  let d = 0;
  const ring = (cx, cy, cz, r, amp, freq) => {
    const q = len(x - cx, y - cy, z - cz);
    if (q > r) return 0;
    const m = 1 - q / r;
    return Math.sin((y + x * 0.4) * freq) * amp * m * m;
  };
  [-1, 1].forEach((s) => {
    const ex = s * (0.205 + Math.sin(A_POSE) * 0.29); const ey = 1.5 - Math.cos(A_POSE) * 0.29;
    d += ring(ex, ey, -0.02, 0.09, 0.0035, 140);
    d += ring(s * 0.096, 0.47, 0, 0.1, 0.004, 120);
    d += ring(s * 0.093, 0.17, 0.008, 0.08, 0.004, 110);
  });
  d += ring(0, 1.02, 0, 0.2, 0.0025, 90);
  return d;
}

function makeField(build) {
  const parts = bodyParts(build);
  const K = 0.045;
  const ch = [0, 0, 0, 0, 0];
  const f = (x, y, z) => {
    ch.fill(1e9);
    for (let i = 0; i < parts.length; i++) { const p = parts[i]; ch[p.chain] = smin(ch[p.chain], p.f(x, y, z), K); }
    let d = ch[0];
    for (let c = 1; c < 5; c++) d = Math.min(d, smin(ch[0], ch[c], c > 2 ? 0.028 : K)); // legs meet the hips more crisply
    return d + folds(x, y, z);
  };
  return { f, parts };
}

// ── surface nets ──
export function surfaceNets(f, min, max, h) {
  const nx = Math.ceil((max[0] - min[0]) / h); const ny = Math.ceil((max[1] - min[1]) / h); const nz = Math.ceil((max[2] - min[2]) / h);
  const sx = nx + 1; const sy = ny + 1;
  const val = new Float32Array(sx * sy * (nz + 1));
  // sample in 4×4×4 blocks: a block whose centre is far from the surface only needs its sign
  const BS = 4; const reach = BS * h * 0.87 + h;
  for (let bk = 0; bk <= nz; bk += BS) for (let bj = 0; bj <= ny; bj += BS) for (let bi = 0; bi <= nx; bi += BS) {
    const c = f(min[0] + (bi + BS / 2) * h, min[1] + (bj + BS / 2) * h, min[2] + (bk + BS / 2) * h);
    const far = Math.abs(c) > reach * 2.5;
    for (let k = bk; k <= Math.min(nz, bk + BS - 1); k++) for (let j = bj; j <= Math.min(ny, bj + BS - 1); j++) for (let i = bi; i <= Math.min(nx, bi + BS - 1); i++) {
      val[i + sx * (j + sy * k)] = far ? c : f(min[0] + i * h, min[1] + j * h, min[2] + k * h);
    }
  }
  const V = (i, j, k) => val[i + sx * (j + sy * k)];
  const cellIdx = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let inside = 0;
    for (let c = 0; c < 8; c++) { cv[c] = V(i + corners[c][0], j + corners[c][1], k + corners[c][2]); if (cv[c] < 0) inside++; }
    if (inside === 0 || inside === 8) continue;
    let ax = 0; let ay = 0; let az = 0; let n = 0;
    for (const [a, b] of edges) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      const A = corners[a]; const Bc = corners[b];
      ax += A[0] + (Bc[0] - A[0]) * t; ay += A[1] + (Bc[1] - A[1]) * t; az += A[2] + (Bc[2] - A[2]) * t; n++;
    }
    cellIdx[i + nx * (j + ny * k)] = pos.length / 3;
    pos.push(min[0] + (i + ax / n) * h, min[1] + (j + ay / n) * h, min[2] + (k + az / n) * h);
  }
  const C = (i, j, k) => cellIdx[i + nx * (j + ny * k)];
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = V(i, j, k) < 0; const b = V(i + 1, j, k) < 0; // edge along x
    if (a !== b) quad(C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k), a);
  }
  for (let k = 1; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
    const a = V(i, j, k) < 0; const b = V(i, j + 1, k) < 0; // edge along y
    if (a !== b) quad(C(i - 1, j, k - 1), C(i - 1, j, k), C(i, j, k), C(i, j, k - 1), a);
  }
  for (let k = 0; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
    const a = V(i, j, k) < 0; const b = V(i, j, k + 1) < 0; // edge along z
    if (a !== b) quad(C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k), a);
  }
  return { pos, idx };
}

const cache = new Map();

// build (or fetch) the shared body geometry: position, normal, uv, skinIndex, skinWeight, region
export function bodyGeometry(build = 1, detail = 'high') {
  const key = `${build}|${detail}`;
  if (cache.has(key)) return cache.get(key);
  const { f, parts } = makeField(build);
  const h = detail === 'lod' ? 0.03 : detail === 'low' ? 0.02 : detail === 'medium' ? 0.015 : 0.0115;
  const { pos, idx } = surfaceNets(f, [-0.7, 0.1, -0.2], [0.7, 1.72, 0.2], h);
  const n = pos.length / 3;
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const reg = new Float32Array(n);
  const e = 0.003;
  const wb = new Float32Array(11);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3]; const y = pos[v * 3 + 1]; const z = pos[v * 3 + 2];
    // one Newton step onto the surface keeps it smooth
    const gx = f(x + e, y, z) - f(x - e, y, z); const gy = f(x, y + e, z) - f(x, y - e, z); const gz = f(x, y, z + e) - f(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    nor[v * 3] = gx / gl; nor[v * 3 + 1] = gy / gl; nor[v * 3 + 2] = gz / gl;
    // cloth uv: wrap around the vertical axis, height along v
    // box-projected so the weave keeps the same scale everywhere (no stretching down the limbs)
    const ax = Math.abs(nor[v * 3]); const az = Math.abs(nor[v * 3 + 2]);
    uv[v * 2] = (ax > az ? z : x) * 3 + (ax > az ? 0.5 : 0);
    uv[v * 2 + 1] = y * 3;
    // skin weights: each primitive pulls toward its bone by how close the vertex is to its surface
    wb.fill(0);
    let best = 1e9; let bestRegion = 0;
    for (const p of parts) {
      const d = p.f(x, y, z);
      const w = Math.exp(-Math.max(0, d) / 0.014);
      wb[p.bone] += w;
      if (d < best) { best = d; bestRegion = p.region; }
    }
    reg[v] = bestRegion === 2 && y < 1.6 ? 0 : bestRegion; // skin only shows above the collar
    const order = [...wb.keys()].sort((a, b) => wb[b] - wb[a]).slice(0, 4);
    let tot = 0; order.forEach((b) => { tot += wb[b]; });
    order.forEach((b, k) => { si[v * 4 + k] = b; sw[v * 4 + k] = tot > 0 ? wb[b] / tot : (k === 0 ? 1 : 0); });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setAttribute('region', new THREE.BufferAttribute(reg, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.userData.shared = true;
  cache.set(key, g);
  return g;
}

// a per-agent copy that shares every buffer but has its own vertex colours (jacket / trousers / skin)
export function colouredBody(base, top, bottom, skinCol) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) g.setAttribute(k, base.attributes[k]);
  g.setIndex(base.index);
  const reg = base.attributes.region.array;
  const cols = [new THREE.Color(top), new THREE.Color(bottom), new THREE.Color(skinCol)];
  const c = new Float32Array(reg.length * 3);
  for (let i = 0; i < reg.length; i++) { const col = cols[reg[i] | 0]; c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.boundingSphere = base.boundingSphere;
  return g;
}

// mesh any field into a smooth geometry with gradient normals (used by the head and hair)
export function meshField(f, min, max, h) {
  const { pos, idx } = surfaceNets(f, min, max, h);
  const n = pos.length / 3;
  const nor = new Float32Array(n * 3);
  const e = h * 0.25;
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3]; const y = pos[v * 3 + 1]; const z = pos[v * 3 + 2];
    const gx = f(x + e, y, z) - f(x - e, y, z); const gy = f(x, y + e, z) - f(x, y - e, z); const gz = f(x, y, z + e) - f(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    nor[v * 3] = gx / gl; nor[v * 3 + 1] = gy / gl; nor[v * 3 + 2] = gz / gl;
  }
  const uv = new Float32Array(n * 2); // spherical, for fine detail maps
  for (let v = 0; v < n; v++) { uv[v * 2] = Math.atan2(pos[v * 3], -pos[v * 3 + 2]) * 0.5; uv[v * 2 + 1] = pos[v * 3 + 1] * 6; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.userData.shared = true;
  return g;
}

// ── gloved hand (wrist at the origin, fingers down -y, palm toward -z, thumb on -x), sculpted as one
// smooth surface: padded palm, three-jointed tapering fingers with knuckles, a two-jointed thumb ──
function handField(curl) {
  const caps = [];
  const seg = (a, b, r1, r2) => caps.push([a, b, r1, r2]);
  const rotX = (v, a) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
  const scales = [1.0, 1.1, 1.03, 0.84];
  for (let k = 0; k < 4; k++) {
    const x = -0.0255 + k * 0.017;
    let p = [x, -0.083 + (k === 1 ? -0.002 : k === 3 ? 0.004 : 0), -0.001];
    let ang = 0;
    const L = [0.025, 0.017, 0.013].map((l) => l * scales[k]);
    const bend = [0.85, 1.05, 0.75].map((a) => a * curl);
    const rad = [0.0088, 0.0081, 0.0074].map((r) => r * (k === 3 ? 0.9 : 1));
    for (let j = 0; j < 3; j++) {
      ang += bend[j];
      const d = rotX([0, -1, 0], ang);
      const q = [p[0] + d[0] * L[j], p[1] + d[1] * L[j], p[2] + d[2] * L[j]];
      seg(p, q, rad[j], j === 2 ? rad[j] * 0.85 : rad[j + 1] || rad[j]);
      p = q;
    }
  }
  // thumb
  const nrm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
  let t0 = [-0.028, -0.02, -0.006];
  const d1 = nrm([-0.35, -0.55, -0.6]);
  const t1 = [t0[0] + d1[0] * 0.036, t0[1] + d1[1] * 0.036, t0[2] + d1[2] * 0.036];
  seg(t0, t1, 0.013, 0.0105);
  const d2 = nrm([0.3 * curl, -0.85, -0.4 * curl]);
  const t2 = [t1[0] + d2[0] * 0.024, t1[1] + d2[1] * 0.024, t1[2] + d2[2] * 0.024];
  seg(t1, t2, 0.0098, 0.009);
  const d3 = nrm([0.45 * curl, -0.8, -0.5 * curl]);
  seg(t2, [t2[0] + d3[0] * 0.018, t2[1] + d3[1] * 0.018, t2[2] + d3[2] * 0.018], 0.0088, 0.0078);
  return (x, y, z) => {
    let d = roundBox(x, y, z, [0.0, -0.046, -0.001], [0.036, 0.04, 0.0125], 0.011);
    d = smin(d, roundCone(x, y, z / 0.62, [0, 0.012, 0.0], [0, -0.012, 0], 0.03, 0.033) * 0.62, 0.012); // wrist
    d = smin(d, ellipsoid(x, y, z, [-0.02, -0.03, -0.01], [0.02, 0.026, 0.012]), 0.01); // thumb pad
    for (const [a, b, r1, r2] of caps) d = smin(d, roundCone(x, y, z, a, b, r1, r2), 0.007);
    // glove seams over the knuckles
    d += Math.max(0, 1 - Math.abs(y + 0.08) / 0.003) * 0.0006 * (z > 0 ? 1 : 0);
    return d;
  };
}
const HANDS = new Map();
export function handMesh(curl = 1, detail = 'high') {
  const key = curl.toFixed(2) + detail;
  if (!HANDS.has(key)) HANDS.set(key, meshField(handField(curl), [-0.085, -0.15, -0.085], [0.055, 0.03, 0.04], detail === 'lod' ? 0.0055 : detail === 'medium' ? 0.003 : 0.0022));
  return HANDS.get(key);
}
