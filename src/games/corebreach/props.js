// Core Breach props, modelled rather than textured boxes: plank crates with frames, braces and steel
// corners; corrugated cargo boxes with corner castings and door bars; palms with ringed curving trunks
// and drooping fronds; wall AC units with fan grilles and brackets; iron balconies; the Core device and
// the watch turret.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// world-scale box UVs (u, v in metres * k) so textures keep their size on every part
function worldUV(g, k = 1, rot = false) {
  const p = g.attributes.position; const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)); const ay = Math.abs(n.getY(i)); const az = Math.abs(n.getZ(i));
    let u; let v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    if (rot) [u, v] = [v, u];
    uv[i * 2] = u * k; uv[i * 2 + 1] = v * k;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function clean(g) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(k)) out.deleteAttribute(k);
  return out;
}
export function mergeAll(list) { return list.length ? mergeGeometries(list.map(clean)) : null; }
const bx = (w, h, d, x, y, z, r = 0) => { const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 1, r) : new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };

// ── wooden crate: w x h x d centred at the origin, base at y 0 ──
export function crateParts(w, h, d, seed = 0) {
  const wood = []; const metal = [];
  const F = 0.075; // frame beam size
  const t = 0.022; // plank thickness
  // planked panels on all four sides, inset behind the frame, with gaps between planks
  const planks = (len, hh, place) => {
    const n = Math.max(3, Math.round(hh / 0.16));
    const ph = (hh - F * 2) / n;
    for (let k = 0; k < n; k++) place(len - F * 2 + 0.004, ph - 0.008, -hh / 2 + F + ph * (k + 0.5));
  };
  planks(w, h, (L, ph, y) => { wood.push(worldUV(bx(L, ph, t, 0, h / 2 + y, d / 2 - F * 0.45), 1)); wood.push(worldUV(bx(L, ph, t, 0, h / 2 + y, -d / 2 + F * 0.45), 1)); });
  planks(d, h, (L, ph, y) => { wood.push(worldUV(bx(t, ph, L, w / 2 - F * 0.45, h / 2 + y, 0), 1, true)); wood.push(worldUV(bx(t, ph, L, -w / 2 + F * 0.45, h / 2 + y, 0), 1, true)); });
  // lid planks
  const nl = Math.max(3, Math.round(d / 0.16));
  for (let k = 0; k < nl; k++) wood.push(worldUV(bx(w - F * 2 + 0.004, t, (d - F * 2) / nl - 0.008, 0, h - F * 0.45, -d / 2 + F + ((d - F * 2) / nl) * (k + 0.5)), 1));
  wood.push(worldUV(bx(w - 0.02, 0.02, d - 0.02, 0, 0.01, 0), 1)); // floor
  // frame: 12 edge beams
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    wood.push(worldUV(bx(F, h, F, sx * (w / 2 - F / 2), h / 2, sz * (d / 2 - F / 2), 0.008), 1, true));
    wood.push(worldUV(bx(w, F, F, 0, sz > 0 ? F / 2 : h - F / 2, sx * (d / 2 - F / 2), 0.008), 1));
    wood.push(worldUV(bx(F, F, d, sx * (w / 2 - F / 2), sz > 0 ? F / 2 : h - F / 2, 0, 0.008), 1, true));
  });
  // diagonal braces across each side panel
  const brace = (len, hh, rotY, ox, oz) => {
    const L = Math.hypot(len - F * 2, hh - F * 2); const a = Math.atan2(hh - F * 2, len - F * 2) * ((seed % 2) ? 1 : -1);
    const g = worldUV(bx(L, F * 0.8, t * 1.2, 0, 0, 0, 0.004), 1);
    g.rotateZ(a); g.rotateY(rotY); g.translate(ox, hh / 2, oz);
    wood.push(g);
  };
  brace(w, h, 0, 0, d / 2 - F * 0.2); brace(w, h, Math.PI, 0, -d / 2 + F * 0.2);
  brace(d, h, Math.PI / 2, w / 2 - F * 0.2, 0); brace(d, h, -Math.PI / 2, -w / 2 + F * 0.2, 0);
  // steel corner brackets and a stencil-free latch plate
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => [0.0, h].forEach((y) => {
    const c = 0.13;
    metal.push(bx(c, c, c, sx * (w / 2 - c / 2 + 0.004), y === 0 ? c / 2 - 0.004 : h - c / 2 + 0.004, sz * (d / 2 - c / 2 + 0.004), 0.01));
  }));
  [-1, 1].forEach((s) => metal.push(bx(0.16, 0.06, 0.02, s * w * 0.25, h - 0.15, d / 2 + 0.004, 0.006)));
  return { wood: mergeAll(wood), metal: mergeAll(metal) };
}

