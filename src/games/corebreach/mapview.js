// Core Breach map rendering: turns the level grid into meshes (walls, floors, steps, cover, roofs)
// plus decoration (palms beyond the walls, site letters, plant-zone markings, lamps, spawn barriers).
import * as THREE from 'three';
import { mulberry32 } from './data.js';
import * as TX from './textures.js';
import * as PR from './props.js';

const WALL_H = 7;

class Quads {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  // a, b, c, d counter-clockwise seen from the front; uvs per corner; cols per corner (r,g,b) or one
  quad(a, b, c, d, n, uv, col) {
    const cs = Array.isArray(col[0]) ? col : [col, col, col, col];
    [[a, uv[0], cs[0]], [b, uv[1], cs[1]], [c, uv[2], cs[2]], [a, uv[0], cs[0]], [c, uv[2], cs[2]], [d, uv[3], cs[3]]].forEach(([v, t, k]) => {
      this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); this.uv.push(t[0], t[1]); this.c.push(k[0], k[1], k[2]);
    });
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
  get empty() { return this.p.length === 0; }
}

const THEME_TINT = {
  def: [0.93, 0.96, 1.0], atk: [1.0, 0.93, 0.87], sand: [1, 0.96, 0.88], plaza: [1, 0.98, 0.95], tile: [0.97, 0.97, 0.98],
};

