// Core Breach movement: a capsule (circle + height) walking on the level's height grid.
// Shared by the local player, remote prediction and bots, so everyone moves by the same rules.
import { MOVE, clamp } from './data.js';

// body: { p: [x, y, z] (feet), v: [vx, vy, vz], yaw, crouch (0..1), ground (bool) }
// input: { f (-1..1 forward), s (-1..1 right), jump, crouch, walk }, speedMul
export function moveBody(level, body, input, dt, speedMul = 1) {
  const p = body.p;
  const v = body.v;
  const r = MOVE.radius;
  // crouch blends in
  const wantC = input.crouch ? 1 : 0;
  body.crouch += clamp(wantC - body.crouch, -dt * 8, dt * 8);
  // wish direction in world space
  const sy = Math.sin(body.yaw);
  const cyw = Math.cos(body.yaw);
  // forward is (-sin yaw, -cos yaw): yaw 0 looks toward -z
  let wx = -sy * (input.f || 0) + cyw * (input.s || 0);
  let wz = -cyw * (input.f || 0) - sy * (input.s || 0);
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }
  let maxSp = input.walk ? MOVE.walk : MOVE.run;
  if (body.crouch > 0.5) maxSp = MOVE.crouch;
  maxSp *= speedMul;
  if (body.ground) {
    // ground friction then acceleration toward the wish velocity
    const sp = Math.hypot(v[0], v[2]);
    if (sp > 0) {
      const drop = sp * MOVE.friction * dt;
      const k = Math.max(0, sp - drop) / sp;
      v[0] *= k; v[2] *= k;
    }
    accelerate(v, wx, wz, maxSp * Math.min(1, Math.hypot(wx, wz)), MOVE.accel, dt);
    if (input.jump && body.crouch < 0.5) { v[1] = MOVE.jump; body.ground = false; body.jumped = true; }
  } else {
    accelerate(v, wx, wz, maxSp * Math.min(1, Math.hypot(wx, wz)), MOVE.airAccel, dt);
  }
  // horizontal movement in small steps, one axis at a time
  const dist = Math.hypot(v[0], v[2]) * dt;
  const steps = Math.max(1, Math.ceil(dist / 0.2));
  const step = body.ground ? MOVE.step : 0.02;
  for (let n = 0; n < steps; n++) {
    for (let a = 0; a < 3; a += 2) {
      const d = (v[a] * dt) / steps;
      if (!d) continue;
      const nx = a === 0 ? p[0] + d : p[0];
      const nz = a === 2 ? p[2] + d : p[2];
      const top = maxTop(level, nx, nz, r);
      if (top > p[1] + step + 1e-3) {
        v[a] = 0; // blocked by a wall or a ledge too tall to step on
      } else {
        p[0] = nx; p[2] = nz;
        if (top > p[1] && body.ground) p[1] = top; // step up
      }
    }
  }
  // vertical
  const g = maxTop(level, p[0], p[2], r * 0.9);
  if (!body.ground) {
    v[1] -= MOVE.gravity * dt;
    p[1] += v[1] * dt;
    if (p[1] <= g) {
      body.landSpeed = -v[1];
      p[1] = g; v[1] = 0; body.ground = true;
    }
  } else if (p[1] - g > MOVE.step + 0.05) {
    body.ground = false; // walked off a ledge
    v[1] = 0;
  } else if (p[1] > g) {
    p[1] = Math.max(g, p[1] - 6 * dt); // walking down steps
  } else p[1] = g;
  body.height = lerpH(body.crouch);
}

function accelerate(v, wx, wz, wishSp, accel, dt) {
  const wl = Math.hypot(wx, wz);
  if (wl < 1e-6 || wishSp <= 0) return;
  const dx = wx / wl; const dz = wz / wl;
  const cur = v[0] * dx + v[2] * dz;
  const add = wishSp - cur;
  if (add <= 0) return;
  const a = Math.min(add, accel * wishSp * dt);
  v[0] += a * dx; v[2] += a * dz;
}

function maxTop(level, x, z, r) {
  let t = -99;
  for (const [dx, dz] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, -r], [0, r], [-r, 0], [r, 0], [0, 0]]) {
    const h = level.topAt(x + dx, z + dz);
    if (h > t) t = h;
  }
  return t;
}

const lerpH = (c) => MOVE.height + (MOVE.crouchHeight - MOVE.height) * c;
export const eyeHeight = (c) => MOVE.eye + (MOVE.crouchEye - MOVE.eye) * c;

// push two bodies apart (circle vs circle) if they overlap at similar heights
export function separate(a, b) {
  const dx = b.p[0] - a.p[0];
  const dz = b.p[2] - a.p[2];
  const d = Math.hypot(dx, dz);
  const R = MOVE.radius * 2;
  if (d >= R || Math.abs(a.p[1] - b.p[1]) > 1.5) return;
  const nx = d > 1e-4 ? dx / d : 1;
  const nz = d > 1e-4 ? dz / d : 0;
  const pen = (R - d) / 2;
  a.p[0] -= nx * pen; a.p[2] -= nz * pen;
  b.p[0] += nx * pen; b.p[2] += nz * pen;
}
