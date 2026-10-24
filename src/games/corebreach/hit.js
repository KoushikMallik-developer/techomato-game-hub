// Core Breach hit tests: bullets against players (head sphere, body and leg capsules) and the level.
import { eyeHeight } from './sim.js';

// hitboxes for a player standing at feet p with crouch c (0..1)
export function hitboxes(p, c) {
  const eye = eyeHeight(c);
  const hipY = 0.92 - c * 0.38;
  return {
    head: { x: p[0], y: p[1] + eye + 0.05, z: p[2], r: 0.17 },
    body: { x: p[0], z: p[2], y0: p[1] + hipY - 0.05, y1: p[1] + eye - 0.2, r: 0.3 },
    legs: { x: p[0], z: p[2], y0: p[1], y1: p[1] + hipY, r: 0.24 },
  };
}

function raySphere(o, d, s, maxT) {
  const ox = o[0] - s.x; const oy = o[1] - s.y; const oz = o[2] - s.z;
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const c = ox * ox + oy * oy + oz * oz - s.r * s.r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= maxT ? t : -1;
}

// vertical cylinder from y0 to y1
function rayCyl(o, d, cy, maxT) {
  const ox = o[0] - cy.x; const oz = o[2] - cy.z;
  const a = d[0] * d[0] + d[2] * d[2];
  if (a < 1e-9) return -1;
  const b = ox * d[0] + oz * d[2];
  const c = ox * ox + oz * oz - cy.r * cy.r;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / a, (-b + sq) / a]) {
    if (t < 0 || t > maxT) continue;
    const y = o[1] + d[1] * t;
    if (y >= cy.y0 && y <= cy.y1) return t;
  }
  return -1;
}

// first player part hit by a ray: { t, part (0 head, 1 body, 2 legs) } or null
export function rayPlayer(o, d, p, c, maxT) {
  const hb = hitboxes(p, c);
  // quick reject: distance from the ray to the player's axis
  const vx = p[0] - o[0]; const vz = p[2] - o[2];
  const along = vx * d[0] + vz * d[2];
  if (along < -1) return null;
  let best = null;
  const th = raySphere(o, d, hb.head, maxT);
  if (th >= 0) best = { t: th, part: 0 };
  const tb = rayCyl(o, d, hb.body, maxT);
  if (tb >= 0 && (!best || tb < best.t - 0.02)) best = { t: tb, part: 1 };
  const tl = rayCyl(o, d, hb.legs, maxT);
  if (tl >= 0 && (!best || tl < best.t - 0.02)) best = { t: tl, part: 2 };
  return best;
}

// ray vs a sphere-shaped smoke: true if the segment passes through it
export function segThroughSphere(a, b, s) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1]; const dz = b[2] - a[2];
  const L2 = dx * dx + dy * dy + dz * dz || 1;
  let t = ((s.x - a[0]) * dx + (s.y - a[1]) * dy + (s.z - a[2]) * dz) / L2;
  t = Math.max(0, Math.min(1, t));
  const px = a[0] + dx * t - s.x; const py = a[1] + dy * t - s.y; const pz = a[2] + dz * t - s.z;
  return px * px + py * py + pz * pz < s.r * s.r;
}

// spread: random direction inside a cone of `deg` degrees around d (yaw/pitch basis)
export function spreadDir(d, deg, rnd = Math.random) {
  if (deg <= 0) return d;
  const a = rnd() * Math.PI * 2;
  const r = Math.sqrt(rnd()) * Math.tan((deg * Math.PI) / 180);
  // build a basis around d
  const up = Math.abs(d[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  let ux = up[1] * d[2] - up[2] * d[1]; let uy = up[2] * d[0] - up[0] * d[2]; let uz = up[0] * d[1] - up[1] * d[0];
  const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
  const vx = d[1] * uz - d[2] * uy; const vy = d[2] * ux - d[0] * uz; const vz = d[0] * uy - d[1] * ux;
  const x = d[0] + (ux * Math.cos(a) + vx * Math.sin(a)) * r;
  const y = d[1] + (uy * Math.cos(a) + vy * Math.sin(a)) * r;
  const z = d[2] + (uz * Math.cos(a) + vz * Math.sin(a)) * r;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

// look direction from yaw/pitch (yaw 0 = toward -z, pitch + = up)
export function dirFrom(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}
