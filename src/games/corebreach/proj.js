// Thrown utility (grenades, darts): the same ballistic path is simulated by the host (for gameplay)
// and by every client (for visuals), so they land in the same place.
const G = 16;

// p, v: [x, y, z]; returns { p, v, landed } after dt
export function stepProjectile(level, pr, dt) {
  if (pr.landed) return pr;
  const sub = 4;
  for (let n = 0; n < sub; n++) {
    const h = dt / sub;
    pr.v[1] -= G * h * (pr.gravity ?? 1);
    const d = [pr.v[0] * h, pr.v[1] * h, pr.v[2] * h];
    const L = Math.hypot(d[0], d[1], d[2]);
    if (L < 1e-6) continue;
    const dir = [d[0] / L, d[1] / L, d[2] / L];
    const hit = level.raycast(pr.p, dir, L + 0.05);
    if (hit) {
      pr.p = [hit.x + hit.nx * 0.05, hit.y + hit.ny * 0.05, hit.z + hit.nz * 0.05];
      if (pr.stick) { pr.landed = true; pr.normal = [hit.nx, hit.ny, hit.nz]; pr.v = [0, 0, 0]; return pr; }
      // bounce: reflect and lose energy
      const vn = pr.v[0] * hit.nx + pr.v[1] * hit.ny + pr.v[2] * hit.nz;
      pr.v = [pr.v[0] - 1.6 * vn * hit.nx, pr.v[1] - 1.6 * vn * hit.ny, pr.v[2] - 1.6 * vn * hit.nz].map((x) => x * 0.55);
      pr.bounces = (pr.bounces || 0) + 1;
      if (hit.ny > 0.7 && Math.hypot(pr.v[0], pr.v[1], pr.v[2]) < 2.2) { pr.landed = true; pr.v = [0, 0, 0]; return pr; }
      if (pr.bounces > 6) { pr.landed = true; pr.v = [0, 0, 0]; return pr; }
    } else {
      pr.p = [pr.p[0] + d[0], pr.p[1] + d[1], pr.p[2] + d[2]];
    }
  }
  return pr;
}

// launch velocity for a throw from a view direction
export function throwVelocity(dir, speed, lift = 0.25) {
  const v = [dir[0] * speed, dir[1] * speed + speed * lift, dir[2] * speed];
  return v;
}
