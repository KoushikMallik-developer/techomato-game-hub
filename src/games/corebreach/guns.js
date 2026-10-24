// Core Breach weapons, built from machined-looking parts:
//  - side profiles with filleted corners (every outline is rounded like a real moulding or casting),
//    extruded with bevelled edges, and through-cut holes (handguard slots, trigger guards, stock cut-outs,
//    muzzle-brake ports) so you can see light and the barrel through them;
//  - lathed round parts (barrels with steps and crowns, gas blocks, suppressors, buffer tubes, scopes);
//  - picatinny rails as one toothed extrusion; flip-up irons, holographic and magnified optics;
//  - small parts that sell it: ejection port and dust cover, forward assist, charging handle, selector,
//    mag release, bolt catch, trigger blade, pins, sling mounts, slide serrations.
// Guns point down -z with the pistol grip at the origin. Children: 'muzzle' (barrel end), 'mag'
// (dropped on reload) and optionally userData.slide (a part that cycles back when firing).
import * as THREE from 'three';

// ── shape helpers ──
// polygon [z, y, r?] -> Shape with each corner filleted (r per point, default r)
export function rshape(pts, r = 0.004, ShapeClass = THREE.Shape) {
  const s = new ShapeClass();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const P = pts[i]; const A = pts[(i - 1 + n) % n]; const Bp = pts[(i + 1) % n];
    const rr = P[2] ?? r;
    const ax = A[0] - P[0]; const ay = A[1] - P[1]; const bx = Bp[0] - P[0]; const by = Bp[1] - P[1];
    const la = Math.hypot(ax, ay) || 1; const lb = Math.hypot(bx, by) || 1;
    const d = Math.min(rr, la * 0.48, lb * 0.48);
    const p1 = [P[0] + (ax / la) * d, P[1] + (ay / la) * d]; const p2 = [P[0] + (bx / lb) * d, P[1] + (by / lb) * d];
    if (i === 0) s.moveTo(p1[0], p1[1]); else s.lineTo(p1[0], p1[1]);
    if (d > 1e-5) s.quadraticCurveTo(P[0], P[1], p2[0], p2[1]); else s.lineTo(P[0], P[1]);
  }
  s.closePath();
  return s;
}
// rounded slot (for holes)
export function slot(cz, cy, len, h, r = null) {
  const a = len / 2; const b = h / 2;
  return rshape([[cz - a, cy - b], [cz + a, cy - b], [cz + a, cy + b], [cz - a, cy + b]], r ?? Math.min(a, b) * 0.98, THREE.Path);
}
export function circle(cz, cy, r) { const p = new THREE.Path(); p.absarc(cz, cy, r, 0, Math.PI * 2, true); return p; }

// planar uvs from the dominant normal axis (scale = repeats per metre)
export function boxUV(geo, scale) {
  const p = geo.attributes.position; const n = geo.attributes.normal || (geo.computeVertexNormals(), geo.attributes.normal);
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)); const ay = Math.abs(n.getY(i)); const az = Math.abs(n.getZ(i));
    const [u, v] = ax >= ay && ax >= az ? [p.getZ(i), p.getY(i)] : ay >= az ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function makeKit(g, mats, cast) {
  const add = (geo, mat, parent = g) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; };
  const K = {
    // side profile (z, y) extruded across x, centred on x
    side(pts, width, mat, { x = 0, r = 0.004, bevel = 0.003, holes = [], parent = g, seg = 2 } = {}) {
      const sh = Array.isArray(pts) ? rshape(pts, r) : pts;
      holes.forEach((h) => sh.holes.push(h));
      const b = Math.min(bevel, width * 0.3);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.0005, width - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.9, bevelSegments: seg, curveSegments: 8 });
      boxUV(geo, 40);
      geo.rotateY(-Math.PI / 2);
      geo.translate(x + (width - b * 2) / 2, 0, 0);
      return add(geo, mat, parent);
    },
    // front profile (x, y) extruded along -z from z0 by depth
    front(pts, depth, mat, z0, { r = 0.003, bevel = 0.0015, holes = [], parent = g } = {}) {
      const sh = Array.isArray(pts) ? rshape(pts, r) : pts;
      holes.forEach((h) => sh.holes.push(h));
      const b = Math.min(bevel, depth * 0.3);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.0005, depth - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.9, bevelSegments: 2, curveSegments: 8 });
      boxUV(geo, 40);
      geo.translate(0, 0, -(depth - b) + 0); // spans z0-depth .. z0 after the offset below
      const m = add(geo, mat, parent);
      m.position.z = z0;
      return m;
    },
    // lathed part along the bore: pts [radius, distance forward]; starts at z0 and runs toward -z
    lathe(pts, mat, y, z0, { x = 0, seg = 28, parent = g } = {}) {
      if (pts[pts.length - 1][1] < pts[0][1]) pts = pts.slice().reverse(); // keep faces pointing outward
      const geo = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(0.0001, r), h)), seg);
      geo.rotateX(-Math.PI / 2);
      boxUV(geo, 40);
      const m = add(geo, mat, parent);
      m.position.set(x, y, z0);
      return m;
    },
    box(w, h, d, mat, x, y, z, { r = 0.0015, parent = g } = {}) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const m = add(r > 0 ? rounded(w, h, d, r) : geo, mat, parent);
      m.position.set(x, y, z);
      return m;
    },
    cyl(r1, r2, h, mat, x, y, z, { seg = 20, rx = 0, rz = 0, parent = g } = {}) {
      const m = add(new THREE.CylinderGeometry(r1, r2, h, seg), mat, parent);
      m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz;
      return m;
    },
    // picatinny rail: one toothed extrusion from z0 to z1 (z0 > z1) with its base at y
    rail(z0, z1, y, mat, { w = 0.021, parent = g } = {}) {
      const pts = [[z0, y], [z0, y + 0.0095]];
      const P = 0.01; const n = Math.floor((z0 - z1 - 0.004) / P);
      for (let k = 0; k < n; k++) {
        const a = z0 - 0.003 - k * P;
        pts.push([a, y + 0.0095], [a, y + 0.0062], [a - 0.0052, y + 0.0062], [a - 0.0052, y + 0.0095]);
      }
      pts.push([z1, y + 0.0095], [z1, y]);
      const geo = new THREE.ExtrudeGeometry(rshape(pts.map((p) => [p[0], p[1], 0.0006]), 0.0006), { depth: w - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0018, bevelSegments: 1, curveSegments: 1 });
      boxUV(geo, 40);
      geo.rotateY(-Math.PI / 2);
      geo.translate((w - 0.004) / 2, 0, 0);
      return add(geo, mat, parent);
    },
    add,
    group(parent = g) { const o = new THREE.Group(); parent.add(o); return o; },
  };
  return K;
}

const RB = new Map();
function rounded(w, h, d, r) {
  const key = `${w}|${h}|${d}|${r}`;
  if (!RB.has(key)) {
    const s = rshape([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], 0.0001);
    const b = Math.min(r, w * 0.3, h * 0.3, d * 0.3);
    const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0002, d - b * 2), bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.95, bevelSegments: 2, curveSegments: 2 });
    geo.translate(0, 0, -(d - b * 2) / 2);
    geo.userData.shared = true;
    RB.set(key, geo);
  }
  return RB.get(key);
}

