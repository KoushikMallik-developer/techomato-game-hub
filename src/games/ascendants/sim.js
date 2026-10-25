// Ascendants movement: one function moves any body (your hero, a bot, a remote player's prediction).
// Modes: 'ship' (riding the dropship), 'fall' (skydiving), 'glide', 'ground' (incl. jumping and falling),
// 'swim', 'fly' (free flight for everyone: double-tap jump). Forced motion (rushes, dashes, knockback),
// tumbling after a heavy hit, standing still while charging ki or firing a beam, and status effects
// (root, frozen, held, downed) are applied here too, so every client moves bodies the same way.
import { MOVE, clamp, damp } from './data.js';

// input: { mx, mz (-1..1, relative to yaw; +mz forward), yaw, pitch, jump (pressed this step), hold (jump held),
//          sprint (or flight boost), down (descend while flying), flyToggle (double-tapped jump) }
export function stepBody(b, inp, dt, island) {
  const v = b.v;
  const p = b.p;
  const fz = b.frozen > 0 || b.root > 0 || b.held > 0;
  const planted = b.charging || b.stance > 0;
  const speedMul = (b.speedMul || 1) * (b.slow > 0 ? 1 - (b.slowAmt || 0.4) : 1);
  const cy = Math.cos(inp.yaw); const sy = Math.sin(inp.yaw);
  // wish direction in world space (forward is -z at yaw 0)
  let wx = -sy * inp.mz + cy * inp.mx; let wz = -cy * inp.mz - sy * inp.mx; // eslint-disable-line prefer-const
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }
  if (fz) { wx = 0; wz = 0; }
  b.jumpBuf = Math.max(0, (b.jumpBuf || 0) - dt);
  if (inp.jump) b.jumpBuf = 0.15;

  if (b.mode === 'ship') return; // carried by the dropship (match moves it)
  if (b.tumble > 0) { b.tumble -= dt; v[1] -= MOVE.gravity * 0.55 * dt; const k = Math.exp(-0.6 * dt); v[0] *= k; v[2] *= k; move(b, dt, island, false); if (b.ground && b.tumble < 0.6) { b.tumble = 0; } return; }
  if (planted) { wx = 0; wz = 0; }
  if (b.held > 0) { v[0] = 0; v[1] = 0; v[2] = 0; return; }

  // forced motion: dash / grapple / blink travel / dive
  if (b.force && b.force.t > 0) {
    b.force.t -= dt;
    v[0] = b.force.v[0]; v[1] = b.force.v[1]; v[2] = b.force.v[2];
    move(b, dt, island, true);
    if (b.force.t <= 0) { b.force = null; v[0] *= 0.35; v[2] *= 0.35; if (v[1] > 0) v[1] *= 0.3; }
    return;
  }

  const ground = island.floor(p[0], p[2], p[1] + 0.05);
  const inWater = ground < -0.6 && p[1] < 0.15;

  if (b.mode === 'fall' || b.mode === 'glide') {
    // skydiving: steer hard, dive faster when pushing forward; the glider opens near the ground
    const glide = b.mode === 'glide';
    const air = glide ? MOVE.glideSpeed : 22;
    v[0] = damp(v[0], wx * air * (glide ? 1 : 1.1), glide ? 2.2 : 1.5, dt);
    v[2] = damp(v[2], wz * air * (glide ? 1 : 1.1), glide ? 2.2 : 1.5, dt);
    const sink = glide ? MOVE.glideFall + (inp.mz > 0.5 ? 2.5 : 0) : 28 + (inp.mz > 0.5 ? 18 : 0);
    v[1] = damp(v[1], -sink, glide ? 3 : 1.2, dt);
    if (!glide && p[1] - ground < (b.deployAt || 70)) b.mode = 'glide';
    if (inp.flyToggle && !b.downed) { b.mode = 'fly'; b.skydive = false; return; }
    if (b.mode === 'glide' && b.skydive === false && !inp.hold && p[1] - ground > 2) { b.mode = 'ground'; } // released a hop-glide
    move(b, dt, island, false);
    if (b.ground) { b.mode = 'ground'; b.skydive = false; }
    return;
  }

  // toggling flight (double-tap jump): from the ground you leap into the air
  if (inp.flyToggle && !fz && !b.downed) {
    if (b.mode === 'fly') { b.mode = 'ground'; } else { b.mode = 'fly'; if (b.ground) v[1] = 9; b.ground = false; }
  }
  if (b.downed && b.mode === 'fly') b.mode = 'ground';
  if (b.mode === 'fly') {
    // free flight: move where you look, Space climbs, Ctrl/Z dives, Shift boosts (and after a moment
    // of boosting, breaks into a supersonic dash); touching down while descending lands you
    const boost = inp.sprint && (b.ki ?? 100) > 1 && !planted;
    b.boostT = boost ? (b.boostT || 0) + dt : 0;
    const top = MOVE.flyBoost + (MOVE.superDash - MOVE.flyBoost) * clamp((b.boostT - 0.7) / 0.6, 0, 1);
    const sp = (boost ? top : MOVE.fly) * speedMul * (planted ? 0 : 1);
    const cp = Math.cos(inp.pitch || 0); const spch = Math.sin(inp.pitch || 0);
    const fwd = fz ? 0 : inp.mz;
    const mx = fz ? 0 : inp.mx;
    const tx = (-sy * cp * fwd + cy * mx) * sp; const tz = (-cy * cp * fwd - sy * mx) * sp;
    const ty = ((fwd > 0 ? spch * fwd : 0) + (inp.hold ? 1 : 0) - (inp.down ? 1 : 0)) * sp * 0.85;
    const k = boost ? 3 : planted ? 8 : 5;
    v[0] = damp(v[0], tx, k, dt); v[1] = damp(v[1], fz ? 0 : ty, k, dt); v[2] = damp(v[2], tz, k, dt);
    b.boosting = boost && Math.hypot(v[0], v[1], v[2]) > MOVE.fly * 1.2;
    move(b, dt, island, false);
    if (b.ground && (inp.down || v[1] < -2)) { b.mode = 'ground'; b.boostT = 0; } else b.ground = false;
    return;
  }
  b.boosting = false; b.boostT = 0;

  if (inWater) {
    b.mode = 'swim';
    const sp = MOVE.swim * speedMul;
    v[0] = damp(v[0], wx * sp, 4, dt); v[2] = damp(v[2], wz * sp, 4, dt);
    v[1] = damp(v[1], (-0.9 - p[1]) * 3, 4, dt); // float with the head above water
    if (b.jumpBuf > 0 && ground > -1.6) { v[1] = MOVE.jump * 0.8; b.jumpBuf = 0; }
    move(b, dt, island, false);
    if (!(island.floor(p[0], p[2], p[1] + 0.05) < -0.6 && p[1] < 0.15)) b.mode = 'ground';
    return;
  }
  if (b.mode === 'swim') b.mode = 'ground';

  // on foot
  b.stamina = clamp((b.stamina ?? MOVE.stamina) + (inp.sprint && wl > 0.1 && b.ground ? -dt : dt * 0.7), 0, MOVE.stamina);
  const sprint = inp.sprint && (b.stamina > 0.2) && inp.mz > 0.1;
  const top = (sprint ? MOVE.sprint : MOVE.run) * speedMul;
  const acc = b.ground ? 12 : 2.2;
  v[0] = damp(v[0], wx * top, acc, dt);
  v[2] = damp(v[2], wz * top, acc, dt);
  if (b.ground && b.jumpBuf > 0 && !fz && !planted && !b.downed) { v[1] = MOVE.jump; b.ground = false; b.jumpBuf = 0; b.coyote = 0; b.jumps = 1; }
  v[1] -= MOVE.gravity * dt;
  move(b, dt, island, false);
}