export function buildMap(level, quality = 'medium') {
  const group = new THREE.Group();
  const L = level;
  const rnd = mulberry32(99);
  const mats = makeMaterials();
  const W = L.W; const D = L.D;
  const X = (i) => L.x0 + i;
  const Z = (j) => L.z0 + j;
  const K = (i, j) => (L.inside(i, j) ? L.kind[L.idx(i, j)] : 0);
  const T = (i, j) => L.top[L.idx(i, j)];
  const themeAt = (i, j) => {
    const a = L.inside(i, j) ? L.area[L.idx(i, j)] : -1;
    return a >= 0 ? L.def.areas[a].th : 'plaza';
  };
  const isBlockCell = (i, j) => (L.def.blocks || []).some((b) => X(i) >= b[0] && X(i) < b[2] && Z(j) >= b[1] && Z(j) < b[3]);
  const open = (k) => k === 1 || k === 3;

  // ── walls: faces where a wall cell meets floor, merged into long strips ──
  const walls = new Quads();
  const blocks = new Quads();
  const caps = new Quads();
  const trims = new Quads();
  const span = 4;
  const AO_H = 1.4;
  const wallFace = (Q, x0, z0, x1, z1, y0, n, tint) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const u0 = (x0 + z0) / span;
    const u1 = u0 + len / span;
    const lo = tint.map((v) => v * 0.62);
    const mid = Math.min(WALL_H, y0 + AO_H);
    Q.quad([x0, y0, z0], [x1, y0, z1], [x1, mid, z1], [x0, mid, z0], n, [[u0, y0 / span], [u1, y0 / span], [u1, mid / span], [u0, mid / span]], [lo, lo, tint, tint]);
    Q.quad([x0, mid, z0], [x1, mid, z1], [x1, WALL_H, z1], [x0, WALL_H, z0], n, [[u0, mid / span], [u1, mid / span], [u1, WALL_H / span], [u0, WALL_H / span]], tint);
    // stone skirting at the foot of the wall and a moulded cornice under the top
    const off = (d) => [n[0] * d, n[2] * d];
    const band = (ya, yb, d, shade) => {
      const [ox, oz] = off(d);
      const c = tint.map((v) => v * shade);
      const ua = (x0 + z0) / 2; const ub = ua + len / 2;
      trims.quad([x0 + ox, ya, z0 + oz], [x1 + ox, ya, z1 + oz], [x1 + ox, yb, z1 + oz], [x0 + ox, yb, z0 + oz], n, [[ua, ya / 2], [ub, ya / 2], [ub, yb / 2], [ua, yb / 2]], c);
      trims.quad([x0 + ox, yb, z0 + oz], [x1 + ox, yb, z1 + oz], [x1, yb, z1], [x0, yb, z0], [0, 1, 0], [[ua, 0], [ub, 0], [ub, d], [ua, d]], c);
      trims.quad([x0, ya, z0], [x1, ya, z1], [x1 + ox, ya, z1 + oz], [x0 + ox, ya, z0 + oz], [0, -1, 0], [[ua, 0], [ub, 0], [ub, d], [ua, d]], c.map((v) => v * 0.7));
    };
    if (y0 < WALL_H - 1) band(y0, y0 + 0.55, 0.07, 0.8);
    band(WALL_H - 0.42, WALL_H - 0.12, 0.16, 1.0);
  };
  // the four directions: neighbour offset, face plane and orientation
  const dirs = [
    { di: 1, dj: 0, n: [1, 0, 0] }, { di: -1, dj: 0, n: [-1, 0, 0] }, { di: 0, dj: 1, n: [0, 0, 1] }, { di: 0, dj: -1, n: [0, 0, -1] },
  ];
  dirs.forEach(({ di, dj, n }) => {
    const alongJ = di !== 0; // faces facing ±x run along z
    const outer = alongJ ? W : D;
    const inner = alongJ ? D : W;
    for (let a = 0; a < outer; a++) {
      let run = null;
      const flush = () => {
        if (!run) return;
        const { s, e, y0, blk, tint } = run;
        let x0; let z0; let x1; let z1;
        if (alongJ) {
          const x = di > 0 ? X(a) + 1 : X(a);
          x0 = x; x1 = x;
          if (di > 0) { z0 = Z(e) + 1; z1 = Z(s); } else { z0 = Z(s); z1 = Z(e) + 1; }
        } else {
          const z = dj > 0 ? Z(a) + 1 : Z(a);
          z0 = z; z1 = z;
          if (dj > 0) { x0 = X(s); x1 = X(e) + 1; } else { x0 = X(e) + 1; x1 = X(s); }
        }
        wallFace(blk ? blocks : walls, x0, z0, x1, z1, y0, n, tint);
        run = null;
      };
      for (let b = 0; b < inner; b++) {
        const i = alongJ ? a : b;
        const j = alongJ ? b : a;
        const k = K(i, j);
        const nk = K(i + di, j + dj);
        if (k === 2 && open(nk)) {
          const y0 = Math.min(T(i + di, j + dj), nk === 3 ? 0 : 99);
          const blk = isBlockCell(i, j);
          const th = themeAt(i + di, j + dj);
          const tint = THEME_TINT[th] || THEME_TINT.plaza;
          if (run && run.e === b - 1 && run.y0 === y0 && run.blk === blk && run.th === th) run.e = b;
          else { flush(); run = { s: b, e: b, y0, blk, th, tint }; }
        } else flush();
      }
      flush();
    }
  });
  // wall tops, merged per row
  for (let j = 0; j < D; j++) {
    let s = -1;
    for (let i = 0; i <= W; i++) {
      const isW = i < W && K(i, j) === 2;
      if (isW && s < 0) s = i;
      if (!isW && s >= 0) {
        const y = WALL_H;
        const c = [0.92, 0.92, 0.92];
        caps.quad([X(s), y, Z(j) + 1], [X(i), y, Z(j) + 1], [X(i), y, Z(j)], [X(s), y, Z(j)], [0, 1, 0], [[X(s) / 2, (Z(j) + 1) / 2], [X(i) / 2, (Z(j) + 1) / 2], [X(i) / 2, Z(j) / 2], [X(s) / 2, Z(j) / 2]], c);
        s = -1;
      }
    }
  }
  // ── floors per theme, merged per row; ledge faces where the floor steps down ──
  const floors = {};
  const ledges = new Quads();
  for (let j = 0; j < D; j++) {
    let run = null;
    const flush = (iEnd) => {
      if (!run) return;
      const Q = floors[run.th] || (floors[run.th] = new Quads());
      const y = run.y;
      const x0 = X(run.s); const x1 = X(iEnd); const z0 = Z(j); const z1 = Z(j) + 1;
      const sc = run.th === 'plaza' ? 4 : run.th === 'sand' ? 5 : 4;
      Q.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [[x0 / sc, z1 / sc], [x1 / sc, z1 / sc], [x1 / sc, z0 / sc], [x0 / sc, z0 / sc]], [1, 1, 1]);
      run = null;
    };
    for (let i = 0; i <= W; i++) {
      const k = i < W ? K(i, j) : 0;
      if (k === 1 || k === 3) {
        // under a prop the floor still shows around it (prop box is drawn separately)
        const y = k === 3 ? baseUnderProp(L, i, j) : T(i, j);
        const th = L.stair[L.idx(i, j)] ? 'stair' : themeAt(i, j);
        if (run && run.y === y && run.th === th) continue;
        flush(i);
        run = { s: i, y, th };
      } else flush(i);
    }
  }
  // ledge (step) faces between floors of different heights
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    if (K(i, j) !== 1) continue;
    const y = T(i, j);
    dirs.forEach(({ di, dj, n }) => {
      const nk = K(i + di, j + dj);
      if (nk !== 1) return;
      const ny = T(i + di, j + dj);
      if (ny >= y - 0.01) return;
      let x0; let z0; let x1; let z1;
      if (di > 0) { x0 = x1 = X(i) + 1; z0 = Z(j) + 1; z1 = Z(j); } else if (di < 0) { x0 = x1 = X(i); z0 = Z(j); z1 = Z(j) + 1; } else if (dj > 0) { z0 = z1 = Z(j) + 1; x0 = X(i); x1 = X(i) + 1; } else { z0 = z1 = Z(j); x0 = X(i) + 1; x1 = X(i); }
      const u = (x0 + z0) / 2;
      ledges.quad([x0, ny, z0], [x1, ny, z1], [x1, y, z1], [x0, y, z0], n, [[u, ny / 2], [u + 0.5, ny / 2], [u + 0.5, y / 2], [u, y / 2]], [0.85, 0.85, 0.85]);
    });
  }
  const add = (Q, mat, cast = true) => {
    if (Q.empty) return null;
    const m = new THREE.Mesh(Q.geometry(), mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  add(walls, mats.wall);
  add(blocks, mats.block);
  add(caps, mats.cap);
  add(trims, mats.trim);
  add(ledges, mats.ledge);
  Object.entries(floors).forEach(([th, Q]) => add(Q, mats.floor[th] || mats.floor.plaza, false));

  // ── cover: modelled plank crates and corrugated cargo boxes (simple textured boxes on low) ──
  const crateGeo = []; const cargoGeo = [];
  const PG = { wood: [], metal: [], body: [], steel: [] };
  (L.def.props || []).forEach((p, idx) => {
    const [x0, z0, x1, z1, h] = p;
    const base = baseAt(L, (x0 + x1) / 2, (z0 + z1) / 2, x0, z0, x1, z1);
    const layers = Math.max(1, Math.round(h / 1.05));
    const lh = h / layers;
    for (let l = 0; l < layers; l++) {
      const inset = l > 0 ? 0.08 : 0;
      const w = x1 - x0 - inset * 2; const d = z1 - z0 - inset * 2;
      const cx = (x0 + x1) / 2; const cz = (z0 + z1) / 2; const y = base + lh * l;
      const cargo = (idx + l) % 3 === 2;
      if (quality === 'low') {
        const g = new THREE.BoxGeometry(w, lh, d);
        g.translate(cx, y + lh / 2, cz);
        (cargo ? cargoGeo : crateGeo).push(g);
      } else if (cargo) {
        const c = PR.cargoParts(w, lh, d);
        c.body.translate(cx, y, cz); c.steel.translate(cx, y, cz);
        PG.body.push(c.body); PG.steel.push(c.steel);
      } else {
        // big footprints are stacks of 1 m crates, each with its own frame
        const nx = Math.max(1, Math.round(w / 1.1)); const nz = Math.max(1, Math.round(d / 1.1));
        for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
          const cw = w / nx; const cd = d / nz;
          const c = PR.crateParts(cw - 0.01, lh - 0.005, cd - 0.01, idx + a + b + l);
          const px = x0 + inset + cw * (a + 0.5); const pz = z0 + inset + cd * (b + 0.5);
          c.wood.translate(px, y, pz); c.metal.translate(px, y, pz);
          PG.wood.push(c.wood); PG.metal.push(c.metal);
        }
      }
    }
  });
  const addM = (geo, mat) => { if (!geo) return; const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; group.add(m); };
  if (crateGeo.length) addM(merge(crateGeo), mats.crate);
  if (cargoGeo.length) addM(merge(cargoGeo), mats.cargo);
  addM(PR.mergeAll(PG.wood), mats.wood); addM(PR.mergeAll(PG.metal), mats.steelDark);
  addM(PR.mergeAll(PG.body), mats.cargo); addM(PR.mergeAll(PG.steel), mats.cargoSteel);

  // ── roofs over the solid blocks between corridors (seen from high ground) ──
  const roofs = new Quads();
  for (let j = 0; j < D; j++) {
    let s = -1;
    for (let i = 0; i <= W; i++) {
      const v = i < W && K(i, j) === 0 && nearOpen(L, i, j, 40);
      if (v && s < 0) s = i;
      if (!v && s >= 0) {
        roofs.quad([X(s), WALL_H, Z(j) + 1], [X(i), WALL_H, Z(j) + 1], [X(i), WALL_H, Z(j)], [X(s), WALL_H, Z(j)], [0, 1, 0], [[X(s) / 3, (Z(j) + 1) / 3], [X(i) / 3, (Z(j) + 1) / 3], [X(i) / 3, Z(j) / 3], [X(s) / 3, Z(j) / 3]], [0.7, 0.66, 0.62]);
        s = -1;
      }
    }
  }
  add(roofs, mats.roof, false);

  // ── decorative ceilings over some corridors ──
  (L.def.ceilings || []).forEach(([x0, z0, x1, z1, h]) => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.6, 0.35, z1 - z0 + 0.6), mats.metal);
    slab.position.set((x0 + x1) / 2, h + 0.17, (z0 + z1) / 2);
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);
    const along = x1 - x0 > z1 - z0;
    const n = Math.floor((along ? x1 - x0 : z1 - z0) / 3);
    for (let k = 1; k < n; k++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(along ? 0.3 : x1 - x0, 0.4, along ? z1 - z0 : 0.3), mats.cap);
      beam.position.set(along ? x0 + k * 3 : (x0 + x1) / 2, h - 0.2, along ? (z0 + z1) / 2 : z0 + k * 3);
      beam.castShadow = true;
      group.add(beam);
    }
  });

  // ── site letters on the nearest big wall, and plant-zone lines on the floor ──
  Object.entries(L.sites).forEach(([name, s]) => {
    const r = s.r;
    const color = name === 'A' ? '#ffcf40' : '#40c8ff';
    const mat = new THREE.MeshBasicMaterial({ map: TX.letter(name, color), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    // letter painted on the floor in the middle of the site
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mat);
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(s.c[0], baseAt(L, s.c[0], s.c[1]) + 0.02, s.c[1] + 4);
    group.add(fl);
    // and on a wall: cast rays to find the nearest wall from the site centre
    let best = null;
    for (let a = 0; a < 8; a++) {
      const d = [Math.cos((a * Math.PI) / 4), 0, Math.sin((a * Math.PI) / 4)];
      if (Math.abs(d[0]) > 0.1 && Math.abs(d[2]) > 0.1) continue;
      const h = L.raycast([s.c[0], 4, s.c[1]], d, 40);
      if (h && h.ny === 0 && (!best || h.t < best.t)) best = h;
    }
    if (best) {
      const wl = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mat);
      wl.position.set(best.x + best.nx * 0.03, 4.2, best.z + best.nz * 0.03);
      wl.lookAt(best.x + best.nx, 4.2, best.z + best.nz);
      group.add(wl);
    }
    // plant zone: a dashed painted border
    const lines = new Quads();
    const y = (x, z) => baseAt(L, x, z) + 0.03;
    const seg = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const nx = -(z1 - z0) / len * 0.08; const nz = (x1 - x0) / len * 0.08;
      for (let t = 0; t < len; t += 1.5) {
        const t1 = Math.min(len, t + 0.9);
        const ax = x0 + ((x1 - x0) * t) / len; const az = z0 + ((z1 - z0) * t) / len;
        const bx = x0 + ((x1 - x0) * t1) / len; const bz = z0 + ((z1 - z0) * t1) / len;
        if (L.topAt(ax, az) > 3.5 || L.topAt(bx, bz) > 3.5) continue;
        lines.quad([ax - nx, y(ax, az), az - nz], [bx - nx, y(bx, bz), bz - nz], [bx + nx, y(bx, bz), bz + nz], [ax + nx, y(ax, az), az + nz], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [1, 1, 1]);
      }
    };
    seg(r[0], r[1], r[2], r[1]); seg(r[2], r[1], r[2], r[3]); seg(r[2], r[3], r[0], r[3]); seg(r[0], r[3], r[0], r[1]);
    const lm = new THREE.Mesh(lines.geometry(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
    group.add(lm);
  });

  // ── palms and cypresses beyond the walls, visible above the rooftops ──
  if (quality !== 'low') {
    const palms = [];
    for (let t = 0; t < 900 && palms.length < 70; t++) {
      const i = Math.floor(rnd() * W); const j = Math.floor(rnd() * D);
      if (K(i, j) !== 0 || !nearOpen(L, i, j, 6) || nearOpen(L, i, j, 2)) continue;
      palms.push([X(i) + 0.5, Z(j) + 0.5, 0.8 + rnd() * 0.5, rnd()]);
    }
    group.add(makePalms(palms, mats));
  }

  // ── wall lamps along the walls (small glowing fittings) ──
  const lampGeo = [];
  for (let n = 0; n < 160; n++) {
    const i = Math.floor(rnd() * W); const j = Math.floor(rnd() * D);
    if (K(i, j) !== 2 || isBlockCell(i, j)) continue;
    for (const { di, dj, n: nn } of dirs) {
      if (K(i + di, j + dj) !== 1) continue;
      const x = X(i) + 0.5 + di * 0.55; const z = Z(j) + 0.5 + dj * 0.55;
      const g = new THREE.BoxGeometry(nn[0] ? 0.12 : 0.5, 0.25, nn[2] ? 0.12 : 0.5);
      g.translate(x, 4.6, z);
      lampGeo.push(g);
      break;
    }
  }
  if (lampGeo.length) group.add(new THREE.Mesh(merge(lampGeo), mats.lamp));

  if (L.def.dressing) group.add(buildDressing(L.def.dressing, mats));

  // ── facade detail: windows, doors with shop signs, AC units, pipes and ivy on the walls ──
  if (quality !== 'low') group.add(buildDecor(L, K, T, X, Z, dirs, isBlockCell, rnd, mats));

  // ── spawn barriers (shown during the buy phase) ──
  const barriers = new THREE.Group();
  ['Attacker Spawn', 'Defender Spawn'].forEach((name) => {
    const a = L.def.areas.find((x) => x.n === name);
    if (!a) return;
    const [x0, z0, x1, z1] = a.r;
    const Q = new Quads();
    const edge = (fixed, from, to, isX, out) => {
      let s = null;
      for (let v = from; v <= to; v++) {
        const i = L.ci((isX ? fixed + out : v) + 0.5);
        const j = L.cj((isX ? v : fixed + out) + 0.5);
        const isOpen = v < to && K(i, j) === 1 && L.area[L.idx(i, j)] >= 0 && L.def.areas[L.area[L.idx(i, j)]].n !== name;
        if (isOpen && s === null) s = v;
        if (!isOpen && s !== null) {
          const p0 = isX ? [fixed + (out > 0 ? 0 : 0), s] : [s, fixed];
          const p1 = isX ? [fixed, v] : [v, fixed];
          Q.quad([p0[0], 0, p0[1]], [p1[0], 0, p1[1]], [p1[0], 4, p1[1]], [p0[0], 4, p0[1]], [0, 0, 1], [[0, 0], [(v - s) / 2, 0], [(v - s) / 2, 2], [0, 2]], [1, 1, 1]);
          s = null;
        }
      }
    };
    edge(x0, z0, z1, true, -1); edge(x1, z0, z1, true, 0); edge(z0, x0, x1, false, -1); edge(z1, x0, x1, false, 0);
    if (!Q.empty) barriers.add(new THREE.Mesh(Q.geometry(), mats.barrier));
  });
  group.add(barriers);

  return { group, barriers, mats };
}