// ── shared assemblies ──
export function parts(K, m) {
  const P = {};
  // flip-up iron sights: rear (aperture) and front (post in a protective hood), on a rail at y
  P.ironRear = (z, y) => {
    K.side([[z + 0.012, y], [z + 0.012, y + 0.008], [z - 0.012, y + 0.008], [z - 0.012, y]], 0.024, m.metal, { r: 0.002 });
    K.front([[-0.009, y + 0.007], [0.009, y + 0.007], [0.009, y + 0.03], [0.004, y + 0.034], [-0.004, y + 0.034], [-0.009, y + 0.03]], 0.006, m.metal, z + 0.003, { holes: [circle(0, y + 0.024, 0.0026)] });
  };
  P.ironFront = (z, y) => {
    K.side([[z + 0.012, y], [z + 0.012, y + 0.008], [z - 0.012, y + 0.008], [z - 0.012, y]], 0.024, m.metal, { r: 0.002 });
    K.front([[-0.011, y + 0.007], [0.011, y + 0.007], [0.011, y + 0.03], [0.006, y + 0.036], [-0.006, y + 0.036], [-0.011, y + 0.03]], 0.006, m.metal, z + 0.003, { holes: [rshape([[-0.0075, y + 0.012], [0.0075, y + 0.012], [0.0075, y + 0.031], [-0.0075, y + 0.031]], 0.003, THREE.Path)] });
    K.box(0.0022, 0.016, 0.0022, m.metal, 0, y + 0.02, z, { r: 0.0004 });
    K.box(0.0016, 0.0016, 0.0016, m.glow, 0, y + 0.028, z - 0.0005, { r: 0 });
  };
  // holographic sight: clamp base, a hood with a window, tinted glass and a ring reticle
  P.holo = (z, y) => {
    K.side([[z + 0.035, y], [z + 0.035, y + 0.012], [z - 0.035, y + 0.012], [z - 0.035, y]], 0.03, m.metal, { r: 0.003 });
    K.box(0.006, 0.01, 0.018, m.metal, 0.018, y + 0.006, z + 0.01, { r: 0.002 }); // clamp knob
    K.cyl(0.0055, 0.0055, 0.006, m.steel, 0.022, y + 0.006, z + 0.01, { rz: Math.PI / 2, seg: 14 });
    const hood = [[-0.021, y + 0.01], [0.021, y + 0.01], [0.021, y + 0.042], [0.016, y + 0.05], [-0.016, y + 0.05], [-0.021, y + 0.042]];
    K.front(hood, 0.05, m.metal, z + 0.025, { r: 0.004, holes: [rshape([[-0.0165, y + 0.014], [0.0165, y + 0.014], [0.0165, y + 0.044], [-0.0165, y + 0.044]], 0.004, THREE.Path)] });
    const gl = K.box(0.033, 0.03, 0.0015, m.glass, 0, y + 0.029, z - 0.01, { r: 0 }); gl.castShadow = false;
    const ring = K.add(new THREE.TorusGeometry(0.004, 0.00045, 4, 24), m.dot); ring.position.set(0, y + 0.029, z - 0.0095);
    K.box(0.0009, 0.0009, 0.0009, m.dot, 0, y + 0.029, z - 0.0094, { r: 0 });
    K.box(0.012, 0.008, 0.016, m.metal, 0.0, y + 0.008, z + 0.028, { r: 0.002 }); // battery housing
  };
  // magnified optic on rings: lathed tube with objective bell, eyepiece, turrets and glass
  P.scope = (z, y, len = 0.28, big = 0.025) => {
    const yy = y + 0.04;
    const t = 0.0155;
    K.lathe([[0.001, 0], [big - 0.002, 0], [big, 0.004], [big, 0.03], [big * 0.92, 0.05], [t, 0.075], [t, len * 0.42], [t + 0.003, len * 0.44], [t + 0.003, len * 0.56], [t, len * 0.58], [t, len - 0.075], [0.019, len - 0.05], [0.0205, len - 0.02], [0.0195, len], [0.001, len]].map(([r, h]) => [r, -h + len]), m.metal, yy, z + len / 2, { seg: 32 });
    // glass at both ends
    [z - len / 2 - 0.0005, z + len / 2 + 0.0005].forEach((zz, i) => { const d = K.cyl(i ? 0.017 : big - 0.003, i ? 0.017 : big - 0.003, 0.002, m.glass, 0, yy, zz, { rx: Math.PI / 2, seg: 28 }); d.castShadow = false; });
    // turrets
    K.cyl(0.011, 0.011, 0.018, m.metal, 0, yy + 0.022, z, { seg: 24 });
    K.cyl(0.0115, 0.0115, 0.006, m.steel, 0, yy + 0.031, z, { seg: 24 });
    K.cyl(0.011, 0.011, 0.018, m.metal, 0.022, yy, z, { seg: 24, rz: Math.PI / 2 });
    K.cyl(0.008, 0.008, 0.012, m.metal, -0.019, yy, z + 0.01, { seg: 18, rz: Math.PI / 2 });
    // rings with bases clamped to the rail
    [z - len * 0.26, z + len * 0.2].forEach((zz) => {
      K.lathe([[0.0185, 0], [0.0185, 0.013]], m.metal, yy, zz + 0.0065, { seg: 28 });
      K.side([[zz + 0.009, y], [zz + 0.009, yy - 0.012], [zz - 0.009, yy - 0.012], [zz - 0.009, y]], 0.026, m.metal, { r: 0.002 });
      K.cyl(0.004, 0.004, 0.005, m.steel, 0.015, y + 0.007, zz, { rz: Math.PI / 2, seg: 10 });
    });
  };
  // bevelled pistol grip with finger ridges, slanted back (polymer)
  P.grip = (mat, { z = 0, y = -0.012, len = 0.105, w = 0.032 } = {}) => {
    const s = len / 0.105;
    const pts = [[z + 0.034, y], [z - 0.014, y], [z - 0.017, y - 0.028 * s], [z - 0.011, y - 0.042 * s, 0.006], [z - 0.014, y - 0.056 * s, 0.004], [z - 0.006, y - 0.07 * s, 0.006], [z - 0.009, y - 0.083 * s, 0.004], [z + 0.0, y - 0.1 * s, 0.006], [z + 0.008, y - len, 0.006], [z + 0.042, y - len + 0.006, 0.007], [z + 0.048, y - len + 0.02, 0.006], [z + 0.042, y - 0.05 * s, 0.01], [z + 0.044, y - 0.02, 0.006]];
    K.side(pts, w, mat, { bevel: 0.0075, r: 0.004, seg: 3 });
    K.side([[z + 0.009, y - len - 0.002], [z + 0.044, y - len + 0.004], [z + 0.046, y - len + 0.012], [z + 0.008, y - len + 0.006]], w + 0.002, mat, { bevel: 0.003, r: 0.003 }); // base cap
  };
  // trigger guard (with its opening) and a curved trigger blade
  P.trigger = (z = -0.012, y = -0.02, guardMat = m.poly) => {
    K.side([[z + 0.012, y], [z + 0.012, y - 0.03, 0.01], [z - 0.062, y - 0.03, 0.012], [z - 0.07, y - 0.01], [z - 0.07, y]], 0.012, guardMat, { r: 0.004, bevel: 0.003, holes: [slot(z - 0.026, y - 0.015, 0.064, 0.019, 0.008)] });
    K.side([[z - 0.016, y + 0.002], [z - 0.02, y - 0.008, 0.004], [z - 0.022, y - 0.02, 0.003], [z - 0.017, y - 0.023, 0.002], [z - 0.015, y - 0.016, 0.003], [z - 0.011, y - 0.006], [z - 0.011, y + 0.002]], 0.0055, m.steel, { r: 0.002, bevel: 0.0012 });
  };
  // AR-style lower + upper receiver with all the small parts
  P.receiver = (L, { skin = m.skin, ejectSide = 1 } = {}) => {
    const f = -0.06 - L; // front of the upper
    // lower: buffer housing, mag well (with flared opening), pin bosses
    K.side([[0.075, 0.017], [0.075, -0.004], [0.045, -0.022, 0.012], [0.006, -0.026], [-0.068, -0.026], [-0.075, -0.064, 0.003], [-0.148, -0.064, 0.003], [-0.158, -0.03, 0.01], [f + 0.03, -0.012], [f + 0.03, 0.017]], 0.046, skin, { r: 0.004, bevel: 0.003 });
    K.side([[-0.071, -0.058], [-0.071, -0.068], [-0.152, -0.068], [-0.152, -0.058]], 0.05, skin, { r: 0.003, bevel: 0.002 }); // flared mag well lip
    [-1, 1].forEach((sd) => {
      [0.055, -0.15].forEach((zz) => K.cyl(0.0045, 0.0045, 0.003, m.steel, sd * 0.0235, 0.0045, zz, { rz: Math.PI / 2, seg: 12 })); // takedown pins
      K.cyl(0.0035, 0.0035, 0.003, m.steel, sd * 0.0235, -0.012, -0.01, { rz: Math.PI / 2, seg: 10 }); // trigger pin
    });
    K.box(0.004, 0.01, 0.022, m.metal, -0.0255, 0.0, -0.105, { r: 0.0015 }); // bolt catch paddle
    K.cyl(0.0055, 0.0055, 0.004, m.steel, 0.025, -0.022, -0.068, { rz: Math.PI / 2, seg: 14 }); // mag release
    const sel = K.box(0.003, 0.006, 0.024, m.steel, -0.0255, -0.004, 0.022, { r: 0.0012 }); sel.rotation.x = 0.4; // selector lever
    // upper: forward assist bump, ejection port with dust cover, brass deflector
    K.side([[0.075, 0.017], [0.075, 0.05], [0.07, 0.054], [f, 0.054], [f, 0.017]], 0.042, m.metal, { r: 0.003, bevel: 0.003 });
    K.side([[0.04, 0.02], [0.04, 0.04], [-0.04, 0.04], [-0.04, 0.02]], 0.0035, m.dark, { x: ejectSide * 0.0205, r: 0.003, bevel: 0.001 }); // port
    K.side([[0.044, 0.016], [0.044, 0.024], [-0.042, 0.024], [-0.042, 0.016]], 0.002, m.metal, { x: ejectSide * 0.0228, r: 0.002, bevel: 0.0006 }); // dust cover (opened down)
    K.box(0.006, 0.012, 0.018, m.metal, ejectSide * 0.022, 0.046, 0.05, { r: 0.004 }); // deflector
    K.lathe([[0.007, 0], [0.007, 0.025], [0.006, 0.028], [0.0, 0.028]], m.metal, 0.038, 0.06, { x: ejectSide * 0.021, seg: 16 }); // forward assist
    // charging handle at the back of the upper
    K.side([[0.09, 0.05], [0.09, 0.058], [0.075, 0.058], [0.075, 0.05]], 0.04, m.metal, { r: 0.003, bevel: 0.002 });
    K.rail(0.072, f + 0.002, 0.054, m.metal);
    return f;
  };
  // free-floating handguard: rounded tube with through-cut slots, a continuous top rail
  P.handguard = (z0, len, { mat = m.metal, y = 0.03, h = 0.05, w = 0.05, slots = true } = {}) => {
    const holes = [];
    if (slots) for (let zz = z0 - 0.03; zz > z0 - len + 0.03; zz -= 0.045) holes.push(slot(zz, y - 0.004, 0.026, 0.0075));
    K.side([[z0, y - h / 2], [z0, y + h / 2 - 0.006], [z0 - len, y + h / 2 - 0.006], [z0 - len, y - h / 2]], w, mat, { r: 0.004, bevel: 0.009, seg: 3, holes });
    K.rail(z0 - 0.002, z0 - len + 0.004, y + h / 2 - 0.006, m.metal);
    // end cap and a QD sling cup near the back
    K.lathe([[0.0, 0], [0.011, 0], [0.013, 0.004], [0.013, 0.008]], m.metal, y - 0.002, z0 - len + 0.002, { seg: 24 });
    K.cyl(0.006, 0.006, 0.006, m.steel, -w / 2 - 0.001, y - 0.004, z0 - 0.03, { rz: Math.PI / 2, seg: 14 });
  };
  // barrel with a gas block and a crown, from z0 forward by len (a little visible under the handguard)
  P.barrel = (z0, len, y, r = 0.0085) => {
    K.lathe([[0, 0], [r * 1.3, 0], [r * 1.3, 0.03], [r, 0.035], [r, len - 0.004], [r * 0.85, len], [r * 0.4, len], [r * 0.35, len - 0.003], [0, len - 0.003]], m.metal, y, z0, { seg: 24 });
  };
  // compensator/brake: a rounded block with ports cut through both sides
  P.brake = (z0, y, { len = 0.055, r = 0.012 } = {}) => {
    const holes = [slot(z0 - len * 0.3, y, len * 0.16, r * 1.1), slot(z0 - len * 0.55, y, len * 0.16, r * 1.1), slot(z0 - len * 0.8, y + r * 0.2, len * 0.12, r * 0.8)];
    K.side([[z0, y - r], [z0, y + r], [z0 - len, y + r], [z0 - len, y - r]], r * 2, m.metal, { r: r * 0.5, bevel: r * 0.35, seg: 3, holes });
    K.lathe([[0, 0], [r * 0.62, 0], [r * 0.62, 0.01]], m.dark, y, z0 - len + 0.0105, { seg: 16 }); // bore
    K.lathe([[r * 0.95, 0], [r * 0.95, 0.008]], m.metal, y, z0 + 0.008, { seg: 20 }); // lock ring
  };
  P.suppressor = (z0, y, { len = 0.16, r = 0.019 } = {}) => {
    const pts = [[0.009, 0], [r * 0.82, 0], [r, 0.008], [r, len - 0.01], [r * 0.85, len], [0.006, len]];
    K.lathe(pts, m.metal, y, z0, { seg: 32 });
    for (let k = 0; k < 5; k++) K.lathe([[r + 0.0007, 0], [r + 0.0007, 0.004]], m.dark, y, z0 - 0.02 - k * 0.006, { seg: 32 }); // grip rings
    K.lathe([[0, 0], [0.006, 0], [0.006, 0.004]], m.dark, y, z0 - len + 0.004, { seg: 16 });
  };
  // adjustable stock on a buffer tube
  P.stock = (y = 0.034, mat = m.poly) => {
    K.lathe([[0.0145, 0], [0.0145, 0.2], [0.012, 0.204], [0, 0.204]].map(([r, h]) => [r, -h]), m.metal, y, 0.075, { seg: 24 });
    K.lathe([[0.017, 0], [0.017, -0.012]], m.metal, y, 0.075, { seg: 24 }); // castle nut
    const holes = [slot(0.235, y - 0.04, 0.05, 0.016, 0.007)];
    K.side([[0.15, y + 0.02], [0.3, y + 0.022], [0.312, y + 0.012], [0.316, y - 0.088], [0.298, y - 0.094], [0.27, y - 0.08], [0.2, y - 0.028], [0.15, y - 0.02]], 0.044, mat, { r: 0.008, bevel: 0.006, seg: 3, holes });
    K.side([[0.314, y + 0.016], [0.33, y + 0.016], [0.332, y - 0.09], [0.316, y - 0.094]], 0.046, m.rubber, { r: 0.006, bevel: 0.004 }); // butt pad
    K.box(0.01, 0.02, 0.03, mat, 0, y - 0.024, 0.165, { r: 0.004 }); // adjustment lever
    K.add(new THREE.TorusGeometry(0.007, 0.0018, 6, 14), m.steel).position.set(-0.024, y - 0.01, 0.26); // sling loop
  };
  // curved rifle magazine (in mag-local coords, top at y 0, centred at z 0)
  P.curvedMag = (parent, mat, { len = 0.17, curve = 1, w = 0.026 } = {}) => {
    const c = curve; const s = len / 0.17;
    const pts = [[-0.026, 0.004], [-0.031, -0.05 * s], [-0.041 * c - 0.0, -0.11 * s, 0.03], [-0.058 * c, -0.165 * s], [-0.062 * c, -0.172 * s], [-0.014 * c, -0.178 * s], [-0.01 * c, -0.17 * s], [0.004, -0.11 * s, 0.03], [0.018, -0.05 * s], [0.024, 0.004]];
    K.side(pts, w, mat, { r: 0.004, bevel: 0.0035, parent });
    // a raised spine down each flank (follows the curve) gives the moulded-mag look
    K.side([[-0.018, -0.012], [-0.023, -0.05 * s], [-0.034 * c, -0.11 * s, 0.03], [-0.05 * c, -0.158 * s], [-0.036 * c, -0.16 * s], [-0.02 * c, -0.11 * s, 0.03], [-0.008, -0.05 * s], [-0.004, -0.012]], w + 0.003, mat, { r: 0.003, bevel: 0.0012, parent });
    K.side([[-0.068 * c, -0.168 * s], [-0.064 * c, -0.186 * s], [-0.008 * c, -0.18 * s], [-0.008 * c, -0.168 * s]], w + 0.004, m.poly, { r: 0.004, bevel: 0.003, parent }); // base plate
    K.cyl(0.0045, 0.0045, 0.03, m.brass, 0, 0.004, -0.004, { rx: Math.PI / 2, seg: 10, parent }); // top round
  };
  P.boxMag = (parent, mat, { len = 0.15, d = 0.05, w = 0.026 } = {}) => {
    K.side([[d / 2, 0.004], [d / 2, -len, 0.005], [-d / 2, -len, 0.005], [-d / 2, 0.004]], w, mat, { r: 0.003, bevel: 0.003, parent });
    K.side([[d / 2 + 0.003, -len + 0.004], [d / 2 + 0.003, -len - 0.008], [-d / 2 - 0.003, -len - 0.008], [-d / 2 - 0.003, -len + 0.004]], w + 0.004, m.poly, { r: 0.004, bevel: 0.002, parent });
    for (let k = 0; k < 4; k++) K.box(w + 0.002, 0.003, d * 0.6, mat, 0, -0.03 - k * len * 0.2, 0, { r: 0.0012, parent });
    K.cyl(0.0045, 0.0045, d * 0.6, m.brass, 0, 0.004, 0, { rx: Math.PI / 2, seg: 10, parent });
  };
  return P;
}