// ── corrugated cargo box (w along x, d along z), uv in metres for the painted texture ──
export function cargoParts(w, h, d) {
  const body = []; const steel = [];
  const P = 0.11; // corrugation pitch
  body.push(worldUV(bx(w - 0.04, h - 0.06, d - 0.04, 0, h / 2, 0), 0.5));
  const ribs = (len, along, out) => {
    for (let s = -len / 2 + 0.12; s < len / 2 - 0.1; s += P) {
      [-1, 1].forEach((side) => {
        const g = along === 'x' ? bx(0.05, h - 0.2, 0.03, s, h / 2, side * (out / 2 - 0.006), 0.008) : bx(0.03, h - 0.2, 0.05, side * (out / 2 - 0.006), h / 2, s, 0.008);
        body.push(worldUV(g, 0.5));
      });
    }
  };
  ribs(w, 'x', d); ribs(d, 'z', w);
  // top and bottom rails, corner posts, corner castings
  [-1, 1].forEach((sz) => [0.05, h - 0.05].forEach((y) => { steel.push(bx(w, 0.1, 0.07, 0, y, sz * (d / 2 - 0.035), 0.01)); }));
  [-1, 1].forEach((sx) => [0.05, h - 0.05].forEach((y) => { steel.push(bx(0.07, 0.1, d, sx * (w / 2 - 0.035), y, 0, 0.01)); }));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    steel.push(bx(0.1, h, 0.1, sx * (w / 2 - 0.05), h / 2, sz * (d / 2 - 0.05), 0.012));
    [0.07, h - 0.07].forEach((y) => steel.push(bx(0.15, 0.14, 0.15, sx * (w / 2 - 0.07), y, sz * (d / 2 - 0.07), 0.015)));
  });
  // door end (+x): four lock bars with handles and cam keepers
  for (let k = 0; k < 4; k++) {
    const z = -d / 2 + d * (0.18 + k * 0.215);
    const c = new THREE.CylinderGeometry(0.018, 0.018, h - 0.2, 10); c.translate(w / 2 + 0.03, h / 2, z); steel.push(c);
    steel.push(bx(0.03, 0.04, 0.22, w / 2 + 0.05, h * 0.45, z - 0.09, 0.01));
    [0.22, h - 0.22].forEach((y) => steel.push(bx(0.05, 0.07, 0.06, w / 2 + 0.03, y, z, 0.01)));
  }
  return { body: mergeAll(body), steel: mergeAll(steel) };
}