// harbour cranes, a ship and container stacks outside the playable area (seen over the walls)
function buildDressing(d, mats) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xd8a33a, roughness: 0.55, metalness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2f3238, roughness: 0.6, metalness: 0.5 });
  const hull = new THREE.MeshStandardMaterial({ color: 0x24384a, roughness: 0.6, metalness: 0.2 });
  const red = new THREE.MeshStandardMaterial({ color: 0x8a2a24, roughness: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe6e2da, roughness: 0.6 });
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  (d.cranes || []).forEach(([x, z, yaw]) => {
    const c = new THREE.Group();
    c.position.set(x, 0, z); c.rotation.y = yaw;
    // portal legs, machinery house, boom reaching over the quay and a counter-jib
    [[-6, -5], [6, -5], [-6, 5], [6, 5]].forEach(([a, b]) => add(new THREE.BoxGeometry(1, 30, 1), steel, a, 15, b, c));
    [-5, 5].forEach((b) => add(new THREE.BoxGeometry(13, 1.2, 1.2), steel, 0, 29, b, c));
    [-6, 6].forEach((a) => { const t = add(new THREE.BoxGeometry(0.5, 16, 0.5), steel, a, 9, 0, c); t.rotation.x = 0.6; });
    add(new THREE.BoxGeometry(8, 5, 12), white, 0, 32.5, 0, c);
    add(new THREE.BoxGeometry(2.2, 2.2, 70), steel, 0, 31, 18, c);
    add(new THREE.BoxGeometry(2.2, 2.2, 16), steel, 0, 31, -16, c);
    add(new THREE.BoxGeometry(4, 4, 4), dark, 0, 31, -22, c);
    [-1, 1].forEach((s) => { const k = add(new THREE.BoxGeometry(0.25, 0.25, 36), dark, 0, 37, 14 * s * 0.4 + 6, c); k.rotation.x = -0.32 * s; });
    add(new THREE.BoxGeometry(0.4, 9, 0.4), dark, 0, 25, 44, c);
    add(new THREE.BoxGeometry(3, 1, 6), dark, 0, 20.5, 44, c);
    g.add(c);
  });
  if (d.ship) {
    const [x, z, yaw] = d.ship;
    const s = new THREE.Group();
    s.position.set(x, 0, z); s.rotation.y = yaw;
    add(new THREE.BoxGeometry(24, 12, 150), hull, 0, 4, 0, s);
    add(new THREE.BoxGeometry(24.2, 3, 150.2), red, 0, -1, 0, s);
    add(new THREE.BoxGeometry(20, 14, 18), white, 0, 17, 58, s);
    add(new THREE.BoxGeometry(6, 10, 6), red, 0, 28, 62, s);
    for (let k = 0; k < 9; k++) for (let l = 0; l < 3; l++) add(new THREE.BoxGeometry(18, 2.6, 6), [mats.cargo, red, white, dark][(k + l) % 4], 0, 11.3 + l * 2.6, -52 + k * 12, s);
    g.add(s);
  }
  (d.stacks || []).forEach(([x, z], k) => {
    for (let l = 0; l < 3 + (k % 3); l++) {
      const m = add(new THREE.BoxGeometry(12, 2.6, 2.5), [mats.cargo, red, dark, white][(k + l) % 4], x, 1.3 + l * 2.6, z);
      m.rotation.y = (k % 2) * Math.PI / 2;
    }
  });
  return g;
}