// integrate velocity with collision; sets b.ground
function move(b, dt, island, forced) {
  const p = b.p; const v = b.v;
  const steps = Math.max(1, Math.ceil(Math.hypot(v[0], v[1], v[2]) * dt / 0.6));
  const h = dt / steps;
  b.ground = false;
  for (let k = 0; k < steps; k++) {
    p[0] += v[0] * h; p[2] += v[2] * h;
    const hit = island.collide(p, b.radius || 0.42, b.height || 1.85);
    if (hit && forced && b.force) b.force.blocked = (b.force.blocked || 0) + 1;
    p[1] += v[1] * h;
    const g = island.floor(p[0], p[2], p[1]);
    if (p[1] <= g) {
      if (p[1] < g - 0.7 && v[1] <= 0 && g - p[1] < 2.2) { p[1] = g; } // step up / was pushed under a ledge
      p[1] = g;
      if (v[1] < 0) v[1] = 0;
      b.ground = true; b.jumps = 0;
    } else if (p[1] - g < 0.08 && v[1] <= 0) { p[1] = g; b.ground = true; b.jumps = 0; }
  }
  // world bounds
  const L = 690;
  p[0] = clamp(p[0], -L, L); p[2] = clamp(p[2], -L, L);
  if (p[1] > 420) { p[1] = 420; if (v[1] > 0) v[1] = 0; }
}

// eye/camera pivot height above the feet
export const eyeY = () => 1.65;
// aim direction from yaw/pitch
export function dirOf(yaw, pitch) {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}