// ── palm: ringed, curving trunk (lathe rings along a bent spine) and a crown of drooping fronds ──
export function palmParts(x, z, s, r) {
  const trunk = []; const fronds = []; const nuts = [];
  const H = 8.5 * s;
  const lean = (r - 0.5) * 0.5; const dirA = r * Math.PI * 2;
  const dx = Math.cos(dirA); const dz = Math.sin(dirA);
  const N = 14;
  let px = x; let py = 0; let pz = z;
  for (let k = 0; k < N; k++) {
    const t = k / N; const seg = H / N;
    const rad0 = (0.24 - t * 0.08) * s; const rad1 = (0.24 - (t + 1 / N) * 0.08) * s;
    // each segment: a slightly bulging ring (old leaf scar) — a lathe profile
    const prof = [[rad0 * 0.92, 0], [rad0 * 1.06, seg * 0.12], [rad0, seg * 0.35], [rad1 * 0.95, seg]].map(([a, b]) => new THREE.Vector2(a, b));
    const g = new THREE.LatheGeometry(prof, 10);
    const ang = lean * t * t * 1.6;
    g.rotateZ(-ang); g.rotateY(-dirA);
    g.translate(px, py, pz);
    worldUV(g, 1.2, true);
    trunk.push(g);
    px += Math.sin(ang) * seg * dx; pz += Math.sin(ang) * seg * dz; py += Math.cos(ang) * seg;
  }
  // fronds: long ribbons that arc up and droop, with a twist; 11 per crown in two tiers
  const F = 11;
  for (let k = 0; k < F; k++) {
    const a = (k / F) * Math.PI * 2 + r * 5;
    const len = (3.2 + ((k * 7) % 5) * 0.18) * s;
    const up = k % 2 ? 0.55 : 0.2;
    const seg = 10; const wdt = 1.0 * s;
    const pos = []; const uv = []; const idx = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const along = t * len;
      const yy = Math.sin(t * Math.PI * 0.75) * len * up * 0.5 - t * t * len * 0.55; // arc then droop
      const half = wdt * 0.5 * Math.sin(Math.min(1, t * 1.25 + 0.08) * Math.PI) ** 0.7;
      const fold = half * 0.35; // leaflets fold up along the rib (V section)
      pos.push(-half, yy + fold, along, half, yy + fold, along);
      uv.push(0, t, 1, t);
      if (i < seg) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    // a centre rib vertex row would be better; bend the halves down instead to give the V shape
    g.computeVertexNormals();
    g.rotateY(a);
    g.translate(px, py, pz);
    fronds.push(g);
  }
  // dried fronds hanging under the crown and a coconut cluster
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + r * 2;
    const g = new THREE.PlaneGeometry(0.5 * s, 1.6 * s); g.translate(0, -0.8 * s, 0); g.rotateX(0.25); g.rotateY(a); g.translate(px + Math.cos(a) * 0.2 * s, py, pz + Math.sin(a) * 0.2 * s);
    trunk.push(worldUV(g, 1));
  }
  for (let k = 0; k < 5; k++) { const a = k * 1.3 + r; const c = new THREE.SphereGeometry(0.11 * s, 10, 8); c.translate(px + Math.cos(a) * 0.18 * s, py - 0.18 * s - (k % 2) * 0.08 * s, pz + Math.sin(a) * 0.18 * s); nuts.push(worldUV(c, 1)); }
  return { trunk, fronds, nuts };
}

// ── wall AC unit (front faces +z at the origin, back against the wall) ──
export function acParts() {
  const body = []; const dark = [];
  body.push(bx(0.8, 0.52, 0.3, 0, 0, 0, 0.025));
  // fan grille: a ring with radial and concentric bars, a hub
  const ring = new THREE.TorusGeometry(0.19, 0.012, 6, 32); ring.translate(-0.12, 0, 0.152); body.push(ring);
  [0.06, 0.12].forEach((rr) => { const t = new THREE.TorusGeometry(rr, 0.004, 4, 24); t.translate(-0.12, 0, 0.155); body.push(t); });
  for (let k = 0; k < 6; k++) { const b = bx(0.38, 0.008, 0.008, 0, 0, 0); b.rotateZ((k / 6) * Math.PI); b.translate(-0.12, 0, 0.155); body.push(b); }
  const hole = new THREE.CircleGeometry(0.185, 32); hole.translate(-0.12, 0, 0.1505); dark.push(hole);
  const hub = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16); hub.rotateX(Math.PI / 2); hub.translate(-0.12, 0, 0.14); dark.push(hub);
  for (let k = 0; k < 5; k++) { const b = bx(0.15, 0.05, 0.004, 0.08, 0, 0); b.rotateZ((k / 5) * Math.PI * 2 + 0.3); b.rotateY(0.3); b.translate(-0.12, 0, 0.13); dark.push(b); }
  // side louvres on the right
  for (let k = 0; k < 9; k++) body.push(bx(0.22, 0.012, 0.03, 0.24, -0.2 + k * 0.05, 0.16, 0.004));
  // wall brackets and a condensate pipe
  [-1, 1].forEach((s) => { body.push(bx(0.04, 0.04, 0.42, s * 0.3, -0.29, -0.05, 0.006)); const d = bx(0.04, 0.4, 0.04, s * 0.3, -0.48, -0.17, 0.006); body.push(d); });
  const p = new THREE.CylinderGeometry(0.012, 0.012, 0.9, 8); p.translate(0.36, -0.7, -0.1); dark.push(p);
  return { body: mergeAll(body.map((g) => worldUV(g, 2))), dark: mergeAll(dark.map((g) => worldUV(g, 2))) };
}