const SHOP_NAMES = ['CAFFÈ SOLE', 'PANIFICIO', 'FARMACIA', 'TRATTORIA', 'ALBERGO', 'CERAMICHE', 'BOTTEGA', 'LIBRERIA', 'PESCHERIA', 'MERCATO'];

function buildDecor(L, K, T, X, Z, dirs, isBlockCell, rnd, mats) {
  const g = new THREE.Group();
  const lists = { win: [], door: [], ac: [], pipe: [], ivy: [], sign: [], balc: [] };
  const signs = [];
  const place = (list, w, h, cx, y, cz, n, depth = 0.02) => {
    const p = new THREE.PlaneGeometry(w, h);
    p.rotateY(Math.atan2(n[0], n[2]));
    p.translate(cx + n[0] * depth, y, cz + n[2] * depth);
    list.push(p);
  };
  for (let j = 0; j < L.D; j++) {
    for (let i = 0; i < L.W; i++) {
      if (K(i, j) !== 2 || isBlockCell(i, j)) continue;
      for (const { di, dj, n } of dirs) {
        if (K(i + di, j + dj) !== 1) continue;
        const y0 = T(i + di, j + dj);
        if (y0 > 3.5) continue;
        // a straight stretch of wall: both neighbours along the wall are wall with floor in front
        const ti = dj; const tj = -di; // tangent
        const straight = K(i + ti, j + tj) === 2 && K(i - ti, j - tj) === 2 && K(i + ti + di, j + tj + dj) === 1 && K(i - ti + di, j - tj + dj) === 1;
        const cx = X(i) + 0.5 + di * 0.5; const cz = Z(j) + 0.5 + dj * 0.5;
        const a = di !== 0 ? j : i;
        const h = ((i * 73856093) ^ (j * 19349663) ^ (di * 83492791 + dj * 2654435761)) >>> 0;
        if (straight && (a + (h % 3)) % 5 === 0) {
          place(lists.win, 1.05, 1.48, cx, y0 + 3.9, cz, n);
          if (h % 3 === 1) lists.balc.push([cx, y0 + 3.08, cz, Math.atan2(n[0], n[2])]);
          if (h % 4 === 0) place(lists.win, 1.05, 1.48, cx, y0 + 1.75, cz, n);
        } else if (straight && a % 13 === 4 && y0 < 0.5) {
          place(lists.door, 1.2, 2.25, cx, y0 + 1.125, cz, n);
          if (h % 2 === 0) signs.push({ cx, y: y0 + 2.75, cz, n, name: SHOP_NAMES[h % SHOP_NAMES.length] });
        } else if (straight && a % 11 === 6) {
          lists.ac.push([cx + n[0] * 0.17, y0 + 2.9, cz + n[2] * 0.17, Math.atan2(n[0], n[2])]);
        } else if (a % 17 === 9) {
          const c = new THREE.CylinderGeometry(0.045, 0.045, 7, 8);
          c.translate(cx + n[0] * 0.09 + n[2] * 0.3, 3.5, cz + n[2] * 0.09 + n[0] * 0.3);
          lists.pipe.push(c);
        } else if ((a + (h % 5)) % 9 === 2) {
          const len = 1.6 + (h % 7) * 0.25;
          place(lists.ivy, 1.1, len, cx, 7 - len / 2, cz, n, 0.03);
        }
      }
    }
  }
  const M = (list, mat) => { if (list.length) { const m = new THREE.Mesh(merge(list), mat); m.receiveShadow = true; g.add(m); } };
  M(lists.win, new THREE.MeshStandardMaterial({ map: TX.windowTex(), roughness: 0.35, metalness: 0.15 }));
  M(lists.door, new THREE.MeshStandardMaterial({ map: TX.doorTex(), roughness: 0.8 }));
  // modelled AC units and balconies, instanced by transforming one shared set of parts
  const inst = (list, parts, matsFor) => {
    if (!list.length) return;
    Object.entries(parts).forEach(([k, geo]) => {
      const gs = list.map(([x, y, z, ry]) => { const c = geo.clone(); c.rotateY(ry); c.translate(x, y, z); return c; });
      const m = new THREE.Mesh(PR.mergeAll(gs), matsFor[k]); m.castShadow = true; m.receiveShadow = true; g.add(m);
    });
  };
  inst(lists.ac, PR.acParts(), { body: new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.5, metalness: 0.3 }), dark: new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.6, metalness: 0.4 }) });
  inst(lists.balc, PR.balconyParts(), { slab: mats.cap, iron: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.5, metalness: 0.6 }) });
  M(lists.pipe, new THREE.MeshStandardMaterial({ color: 0x7a7f86, roughness: 0.4, metalness: 0.8 }));
  M(lists.ivy, new THREE.MeshStandardMaterial({ map: TX.ivyTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }));
  const signCols = [['#1f4e5f', '#f4ead2'], ['#6a2430', '#f6e7c9'], ['#2f4a2a', '#efe6c8'], ['#f0e6d0', '#7a2a2a']];
  signs.slice(0, 14).forEach((s, k) => {
    const [bg, fg] = signCols[k % signCols.length];
    const p = new THREE.PlaneGeometry(2.2, 0.42);
    p.rotateY(Math.atan2(s.n[0], s.n[2]));
    p.translate(s.cx + s.n[0] * 0.05, s.y, s.cz + s.n[2] * 0.05);
    g.add(new THREE.Mesh(p, new THREE.MeshStandardMaterial({ map: TX.signTex(s.name, bg, fg), roughness: 0.6 })));
  });
  return g;
}