// ── the arsenal ──
// returns { muzzleAt: [y, z], slide } and fills `mag`
export function buildWeapon(w, K, P, m, mag) {
  const id = w.id;
  const out = { muzzle: [0.034, -0.6], slide: null };
  const by = 0.034; // bore height on long guns
  switch (w.cat) {
    case 'melee': {
      // combat knife: clip-point blade with a fuller and a bevelled edge, guard, finger-grooved handle
      K.side([[-0.02, -0.014], [-0.02, 0.016], [-0.17, 0.016], [-0.215, 0.01, 0.01], [-0.262, -0.004, 0.002], [-0.235, -0.013, 0.02], [-0.12, -0.016, 0.03]], 0.0055, m.steel, { r: 0.003, bevel: 0.0022 });
      K.side([[-0.03, 0.006], [-0.03, 0.01], [-0.16, 0.01], [-0.17, 0.007]], 0.0062, m.dark, { r: 0.002, bevel: 0.0008 }); // fuller
      K.side([[-0.03, -0.012], [-0.03, -0.014], [-0.23, -0.012], [-0.24, -0.01]], 0.0058, m.glow, { r: 0.001, bevel: 0.0005 }); // edge highlight
      K.side([[-0.008, -0.028], [-0.008, 0.03, 0.006], [-0.021, 0.03, 0.006], [-0.021, -0.028, 0.006]], 0.024, m.metal, { r: 0.005, bevel: 0.003 }); // guard
      K.side([[0.11, -0.014, 0.008], [0.105, 0.016, 0.008], [0.06, 0.017], [0.04, 0.013, 0.01], [0.02, 0.017], [-0.008, 0.016], [-0.008, -0.016], [0.02, -0.02, 0.008], [0.04, -0.015, 0.01], [0.06, -0.02, 0.008]], 0.026, m.skin, { r: 0.004, bevel: 0.007, seg: 3 });
      K.lathe([[0, 0], [0.014, 0], [0.016, 0.004], [0.014, 0.012], [0, 0.014]].map(([r, h]) => [r, -h]), m.metal, 0.0, 0.106, { seg: 18 }); // pommel
      for (let k = 0; k < 5; k++) K.box(0.027, 0.003, 0.004, m.dark, 0, 0.0, 0.01 + k * 0.018, { r: 0.001 }); // grip rings
      out.muzzle = [0, -0.26];
      break;
    }
    case 'sidearm': {
      if (id === 'magnum') {
        // revolver: frame with the cylinder window, fluted cylinder, full-lug barrel with a vent rib, hammer
        K.side([[0.05, 0.03], [0.045, 0.062, 0.008], [0.03, 0.064], [-0.02, 0.064], [-0.03, 0.058], [-0.06, 0.058], [-0.06, 0.004], [-0.04, 0.0], [-0.012, -0.005], [0.03, 0.0], [0.04, 0.01]], 0.03, m.steel, { r: 0.004, bevel: 0.0035, holes: [slot(0.002, 0.034, 0.064, 0.044, 0.004)] });
        const cylG = K.group(); cylG.position.set(0, 0.034, 0.002);
        K.lathe([[0.006, 0], [0.026, 0], [0.028, 0.004], [0.028, 0.052], [0.026, 0.056], [0.006, 0.056]], m.steel, 0, 0.03, { seg: 30, parent: cylG });
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; K.box(0.006, 0.006, 0.04, m.dark, Math.cos(a) * 0.0275, Math.sin(a) * 0.0275, 0.002, { r: 0.0025, parent: cylG }).rotation.z = a; }
        K.side([[-0.06, 0.03], [-0.06, 0.07], [-0.24, 0.07], [-0.245, 0.066], [-0.245, 0.03, 0.006]], 0.024, m.steel, { r: 0.004, bevel: 0.004 }); // full lug barrel
        for (let zz = -0.075; zz > -0.235; zz -= 0.02) K.box(0.012, 0.006, 0.012, m.steel, 0, 0.072, zz, { r: 0.002 }); // vent rib
        K.side([[-0.236, 0.072], [-0.236, 0.082], [-0.244, 0.082], [-0.248, 0.072]], 0.006, m.glow, { r: 0.001, bevel: 0.0006 }); // front sight
        K.lathe([[0, 0], [0.0075, 0], [0.0075, 0.001]], m.dark, 0.05, -0.2445, { seg: 18 }); // bore
        K.side([[0.05, 0.05], [0.07, 0.072], [0.077, 0.07], [0.06, 0.044]], 0.008, m.metal, { r: 0.003, bevel: 0.002 }); // hammer
        K.side([[0.04, 0.012], [0.062, -0.03, 0.02], [0.065, -0.09, 0.012], [0.052, -0.118, 0.012], [0.018, -0.114, 0.012], [0.02, -0.07, 0.015], [0.005, -0.01]], 0.034, m.skin, { r: 0.006, bevel: 0.008, seg: 3 }); // wooden grip
        P.trigger(-0.008, -0.002, m.steel);
        mag.position.set(0, 0.034, 0.03); // speed-loader position (hidden inside the cylinder)
        out.muzzle = [0.05, -0.25];
        break;
      }
      if (id === 'bolt') {
        // pistol-grip double-barrel: break-action frame, twin barrels with a top rib, hammers
        K.side([[0.04, 0.012], [0.04, 0.05, 0.01], [-0.06, 0.05], [-0.06, 0.004], [0.0, -0.004]], 0.05, m.steel, { r: 0.006, bevel: 0.004 });
        [-1, 1].forEach((sd) => {
          K.lathe([[0.0, 0], [0.0135, 0], [0.0135, 0.25], [0.012, 0.252], [0.0095, 0.252], [0.0095, 0.248], [0, 0.248]], m.metal, 0.03, -0.055, { x: sd * 0.0135, seg: 24 });
          K.side([[0.04, 0.05], [0.058, 0.07], [0.064, 0.068], [0.05, 0.044]], 0.007, m.metal, { r: 0.002, x: sd * 0.012, bevel: 0.0015 }); // hammers
        });
        K.side([[-0.06, 0.042], [-0.06, 0.047], [-0.3, 0.047], [-0.3, 0.042]], 0.008, m.metal, { r: 0.001, bevel: 0.001 }); // rib
        K.box(0.004, 0.004, 0.004, m.glow, 0, 0.05, -0.296, { r: 0 });
        K.side([[-0.08, 0.016], [-0.08, 0.004, 0.005], [-0.2, 0.004, 0.006], [-0.2, 0.016]], 0.052, m.skin, { r: 0.005, bevel: 0.006 }); // forend
        K.side([[0.035, 0.008], [0.06, -0.035, 0.02], [0.062, -0.095, 0.01], [0.05, -0.12, 0.012], [0.016, -0.112, 0.012], [0.016, -0.06, 0.015], [0.0, -0.004]], 0.036, m.skin, { r: 0.006, bevel: 0.008, seg: 3 });
        P.trigger(-0.006, -0.0, m.steel);
        mag.position.set(0, 0.03, -0.04);
        K.cyl(0.011, 0.011, 0.012, m.brass, 0.0135, 0, 0, { rx: Math.PI / 2, seg: 14, parent: mag });
        K.cyl(0.011, 0.011, 0.012, m.brass, -0.0135, 0, 0, { rx: Math.PI / 2, seg: 14, parent: mag });
        out.muzzle = [0.03, -0.31];
        break;
      }
      // semi-auto pistol: polymer frame with integrated guard and accessory rail, a cycling slide
      const holes = [slot(-0.036, -0.016, 0.046, 0.019, 0.008)];
      K.side([[0.044, 0.016], [0.052, 0.006, 0.004], [0.04, -0.016, 0.006], [0.054, -0.106, 0.01], [0.048, -0.122, 0.006], [0.012, -0.124, 0.006], [0.002, -0.104, 0.01], [-0.006, -0.088, 0.005], [-0.002, -0.074, 0.005], [-0.008, -0.058, 0.005], [-0.004, -0.044, 0.006], [-0.01, -0.03, 0.006], [-0.056, -0.03, 0.012], [-0.064, -0.012, 0.006], [-0.142, -0.006, 0.003], [-0.146, 0.016, 0.002]], 0.028, m.poly, { r: 0.003, bevel: 0.0035, holes });
      for (let zz = -0.08; zz > -0.14; zz -= 0.012) K.box(0.03, 0.003, 0.004, m.poly, 0, -0.008, zz, { r: 0.001 }); // rail slots
      P.trigger(-0.004, -0.004, m.poly);
      const slide = K.group();
      out.slide = slide;
      const sMat = id === 'wasp' ? m.metal : m.skin;
      K.side([[0.05, 0.014], [0.05, 0.05, 0.004], [0.042, 0.057, 0.006], [-0.15, 0.057, 0.006], [-0.157, 0.05, 0.004], [-0.157, 0.014]], 0.03, sMat, { r: 0.002, bevel: 0.0035, parent: slide, holes: [slot(-0.008, 0.044, 0.04, 0.012, 0.002)] });
      // serrations front and rear: thin ridges proud of each flank
      [-1, 1].forEach((sd) => {
        for (let k = 0; k < 7; k++) K.box(0.0016, 0.03, 0.0024, sMat, sd * 0.0153, 0.034, 0.042 - k * 0.0052, { r: 0.0006, parent: slide });
        for (let k = 0; k < 4; k++) K.box(0.0016, 0.022, 0.0024, sMat, sd * 0.0153, 0.036, -0.122 - k * 0.0052, { r: 0.0006, parent: slide });
      });
      K.box(0.016, 0.009, 0.036, m.steel, 0, 0.049, -0.008, { r: 0.0015, parent: slide }); // barrel hood in the port
      K.lathe([[0.0045, 0], [0.0075, 0], [0.0075, 0.002], [0.0045, 0.002]], m.steel, 0.034, -0.156, { seg: 18, parent: slide }); // crown
      K.lathe([[0, 0], [0.0045, 0], [0.0045, 0.001]], m.dark, 0.034, -0.157, { seg: 18, parent: slide });
      // sights: rear notch with dots, front post with a tritium dot
      K.front([[-0.011, 0.056], [0.011, 0.056], [0.011, 0.065], [0.003, 0.065], [0.003, 0.06], [-0.003, 0.06], [-0.003, 0.065], [-0.011, 0.065]], 0.008, m.metal, 0.038, { r: 0.001, parent: slide });
      K.box(0.006, 0.009, 0.007, m.metal, 0, 0.061, -0.145, { r: 0.0015, parent: slide });
      K.box(0.0025, 0.0025, 0.002, m.glow, 0, 0.0625, -0.149, { r: 0, parent: slide });
      [-1, 1].forEach((sd) => K.box(0.0022, 0.0022, 0.002, m.glow, sd * 0.007, 0.0615, 0.0335, { r: 0, parent: slide }));
      K.box(0.006, 0.006, 0.012, m.steel, -0.0155, 0.004, -0.03, { r: 0.002 }); // slide stop
      if (id === 'mamba') { P.suppressor(-0.16, 0.034, { len: 0.15, r: 0.017 }); out.muzzle = [0.034, -0.315]; } else if (id === 'hornet') { P.brake(-0.158, 0.034, { len: 0.035, r: 0.011 }); out.muzzle = [0.034, -0.195]; } else out.muzzle = [0.034, -0.162];
      // magazine: steel body with a polymer base plate (extended on the hornet)
      mag.position.set(0, -0.004, 0.025);
      const ml = id === 'hornet' ? 0.16 : 0.118;
      K.side([[0.02, 0], [0.034, -ml + 0.004], [0.006, -ml + 0.004], [-0.012, 0]], 0.022, m.metal, { r: 0.003, bevel: 0.002, parent: mag });
      K.side([[0.038, -ml + 0.008], [0.04, -ml - 0.006, 0.004], [0.0, -ml - 0.006, 0.004], [0.002, -ml + 0.008]], 0.028, m.poly, { r: 0.003, bevel: 0.0025, parent: mag });
      break;
    }
    case 'smg': {
      if (id === 'viper') {
        // compact boxy SMG: tube receiver, ventilated barrel shroud, folding wire stock
        K.side([[0.07, 0.008], [0.07, 0.058, 0.01], [-0.21, 0.058, 0.008], [-0.22, 0.04, 0.008], [-0.21, 0.008]], 0.044, m.skin, { r: 0.004, bevel: 0.005, holes: [slot(-0.03, 0.04, 0.05, 0.012, 0.004)] });
        K.side([[0.06, 0.008], [0.06, -0.012, 0.008], [-0.045, -0.014], [-0.052, -0.05, 0.003], [-0.128, -0.05, 0.003], [-0.136, -0.012], [-0.2, -0.008], [-0.2, 0.008]], 0.04, m.poly, { r: 0.004, bevel: 0.0035 });
        const holes = []; for (let zz = -0.232; zz > -0.33; zz -= 0.022) holes.push(circle(zz, 0.036, 0.0055));
        K.side([[-0.215, 0.012], [-0.215, 0.058], [-0.34, 0.054], [-0.345, 0.016]], 0.036, m.metal, { r: 0.006, bevel: 0.009, seg: 3, holes }); // shroud
        P.barrel(-0.2, 0.17, 0.036, 0.0075);
        P.brake(-0.345, 0.036, { len: 0.03, r: 0.0105 });
        K.rail(0.06, -0.15, 0.058, m.metal);
        P.ironRear(0.04, 0.067); P.ironFront(-0.13, 0.067);
        K.box(0.012, 0.01, 0.02, m.metal, -0.025, 0.05, -0.08, { r: 0.003 }); // side cocking handle
        P.grip(m.poly);
        P.trigger(-0.008, -0.012);
        // wire stock folded alongside
        [[0.0, 0.03], [0.0, -0.01]].forEach(([x, y]) => K.box(0.006, 0.006, 0.26, m.steel, x - 0.026, y, 0.03, { r: 0.0025 }));
        K.box(0.006, 0.05, 0.006, m.steel, -0.026, 0.01, 0.16, { r: 0.0025 });
        mag.position.set(0, -0.03, -0.09);
        P.boxMag(mag, m.metal, { len: 0.16, d: 0.034, w: 0.022 });
        out.muzzle = [0.036, -0.38];
      } else {
        // modern SMG: sculpted upper with integrated handguard, side-folding stock, long suppressor
        const holes = [slot(-0.24, 0.022, 0.03, 0.008), slot(-0.285, 0.022, 0.03, 0.008)];
        K.side([[0.075, 0.016], [0.075, 0.052, 0.006], [0.05, 0.056], [-0.3, 0.054], [-0.33, 0.044, 0.01], [-0.33, 0.006, 0.006], [-0.17, 0.0, 0.03], [-0.15, 0.016]], 0.046, m.skin, { r: 0.004, bevel: 0.007, seg: 3, holes });
        K.side([[0.06, 0.018], [0.06, -0.01, 0.01], [-0.04, -0.016], [-0.048, -0.052, 0.003], [-0.122, -0.052, 0.003], [-0.13, -0.016], [-0.155, 0.002], [-0.155, 0.018]], 0.04, m.poly, { r: 0.004, bevel: 0.0035 });
        K.side([[0.035, 0.02], [0.035, 0.04], [-0.035, 0.04], [-0.035, 0.02]], 0.003, m.dark, { x: 0.0225, r: 0.003, bevel: 0.0008 }); // port
        K.rail(0.07, -0.29, 0.055, m.metal);
        P.holo(-0.03, 0.064);
        P.ironFront(-0.27, 0.064);
        P.suppressor(-0.33, 0.032, { len: 0.17, r: 0.018 });
        P.grip(m.poly);
        P.trigger(-0.008, -0.014);
        K.box(0.003, 0.006, 0.02, m.steel, -0.0225, 0.0, 0.02, { r: 0.0012 }).rotation.x = 0.4; // selector
        // folded stock along the left
        K.side([[0.075, 0.04], [0.33, 0.04, 0.01], [0.33, -0.05, 0.01], [0.3, -0.05], [0.12, 0.0], [0.075, 0.0]], 0.012, m.poly, { x: -0.03, r: 0.006, bevel: 0.004, holes: [slot(0.24, -0.005, 0.1, 0.022, 0.01)] });
        mag.position.set(0, -0.03, -0.088);
        P.curvedMag(mag, m.poly, { len: 0.15, curve: 0.6, w: 0.024 });
        out.muzzle = [0.032, -0.5];
      }
      break;
    }
    case 'shotgun': {
      const auto = id === 'tempest';
      // receiver with loading port, vent-ribbed barrel over a magazine tube, ribbed pump
      K.side([[0.07, 0.008], [0.07, 0.056, 0.012], [0.04, 0.064], [-0.17, 0.064], [-0.18, 0.05], [-0.18, -0.006], [-0.06, -0.012], [-0.0, -0.012]], 0.048, auto ? m.skin : m.metal, { r: 0.004, bevel: 0.004, holes: [slot(-0.04, 0.042, 0.06, 0.012, 0.004)] });
      K.side([[-0.02, -0.004], [-0.02, -0.014], [-0.15, -0.012], [-0.15, -0.002]], 0.05, m.dark, { r: 0.003, bevel: 0.002 }); // loading port lip
      P.barrel(-0.18, 0.56, 0.046, 0.0125);
      for (let zz = -0.2; zz > -0.72; zz -= 0.03) K.box(0.004, 0.006, 0.006, m.metal, 0, 0.062, zz, { r: 0.001 });
      K.box(0.01, 0.003, 0.54, m.metal, 0, 0.066, -0.45, { r: 0.001 }); // vent rib
      K.lathe([[0, 0], [0.0035, 0.0], [0.0035, 0.004], [0, 0.006]], m.glow, 0.07, -0.72, { seg: 10 }); // bead
      K.lathe([[0.012, 0], [0.012, 0.4], [0.011, 0.402], [0, 0.403]], m.metal, 0.012, -0.18, { seg: 24 }); // mag tube
      const pump = K.group(); out.slide = pump;
      if (!auto) {
        K.lathe([[0.016, 0], [0.024, 0.006], [0.024, 0.15], [0.016, 0.158]], m.poly, 0.016, -0.28, { seg: 28, parent: pump });
        for (let k = 0; k < 9; k++) K.lathe([[0.0252, 0], [0.0252, 0.006]], m.poly, 0.016, -0.292 - k * 0.015, { seg: 28, parent: pump });
        K.box(0.006, 0.006, 0.12, m.steel, 0.02, 0.028, -0.22, { r: 0.002, parent: pump }); // action bar
      } else {
        K.side([[-0.19, 0.0], [-0.19, 0.03], [-0.44, 0.03], [-0.45, 0.0, 0.01], [-0.44, -0.025, 0.015], [-0.2, -0.022]], 0.05, m.poly, { r: 0.006, bevel: 0.009, seg: 3, holes: [slot(-0.26, 0.006, 0.04, 0.01), slot(-0.32, 0.006, 0.04, 0.01), slot(-0.38, 0.006, 0.04, 0.01)] });
        K.rail(0.06, -0.17, 0.064, m.metal);
        P.holo(-0.05, 0.073);
      }
      P.grip(m.poly, { y: -0.01 });
      P.trigger(-0.008, -0.012, auto ? m.poly : m.metal);
      K.side([[0.07, 0.054], [0.3, 0.036, 0.01], [0.318, 0.03], [0.322, -0.09, 0.006], [0.304, -0.098], [0.26, -0.07, 0.02], [0.14, -0.02, 0.02], [0.07, -0.004]], 0.044, m.skin, { r: 0.008, bevel: 0.007, seg: 3, holes: auto ? [slot(0.22, -0.02, 0.07, 0.02, 0.01)] : [] });
      K.side([[0.32, 0.034], [0.336, 0.034], [0.338, -0.094], [0.32, -0.1]], 0.046, m.rubber, { r: 0.006, bevel: 0.004 });
      mag.position.set(0, -0.012, -0.11);
      if (auto) {
        // drum magazine
        const d = new THREE.Group(); d.position.set(0, -0.08, 0); mag.add(d);
        K.lathe([[0.0, -0.032], [0.065, -0.032], [0.07, -0.026], [0.07, 0.026], [0.065, 0.032], [0, 0.032]].map(([r, h]) => [r, h]), m.skin, 0, 0, { seg: 40, parent: d }).rotation.y = Math.PI / 2;
        K.cyl(0.03, 0.03, 0.074, m.metal, 0, 0, 0, { rz: Math.PI / 2, seg: 30, parent: d });
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; K.box(0.076, 0.006, 0.012, m.poly, 0, Math.sin(a) * 0.062, Math.cos(a) * 0.062, { r: 0.002, parent: d }).rotation.x = -a; }
        K.side([[0.02, 0.01], [0.02, -0.03], [-0.02, -0.03], [-0.02, 0.01]], 0.034, m.poly, { parent: mag });
      } else {
        K.cyl(0.011, 0.011, 0.03, m.brass, 0, 0.0, 0, { rx: Math.PI / 2, seg: 14, parent: mag }); // shell in the port
      }
      out.muzzle = [0.046, -0.745];
      break;
    }
    case 'sniper': {
      const heavy = id === 'longbow';
      if (heavy) {
        // chassis rifle: machined chassis with lightening cuts, long slotted forend, fluted heavy barrel,
        // big three-port brake, folding bipod, adjustable stock with cheek riser and monopod
        K.side([[0.09, 0.012], [0.09, 0.048], [-0.12, 0.048], [-0.13, 0.04], [-0.13, -0.004], [-0.05, -0.02], [0.0, -0.016]], 0.05, m.skin, { r: 0.004, bevel: 0.004, holes: [slot(-0.08, 0.016, 0.05, 0.012, 0.005)] });
        K.lathe([[0.0, 0], [0.019, 0.0], [0.021, 0.004], [0.021, 0.2], [0.019, 0.204], [0, 0.204]], m.metal, by + 0.016, 0.09, { seg: 30 }); // action
        K.cyl(0.004, 0.004, 0.055, m.steel, 0.03, by + 0.012, 0.05, { rz: Math.PI / 2 + 0.25, seg: 10 }); // bolt handle
        K.add(new THREE.SphereGeometry(0.009, 16, 12), m.poly).position.set(0.057, by + 0.005, 0.05);
        const hg = []; for (let zz = -0.17; zz > -0.5; zz -= 0.05) hg.push(slot(zz, 0.03, 0.03, 0.01));
        K.side([[-0.13, 0.006], [-0.13, 0.058], [-0.52, 0.058], [-0.52, 0.006]], 0.056, m.skin, { r: 0.004, bevel: 0.01, seg: 3, holes: hg });
        K.rail(0.08, -0.5, 0.058, m.metal);
        K.lathe([[0.0, 0], [0.017, 0], [0.017, 0.58], [0.0, 0.58]], m.metal, by + 0.016, -0.13, { seg: 28 });
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; K.box(0.003, 0.003, 0.22, m.dark, Math.cos(a) * 0.0165, by + 0.016 + Math.sin(a) * 0.0165, -0.64, { r: 0.001 }).rotation.z = a; } // flutes
        P.brake(-0.71, by + 0.016, { len: 0.1, r: 0.024 });
        P.scope(-0.12, 0.068, 0.36, 0.03);
        // bipod folded under the forend
        K.box(0.03, 0.02, 0.03, m.metal, 0, -0.006, -0.48, { r: 0.004 });
        [-1, 1].forEach((sd) => { K.lathe([[0.006, 0], [0.006, 0.2], [0.005, 0.2]], m.metal, -0.012, -0.47, { x: sd * 0.012, seg: 12 }); K.add(new THREE.SphereGeometry(0.008, 10, 8), m.rubber).position.set(sd * 0.012, -0.012, -0.27); });
        // stock
        K.lathe([[0.016, 0], [0.016, -0.1]], m.metal, by + 0.004, 0.09, { seg: 20 });
        K.side([[0.17, by + 0.03], [0.42, by + 0.03], [0.432, by + 0.02], [0.436, -0.09], [0.416, -0.098], [0.36, -0.066], [0.24, -0.03, 0.02], [0.17, -0.02]], 0.04, m.poly, { r: 0.008, bevel: 0.006, seg: 3, holes: [slot(0.3, -0.015, 0.1, 0.03, 0.012)] });
        K.side([[0.22, by + 0.03], [0.22, by + 0.05, 0.008], [0.38, by + 0.05, 0.008], [0.38, by + 0.03]], 0.038, m.skin, { r: 0.006, bevel: 0.006 }); // cheek riser
        K.side([[0.43, by + 0.032], [0.448, by + 0.032], [0.45, -0.096], [0.434, -0.1]], 0.044, m.rubber, { r: 0.006 });
        K.cyl(0.006, 0.006, 0.07, m.metal, 0, -0.07, 0.4, { seg: 12 }); // monopod
        P.grip(m.poly, { len: 0.11 });
        P.trigger(-0.01, -0.012, m.metal);
        mag.position.set(0, -0.016, -0.085);
        P.boxMag(mag, m.metal, { len: 0.09, d: 0.07, w: 0.03 });
        out.muzzle = [by + 0.016, -0.815];
      } else {
        // hunting-style bolt rifle: one-piece stock with a pistol grip, round action, slim barrel, scope
        K.side([[0.42, by + 0.012], [0.43, by + 0.002], [0.432, -0.094, 0.01], [0.41, -0.1], [0.26, -0.04, 0.03], [0.1, -0.02, 0.01], [0.05, -0.005], [0.06, -0.06, 0.012], [0.048, -0.116, 0.008], [0.016, -0.114, 0.01], [0.012, -0.07, 0.02], [-0.02, -0.022, 0.01], [-0.38, -0.004, 0.02], [-0.42, 0.01, 0.01], [-0.42, 0.03], [-0.12, 0.034], [0.06, 0.034], [0.12, by + 0.012, 0.03]], 0.046, m.skin, { r: 0.006, bevel: 0.008, seg: 3, holes: [slot(-0.01, -0.012, 0.05, 0.018, 0.008)] });
        K.side([[0.442, by + 0.014], [0.442, -0.096], [0.432, -0.1], [0.432, by + 0.014]], 0.048, m.rubber, { r: 0.004 });
        K.lathe([[0.0, 0], [0.016, 0], [0.017, 0.004], [0.017, 0.22], [0.015, 0.226], [0, 0.226]], m.metal, by + 0.01, 0.1, { seg: 28 });
        K.lathe([[0.0, 0], [0.012, 0], [0.012, 0.025], [0.0105, 0.03], [0.0085, 0.6], [0.0075, 0.6], [0, 0.6]], m.metal, by + 0.01, -0.125, { seg: 24 });
        K.cyl(0.0035, 0.0035, 0.05, m.steel, 0.03, by + 0.006, 0.06, { rz: Math.PI / 2 + 0.35, seg: 10 }); // bolt handle
        K.add(new THREE.SphereGeometry(0.008, 14, 10), m.steel).position.set(0.054, by - 0.003, 0.06);
        K.lathe([[0.0, 0], [0.012, 0], [0.012, 0.03]].map(([r, h]) => [r, -h]), m.steel, by + 0.01, 0.1, { seg: 20 }); // bolt shroud
        P.trigger(-0.003, -0.003, m.steel);
        P.scope(-0.04, by + 0.005, 0.3, 0.024);
        K.add(new THREE.TorusGeometry(0.007, 0.002, 6, 14), m.steel).position.set(0, -0.012, -0.3);
        mag.position.set(0, -0.01, -0.07);
        P.boxMag(mag, m.metal, { len: 0.04, d: 0.06, w: 0.026 });
        out.muzzle = [by + 0.01, -0.73];
      }
      break;
    }
    case 'heavy': {
      // light machine gun: receiver with a hinged feed cover, slotted heat shield, carry handle, bipod, box mag
      K.side([[0.09, 0.0], [0.09, 0.07, 0.01], [-0.2, 0.07], [-0.21, 0.05], [-0.21, -0.02], [-0.06, -0.026], [0.0, -0.022]], 0.07, m.skin, { r: 0.005, bevel: 0.006, holes: [slot(-0.03, 0.03, 0.06, 0.016, 0.004)] });
      K.side([[0.06, 0.07], [0.06, 0.084, 0.01], [-0.17, 0.084, 0.01], [-0.18, 0.07]], 0.066, m.metal, { r: 0.004, bevel: 0.004 }); // feed cover
      K.rail(0.05, -0.16, 0.084, m.metal);
      K.cyl(0.006, 0.006, 0.074, m.steel, 0, 0.074, 0.06, { rz: Math.PI / 2, seg: 12 }); // hinge
      const hs = []; for (let zz = -0.24; zz > -0.52; zz -= 0.035) hs.push(circle(zz, 0.04, 0.008));
      K.side([[-0.21, 0.012], [-0.21, 0.068], [-0.54, 0.064], [-0.55, 0.016]], 0.054, m.metal, { r: 0.008, bevel: 0.012, seg: 3, holes: hs });
      P.barrel(-0.2, 0.42, 0.04, 0.0115);
      P.brake(-0.62, 0.04, { len: 0.06, r: 0.015 });
      K.side([[-0.22, 0.068], [-0.24, 0.1, 0.01], [-0.36, 0.1, 0.01], [-0.38, 0.068]], 0.012, m.metal, { r: 0.004, bevel: 0.003, holes: [slot(-0.3, 0.084, 0.09, 0.016, 0.008)] }); // carry handle
      P.holo(-0.06, 0.093);
      P.grip(m.poly, { y: -0.02 });
      P.trigger(-0.008, -0.022);
      // vertical foregrip (where the support hand goes)
      K.side([[-0.245, -0.0], [-0.248, -0.1, 0.008], [-0.285, -0.1, 0.008], [-0.284, -0.0]], 0.032, m.poly, { r: 0.006, bevel: 0.007, seg: 3 });
      // bipod
      K.box(0.03, 0.02, 0.03, m.metal, 0, 0.008, -0.5, { r: 0.004 });
      [-1, 1].forEach((sd) => K.lathe([[0.006, 0], [0.006, 0.17]], m.metal, 0.0, -0.5, { x: sd * 0.014, seg: 12 }).rotation.z = 0);
      // skeleton stock
      K.side([[0.09, 0.06], [0.33, 0.05, 0.01], [0.34, -0.08, 0.008], [0.31, -0.09], [0.12, -0.02], [0.09, -0.016]], 0.05, m.poly, { r: 0.008, bevel: 0.006, seg: 3, holes: [slot(0.21, 0.02, 0.15, 0.03, 0.012), slot(0.28, -0.04, 0.06, 0.03, 0.012)] });
      K.side([[0.335, 0.052], [0.35, 0.052], [0.352, -0.084], [0.336, -0.09]], 0.052, m.rubber, { r: 0.006 });
      K.box(0.012, 0.006, 0.2, m.glow, 0.036, 0.03, -0.1, { r: 0.002 });
      mag.position.set(0, -0.026, -0.13);
      P.boxMag(mag, m.skin, { len: 0.1, d: 0.13, w: 0.1 });
      K.box(0.06, 0.012, 0.03, m.metal, -0.05, -0.03, 0, { r: 0.002, parent: mag }); // belt feed
      out.muzzle = [0.04, -0.68];
      break;
    }
    default: { // rifles
      if (id === 'falcon') {
        // classic long-stroke rifle: stamped receiver with a ribbed dust cover, gas tube over the barrel,
        // two-piece furniture, front sight tower, slant brake, deep-curved ribbed magazine
        K.side([[0.075, -0.01], [0.075, 0.048, 0.01], [-0.2, 0.048, 0.004], [-0.2, -0.01], [-0.16, -0.026], [-0.06, -0.026], [0.0, -0.022]], 0.046, m.metal, { r: 0.003, bevel: 0.003 });
        K.side([[0.075, 0.046], [0.07, 0.06, 0.012], [-0.19, 0.056, 0.012], [-0.2, 0.046]], 0.044, m.metal, { r: 0.003, bevel: 0.006, seg: 3 }); // dust cover
        K.side([[-0.04, 0.03], [-0.04, 0.044], [0.02, 0.044], [0.02, 0.03]], 0.004, m.steel, { x: 0.024, r: 0.002, bevel: 0.001 }); // charging handle slide
        K.add(new THREE.SphereGeometry(0.006, 10, 8), m.steel).position.set(0.03, 0.037, 0.02);
        K.side([[0.04, 0.0], [0.04, 0.016], [-0.06, 0.016], [-0.06, 0.0]], 0.003, m.metal, { x: 0.024, r: 0.002, bevel: 0.0008 }); // safety lever
        K.side([[-0.2, 0.04], [-0.2, 0.068, 0.008], [-0.35, 0.064, 0.012], [-0.35, 0.04]], 0.034, m.skin, { r: 0.004, bevel: 0.008, seg: 3 }); // upper handguard
        K.side([[-0.2, 0.034], [-0.21, -0.002, 0.01], [-0.36, 0.004, 0.012], [-0.36, 0.034]], 0.05, m.skin, { r: 0.004, bevel: 0.01, seg: 3 }); // lower handguard
        P.barrel(-0.2, 0.32, 0.03, 0.009);
        K.lathe([[0.0065, 0], [0.0065, 0.2]], m.metal, 0.056, -0.35, { seg: 14 });
        K.side([[-0.46, 0.022], [-0.46, 0.072], [-0.475, 0.08], [-0.49, 0.072], [-0.49, 0.022]], 0.024, m.metal, { r: 0.004, bevel: 0.004, holes: [slot(-0.475, 0.07, 0.008, 0.012, 0.003)] }); // front sight tower
        K.box(0.0025, 0.012, 0.0025, m.metal, 0, 0.072, -0.475, { r: 0.0005 });
        K.side([[-0.52, 0.02], [-0.52, 0.042], [-0.565, 0.038], [-0.565, 0.026]], 0.022, m.metal, { r: 0.005, bevel: 0.006, holes: [slot(-0.54, 0.035, 0.012, 0.006, 0.003)] }); // slant brake
        K.side([[0.005, 0.048], [0.005, 0.062], [-0.03, 0.06], [-0.03, 0.048]], 0.018, m.metal, { r: 0.003, bevel: 0.002 }); // rear sight block
        P.grip(m.skin, { y: -0.016 });
        P.trigger(-0.008, -0.018, m.metal);
        K.side([[0.075, 0.046], [0.3, 0.03, 0.01], [0.325, 0.026], [0.33, -0.085, 0.006], [0.31, -0.095], [0.18, -0.03, 0.02], [0.075, -0.01]], 0.042, m.skin, { r: 0.008, bevel: 0.008, seg: 3 });
        K.side([[0.326, 0.028], [0.338, 0.028], [0.34, -0.088], [0.328, -0.092]], 0.044, m.metal, { r: 0.004 }); // butt plate
        K.box(0.003, 0.004, 0.08, m.glow, 0.0235, 0.004, -0.1, { r: 0.001 });
        mag.position.set(0, -0.026, -0.11);
        P.curvedMag(mag, m.metal, { len: 0.18, curve: 1.35, w: 0.028 });
        out.muzzle = [0.03, -0.565];
        break;
      }
      const L = id === 'sentinel' ? 0.15 : 0.12;
      const f = P.receiver(L);
      const hgLen = id === 'raptor' ? 0.25 : id === 'sentinel' ? 0.3 : id === 'ranger' ? 0.24 : 0.24;
      P.handguard(f, hgLen, { y: 0.028, h: 0.054 });
      const bl = id === 'sentinel' ? hgLen + 0.14 : hgLen + 0.05;
      P.barrel(f, bl, by, 0.0085);
      let tip = f - bl;
      if (id === 'raptor') { P.suppressor(tip + 0.005, by, { len: 0.17, r: 0.019 }); tip -= 0.165; } else { P.brake(tip + 0.004, by, { len: 0.05, r: 0.0115 }); tip -= 0.046; }
      P.grip(m.poly);
      P.trigger();
      if (id === 'sentinel') {
        // precision stock with a cheek riser instead of the collapsible one
        K.lathe([[0.0145, 0], [0.0145, -0.08]], m.metal, by, 0.075, { seg: 22 });
        K.side([[0.12, by + 0.02], [0.17, by + 0.04, 0.01], [0.31, by + 0.04, 0.01], [0.33, by + 0.024], [0.334, -0.09, 0.006], [0.312, -0.098], [0.25, -0.06, 0.02], [0.17, -0.03], [0.12, -0.016]], 0.044, m.skin, { r: 0.008, bevel: 0.007, seg: 3, holes: [slot(0.22, -0.01, 0.07, 0.022, 0.01)] });
        K.side([[0.33, by + 0.026], [0.346, by + 0.026], [0.348, -0.094], [0.332, -0.1]], 0.046, m.rubber, { r: 0.006 });
        P.scope(-0.06, 0.0585, 0.26, 0.022);
      } else if (id === 'marshal') {
        P.stock(by, m.skin);
        P.scope(-0.05, 0.0585, 0.24, 0.02);
      } else {
        P.stock(by, id === 'ranger' ? m.skin : m.poly);
        if (id === 'ranger') { P.holo(-0.02, 0.0585); P.ironFront(f - hgLen + 0.03, 0.0585); } else { P.holo(-0.03, 0.0585); P.ironRear(0.05, 0.0585); P.ironFront(f - hgLen + 0.03, 0.0585); }
      }
      K.box(0.004, 0.005, 0.12, m.glow, 0.0235, 0.008, -0.05, { r: 0.0015 }); // accent light on the lower
      mag.position.set(0, -0.03, -0.112);
      if (id === 'sentinel' || id === 'marshal') P.boxMag(mag, m.metal, { len: 0.1, d: 0.05, w: 0.026 });
      else P.curvedMag(mag, id === 'raptor' ? m.poly : m.metal, { len: 0.17, curve: 0.75, w: 0.026 });
      out.muzzle = [by, tip];
      break;
    }
  }
  return out;
}