// ── iron balcony under an upper window (front +z, back on the wall at z 0) ──
export function balconyParts() {
  const slab = []; const iron = [];
  slab.push(bx(1.5, 0.12, 0.6, 0, 0, 0.3, 0.02));
  for (let k = 0; k < 3; k++) { const c = bx(0.08, 0.2, 0.5, -0.6 + k * 0.6, -0.14, 0.25, 0.02); slab.push(c); } // corbels
  const rail = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0); const n = Math.round(L / 0.11);
    for (let k = 0; k <= n; k++) { const t = k / n; const c = new THREE.CylinderGeometry(0.008, 0.008, 0.85, 6); c.translate(x0 + (x1 - x0) * t, 0.48, z0 + (z1 - z0) * t); iron.push(c); }
    const top = bx(Math.abs(x1 - x0) + 0.03 || 0.04, 0.03, Math.abs(z1 - z0) + 0.03 || 0.04, (x0 + x1) / 2, 0.92, (z0 + z1) / 2, 0.008); iron.push(top);
    const mid = bx(Math.abs(x1 - x0) + 0.02 || 0.02, 0.015, Math.abs(z1 - z0) + 0.02 || 0.02, (x0 + x1) / 2, 0.2, (z0 + z1) / 2); iron.push(mid);
  };
  rail(-0.72, 0.56, 0.72, 0.56); rail(-0.72, 0.02, -0.72, 0.56); rail(0.72, 0.02, 0.72, 0.56);
  // scroll ornaments
  for (let k = 0; k < 4; k++) { const t = new THREE.TorusGeometry(0.07, 0.007, 4, 16); t.translate(-0.45 + k * 0.3, 0.34, 0.56); iron.push(t); }
  return { slab: mergeAll(slab.map((g) => worldUV(g, 1))), iron: mergeAll(iron.map((g) => worldUV(g, 1))) };
}

// ── shop awning over a door (front +z, back edge on the wall at z 0): a sloping striped canopy on two brackets ──
export function awningParts() {
  const cloth = []; const iron = [];
  const w = 1.9; const d = 0.95;
  const c = new THREE.PlaneGeometry(w, d, 1, 1);
  // slopes down toward the street: back edge high on the wall, front edge lower
  c.rotateX(-Math.PI / 2 + 0.52);
  c.translate(0, -0.2, d * 0.45);
  cloth.push(c);
  // the scalloped front valance
  const v = new THREE.PlaneGeometry(w, 0.2, 1, 1); v.translate(0, -0.52, d * 0.86); cloth.push(v);
  [-1, 1].forEach((sd) => {
    const a = bx(0.03, 0.03, 0.95, sd * (w / 2 - 0.05), -0.32, 0.45); a.rotateX(0.52 - 0.0); iron.push(a);
  });
  const uvs = (g, rep) => { const p = g.attributes.uv; for (let i = 0; i < p.count; i++) p.setXY(i, p.getX(i) * rep, p.getY(i)); return g; };
  return { cloth: mergeAll(cloth.map((g) => uvs(g, 1))), iron: mergeAll(iron.map((g) => worldUV(g, 1))) };
}

// ── terracotta planter with a bush and flowers (centred at the origin, base at y 0) ──
export function planterParts() {
  const pot = []; const leaf = []; const flowerA = []; const flowerB = [];
  const p = new THREE.CylinderGeometry(0.26, 0.19, 0.42, 14); p.translate(0, 0.21, 0); pot.push(p);
  const rim = new THREE.TorusGeometry(0.26, 0.03, 6, 18); rim.rotateX(Math.PI / 2); rim.translate(0, 0.42, 0); pot.push(rim);
  [[0, 0.62, 0, 0.3], [0.17, 0.55, 0.08, 0.2], [-0.16, 0.56, -0.07, 0.21], [0.02, 0.5, -0.17, 0.17], [-0.05, 0.52, 0.17, 0.18]].forEach(([x, y, z, r]) => { const b = new THREE.IcosahedronGeometry(r, 1); b.translate(x, y, z); leaf.push(b); });
  [[0.1, 0.86, 0.1], [-0.15, 0.8, 0.05], [0.05, 0.9, -0.12], [0.22, 0.72, -0.04], [-0.06, 0.76, 0.22]].forEach(([x, y, z], k) => { const f = new THREE.IcosahedronGeometry(0.07, 0); f.translate(x, y, z); (k % 2 ? flowerA : flowerB).push(f); });
  const f = (l) => mergeAll(l.map((g) => worldUV(g, 1)));
  return { pot: f(pot), leaf: f(leaf), flowerA: f(flowerA), flowerB: f(flowerB) };
}