function baseUnderProp(L, i, j) {
  // the floor height under a prop: the prop sits on its area's floor
  const a = L.area[L.idx(i, j)];
  return a >= 0 ? L.def.areas[a].h : 0;
}

function baseAt(L, x, z) {
  const i = L.ci(x); const j = L.cj(z);
  if (!L.inside(i, j)) return 0;
  const a = L.area[L.idx(i, j)];
  if (L.kind[L.idx(i, j)] === 1) return L.top[L.idx(i, j)];
  return a >= 0 ? L.def.areas[a].h : 0;
}

function nearOpen(L, i, j, r) {
  for (let dj = -r; dj <= r; dj += Math.max(1, Math.floor(r / 3))) {
    for (let di = -r; di <= r; di += Math.max(1, Math.floor(r / 3))) {
      const a = i + di; const b = j + dj;
      if (L.inside(a, b) && L.kind[L.idx(a, b)] === 1) return true;
    }
  }
  return false;
}

function merge(geos) {
  // minimal merge (same attributes): position, normal, uv
  let n = 0;
  geos.forEach((g) => { n += (g.index ? g.index.count : g.attributes.position.count); });
  const pos = new Float32Array(n * 3); const nor = new Float32Array(n * 3); const uv = new Float32Array(n * 2);
  let o = 0;
  geos.forEach((g0) => {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

function makePalms(list, mats) {
  const g = new THREE.Group();
  const T = []; const Fr = []; const N = [];
  list.forEach(([x, z, s, r]) => { const p = PR.palmParts(x, z, s, r); T.push(...p.trunk); Fr.push(...p.fronds); N.push(...p.nuts); });
  const tm = new THREE.Mesh(PR.mergeAll(T), mats.trunk); tm.castShadow = true;
  const lm = new THREE.Mesh(PR.mergeAll(Fr), mats.frond); lm.castShadow = true;
  const nm = new THREE.Mesh(PR.mergeAll(N), mats.trunk);
  g.add(tm, lm, nm);
  return g;
}

function makeMaterials() {
  const pl = TX.plaster(1);
  const st = TX.stone(2);
  const st2 = TX.stone(9, '#b8ad98');
  const tl = TX.tiles(3);
  const tlCool = TX.tiles(13, ['#c3c2b6', '#cfcdc0', '#b8b8ab']);
  const tlWarm = TX.tiles(23, ['#d2a88a', '#dcb698', '#c69c7e']);
  const sl = TX.slabs(4);
  const sd = TX.sand(5);
  const mt = TX.metal(6, '#2f7d86');
  const cr = TX.crate(7);
  const cg = TX.cargo(8, '#cf6a32');
  const std = (t, o = {}) => new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.92, metalness: 0, ...o });
  pl.map.repeat.set(1, 1);
  return {
    wall: std(pl, { vertexColors: true }),
    block: std(st2, { vertexColors: true }),
    cap: std(st, { color: 0xeeeeee }),
    ledge: std(st, { vertexColors: true }),
    trim: std(st, { vertexColors: true, side: THREE.DoubleSide }),
    roof: std(st2, { vertexColors: true, color: 0xb0a898 }),
    floor: {
      plaza: std(sl), tile: std(tl), sand: std(sd), def: std(tlCool), atk: std(tlWarm), stair: std(st),
    },
    crate: std(cr, { roughness: 0.85 }),
    wood: std(TX.wood(31), { roughness: 0.82 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.45, metalness: 0.75 }),
    cargoSteel: new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.55, metalness: 0.6 }),
    cargo: std(cg, { roughness: 0.6, metalness: 0.3 }),
    metal: std(mt, { roughness: 0.55, metalness: 0.4 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x332a20, emissive: 0xffd9a0, emissiveIntensity: 2.2 }),
    trunk: std(TX.wood(41, [118, 98, 76]), { roughness: 1 }),
    frond: new THREE.MeshStandardMaterial({ map: TX.frond(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }),
    barrier: new THREE.MeshBasicMaterial({ color: 0x5be0ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
}
