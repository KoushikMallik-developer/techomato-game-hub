// Midnight Pursuit: procedural car models, arcade driving physics and city traffic.
import * as THREE from 'three';
import { CAR_R, clamp, lerp, damp, dampAngle, wrapAngle } from './data.js';

// Arcade car physics shared by the player, police and rival racers.
export const TRAFFIC_STYLES = ['sedan', 'sedan', 'hatch', 'suv', 'van', 'coupe', 'sedan', 'suv'];
export const TRAFFIC_COLORS = ['#8a8f99', '#5b6470', '#d9d9d6', '#2e3540', '#7a2a2a', '#2c4a6e', '#4a5e3a', '#b9a77a', '#e8e8e8', '#1e1e22', '#24476b', '#992222'];

export class Vehicle {
  constructor(stats, parts, opts = {}) {
    this.s = stats;
    this.parts = parts;
    this.kind = opts.kind || 'car';
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.vy = 0;
    this.h = 0;
    this.vx = 0;
    this.vz = 0;
    this.vF = 0;
    this.vS = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.grounded = true;
    this.airTime = 0;
    this.landed = 0;
    this.nitro = stats.nitroCap || 0;
    this.boosting = false;
    this.spiked = 0;
    this.radius = CAR_R; // broad-phase radius
    this.halfLen = 1.35; // capsule half-length (centre to end-circle centre)
    this.bodyR = 1.0; // capsule radius
    this.mass = stats.mass || 1;
    this.gx = 0;
    this.gz = 0;
    this.pitch = 0;
    this.roll = 0;
    this.spin = 0;
    this.braking = false;
    this.accelVis = 0;
    this.impact = 0;
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  // y: height to place at (e.g. up on the expressway deck); by default the car drops onto street level
  place(x, z, h, speed = 0, y = null) {
    this.x = x;
    this.z = z;
    this.h = h;
    this.vx = Math.sin(h) * speed;
    this.vz = Math.cos(h) * speed;
    this.yawRate = 0;
    // y = null: street level here (the first physics step settles it exactly)
    this.y = y !== null ? y : Vehicle.ground ? Vehicle.ground(x, z) : -999;
    this.snap = true;
    this.vy = 0;
    this.grounded = true;
  }

  update(dt, inp, world) {
    const s = this.s;
    this.impact = 0;
    const sinH = Math.sin(this.h);
    const cosH = Math.cos(this.h);
    let vF = this.vx * sinH + this.vz * cosH;
    let vS = -this.vx * cosH + this.vz * sinH;
    const target = clamp(inp.steer || 0, -1, 1);
    const rate = Math.abs(target) > Math.abs(this.steer) ? 4.5 : 8;
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);

    const wantBoost = !!inp.nitro && this.nitro > 0 && vF > 3;
    this.boosting = wantBoost;
    if (wantBoost) this.nitro = Math.max(0, this.nitro - dt);
    if (this.spiked > 0) this.spiked -= dt;
    const top = s.top * (this.boosting ? 1.16 : 1) * (this.spiked > 0 ? 0.42 : 1) * (inp.topScale || 1);
    const thr = clamp(inp.throttle || 0, 0, 1);
    const brk = clamp(inp.brake || 0, 0, 1);
    this.braking = brk > 0 && vF > 1;
    let a = 0;

    if (this.grounded) {
      if (thr > 0) {
        if (vF < -0.5) a += s.brake * thr;
        else {
          const r = vF / top;
          a += s.accel * (this.boosting ? s.nitroPower : 1) * thr * Math.max(0, 1 - r * r);
        }
      }
      if (vF > top) a -= (vF - top) * 1.2;
      if (brk > 0) {
        if (vF > 0.5) a -= s.brake * brk;
        else if (vF > -15) a -= 9 * brk;
      }
      a -= Math.sign(vF) * Math.min(Math.abs(vF) / Math.max(dt, 1e-3), 0.6 + (thr > 0 ? 0 : 1.3));
      a -= 0.0005 * vF * Math.abs(vF);
      if (inp.handbrake) a -= Math.sign(vF) * Math.min(Math.abs(vF) / Math.max(dt, 1e-3), 4.5);
      vF += a * dt;

      let grip = s.grip * (inp.handbrake ? 0.16 : 1) * (this.spiked > 0 ? 0.45 : 1);
      if (Math.abs(vS) > 6 && !inp.handbrake) grip *= 0.55; // keep an established drift going
      const before = Math.abs(vS);
      vS *= Math.exp(-grip * dt);
      if (!inp.handbrake && vF > 0) vF += (before - Math.abs(vS)) * 0.35;

      const sp = Math.abs(vF);
      const sf = clamp(sp / 7, 0, 1) * (1 - 0.45 * clamp(sp / (s.top * 1.2), 0, 1));
      let yawT = -this.steer * s.steer * sf * (vF >= 0 ? 1 : -1) * (inp.steerBoost || 1);
      if (inp.handbrake && sp > 8) yawT *= 1.5;
      this.yawRate = damp(this.yawRate, yawT, 10, dt);
    } else {
      this.yawRate *= Math.exp(-1.2 * dt);
      vF -= 0.0003 * vF * Math.abs(vF) * dt;
    }
    this.accelVis = a;
    this.h = wrapAngle(this.h + this.yawRate * dt);
    this.vx = sinH * vF - cosH * vS;
    this.vz = cosH * vF + sinH * vS;
    this.vF = vF;
    this.vS = vS;

    const px = this.x;
    const pz = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.integrateVertical(dt, world, px, pz);
    this.impact = Math.max(this.impact, world.collide(this));
  }

  integrateVertical(dt, world, px, pz) {
    if (this.snap) {
      // just placed: settle onto the surface below (street level unless a height was given)
      this.snap = false;
      const g0 = world.groundAt(this.x, this.z, this.y);
      this.y = g0.h;
      this.grounded = true;
    }
    const g = world.groundAt(this.x, this.z, this.y);
    this.landed = 0;
    if (g.h - this.y > 1.1) {
      // ran into the tall side or back of a ramp: treat it as a wall
      this.impact = Math.max(this.impact, this.speed);
      this.x = px;
      this.z = pz;
      this.vx *= -0.3;
      this.vz *= -0.3;
      return;
    }
    if (this.grounded) {
      if (this.y - g.h > 0.06) {
        this.grounded = false;
        this.airTime = 0;
      } else {
        this.vy = g.gx * this.vx + g.gz * this.vz;
        this.y = g.h;
        this.gx = g.gx;
        this.gz = g.gz;
      }
    }
    if (!this.grounded) {
      this.vy -= 24 * dt;
      this.y += this.vy * dt;
      this.airTime += dt;
      if (this.y <= g.h) {
        this.y = g.h;
        this.landed = this.airTime;
        this.grounded = true;
        this.vy = 0;
        this.gx = g.gx;
        this.gz = g.gz;
      }
    }
  }

  // Coasting physics for wrecked cars (no driver input)
  coast(dt, world) {
    this.impact = 0;
    const f = Math.exp(-1.6 * dt);
    this.vx *= f;
    this.vz *= f;
    this.h = wrapAngle(this.h + this.spin * dt);
    this.spin *= Math.exp(-1.5 * dt);
    const px = this.x;
    const pz = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.integrateVertical(dt, world, px, pz);
    this.impact = Math.max(this.impact, world.collide(this));
    this.vF = this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h);
    this.vS = 0;
    this.boosting = false;
  }

  sync(dt) {
    const p = this.parts;
    const g = p.group;
    g.position.set(this.x, this.y, this.z);
    const sinH = Math.sin(this.h);
    const cosH = Math.cos(this.h);
    let tp;
    if (this.grounded) tp = -Math.atan(this.gx * sinH + this.gz * cosH) + clamp(this.accelVis * 0.0025, -0.04, 0.04);
    else tp = -clamp(this.vy / Math.max(10, Math.abs(this.vF)), -0.45, 0.45) * 0.8;
    this.pitch = damp(this.pitch, tp, 8, dt);
    this.roll = damp(this.roll, clamp(this.vS * 0.012 + this.yawRate * this.vF * 0.0025, -0.1, 0.1), 6, dt);
    g.rotation.set(this.pitch, this.h, this.roll);
    this.spinAngle = (this.spinAngle || 0) + (this.vF * dt) / p.dims.wheel;
    p.wheels.forEach((w) => { w.rotation.x = this.spinAngle; });
    p.pivots.forEach((pv) => { pv.rotation.y = -this.steer * 0.45; });
    p.tail.emissiveIntensity = this.braking ? 4 : 1.2;
    p.flames.forEach((f) => {
      f.visible = this.boosting;
      if (this.boosting) f.scale.set(1, 1, 0.7 + Math.random() * 0.7);
    });
  }
}

// City traffic: cheap lane-following cars on the road graph that become physics wrecks when hit.
// A car is on an edge (dir +1 = from node a to b) in a lane; at the end of the edge it picks the next
// road and drives a smooth curve through the junction into the matching lane.
export class Traffic {
  constructor(factory, scene, world, count) {
    this.factory = factory;
    this.world = world;
    this.city = world.city;
    this.cars = [];
    for (let k = 0; k < count; k++) {
      const style = TRAFFIC_STYLES[k % TRAFFIC_STYLES.length];
      const color = Math.random() < 0.12 ? '#f2c230' : TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
      const parts = factory.build(style, color, { matte: Math.random() < 0.3, modelKey: `traffic-${style}` });
      scene.add(parts.group);
      const v = new Vehicle({ top: 30, accel: 6, grip: 6, steer: 1.5, brake: 20, mass: style === 'van' || style === 'suv' ? 1.6 : 1.2 }, parts, { kind: 'traffic' });
      v.style = style;
      v.color = color;
      v.matte = false;
      v.cruise = 14;
      v.trafficSpeed = 0;
      v.wreck = 0;
      v.vh = 0;
      this.cars.push(v);
    }
  }

  // rebuild car meshes (after real models finish loading)
  rebuild() {
    this.cars.forEach((v) => {
      const old = v.parts;
      const parent = old.group.parent;
      const parts = this.factory.build(v.style, v.color, { matte: v.matte, modelKey: `traffic-${v.style}` });
      this.factory.dispose(old);
      if (parent) parent.add(parts.group);
      v.parts = parts;
    });
  }

  laneOff(e, lane) {
    return e.T.median + e.T.laneW * (Math.min(lane, e.T.lanes - 1) + 0.5);
  }

  // world position of a lane point: edge e at distance s, travelling dir, lane index
  lanePoint(e, s, dir, lane) {
    const p = this.city.at(e, s);
    const tx = p.dx * dir;
    const tz = p.dz * dir;
    const off = this.laneOff(e, lane);
    const x = p.x - tz * off;
    const z = p.z + tx * off;
    const y = p.lift > 0.3 ? p.y : this.city.terrainAt(x, z).h;
    return { x, z, y, tx, tz };
  }

  spawnAround(v, px, pz, minD, maxD) {
    const C = this.city;
    let placed = false;
    for (let tries = 0; tries < 40 && !placed; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = minD + Math.random() * (maxD - minD);
      const rd = C.nearestRoad(px + Math.cos(a) * r, pz + Math.sin(a) * r, null, 70);
      if (!rd) continue;
      const e = rd.e;
      if (e.len - e.t0 - e.t1 < 8) continue;
      v.e = e;
      v.dir = Math.random() < 0.5 ? 1 : -1;
      v.lane = Math.floor(Math.random() * e.T.lanes);
      v.s = clamp(rd.s, e.t0 + 1, e.len - e.t1 - 1);
      v.turn = null;
      v.next = null;
      this.position(v);
      const d = Math.hypot(v.x - px, v.z - pz);
      placed = d >= minD * 0.8 && d <= maxD * 1.1;
    }
    v.cruise = (v.e ? v.e.T.speed : 14) * (0.72 + Math.random() * 0.3);
    v.trafficSpeed = v.cruise;
    v.wreck = 0;
    v.spin = 0;
    v.vh = v.h;
    v.vy = 0;
    v.grounded = true;
    v.nearMissed = false;
  }

  position(v) {
    if (v.turn) {
      const T = v.turn;
      const t = clamp(T.t, 0, 1);
      const u = 1 - t;
      v.x = u * u * T.p0[0] + 2 * u * t * T.k[0] + t * t * T.p1[0];
      v.z = u * u * T.p0[1] + 2 * u * t * T.k[1] + t * t * T.p1[1];
      const dx = 2 * u * (T.k[0] - T.p0[0]) + 2 * t * (T.p1[0] - T.k[0]);
      const dz = 2 * u * (T.k[1] - T.p0[1]) + 2 * t * (T.p1[1] - T.k[1]);
      v.h = Math.atan2(dx, dz);
      v.y = lerp(T.y0, T.y1, t);
      return;
    }
    const p = this.lanePoint(v.e, v.s, v.dir, v.lane);
    v.x = p.x;
    v.z = p.z;
    v.y = p.y;
    v.h = Math.atan2(p.tx, p.tz);
  }

  // node the car is heading to, and its choice of next road there
  pickNext(v) {
    const C = this.city;
    const e = v.e;
    const nid = v.dir > 0 ? e.b : e.a;
    const n = C.nodes[nid];
    // arriving direction
    const end = this.lanePoint(e, v.dir > 0 ? e.len - e.t1 : e.t0, v.dir, v.lane);
    const opts = [];
    n.out.forEach((o) => {
      if (o.ei === e.id && n.deg > 1) return;
      const turn = Math.abs(wrapAngle(Math.atan2(o.dx, o.dz) - Math.atan2(end.tx, end.tz)));
      const w = turn < 0.5 ? 3 : turn < 2.2 ? 1 : 0.15;
      opts.push({ o, w, turn });
    });
    let total = opts.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * total;
    let pick = opts[0];
    for (const op of opts) {
      r -= op.w;
      if (r <= 0) { pick = op; break; }
    }
    total = 0;
    const ne = C.edges[pick.o.ei];
    return { e: ne, dir: pick.o.fwd ? 1 : -1, node: n, turn: pick.turn };
  }

  startTurn(v) {
    const C = this.city;
    const nx = v.next || this.pickNext(v);
    v.next = null;
    const e = v.e;
    const from = this.lanePoint(e, v.dir > 0 ? e.len - e.t1 : e.t0, v.dir, v.lane);
    const ne = nx.e;
    const lane = Math.min(v.lane, ne.T.lanes - 1);
    const s1 = nx.dir > 0 ? ne.t0 : ne.len - ne.t1;
    const to = this.lanePoint(ne, s1, nx.dir, lane);
    let k = [(from.x + to.x) / 2, (from.z + to.z) / 2];
    const den = from.tx * to.tz - from.tz * to.tx;
    if (Math.abs(den) > 0.05) {
      const t = ((to.x - from.x) * to.tz - (to.z - from.z) * to.tx) / den;
      if (t > 0 && t < 60) k = [from.x + from.tx * t, from.z + from.tz * t];
    } else if (from.tx * to.tx + from.tz * to.tz < 0) {
      // U-turn at a dead end: swing out around the turning circle
      const n = nx.node;
      k = [n.x + from.tx * 10, n.z + from.tz * 10];
    }
    const len = Math.hypot(k[0] - from.x, k[1] - from.z) + Math.hypot(to.x - k[0], to.z - k[1]);
    v.turn = { p0: [from.x, from.z], k, p1: [to.x, to.z], t: 0, len: Math.max(1, len), y0: from.y, y1: to.y, ne, dir: nx.dir, s1, lane };
  }

  update(dt, px, pz, movers) {
    for (const v of this.cars) {
      const distP = Math.hypot(v.x - px, v.z - pz);
      if (v.wreck > 0) {
        v.coast(dt, this.world);
        v.wreck -= dt;
        if (v.wreck <= 0 && distP > 150) this.spawnAround(v, px, pz, 260, 420);
        else if (v.wreck <= 0) v.wreck = 0.5;
        v.sync(dt);
        continue;
      }
      if (distP > 480 || !v.e) this.spawnAround(v, px, pz, 260, 420);
      const fx = Math.sin(v.h);
      const fz = Math.cos(v.h);
      let target = v.cruise;
      const check = (o) => {
        if (o === v || Math.abs((o.y || 0) - v.y) > 3) return;
        const dx = o.x - v.x;
        const dz = o.z - v.z;
        const along = dx * fx + dz * fz;
        if (along <= 0 || along > 26) return;
        const lat = -dx * Math.cos(v.h) + dz * Math.sin(v.h);
        if (Math.abs(lat) < 2.4) target = Math.min(target, along < 9 ? 0 : (o.trafficSpeed !== undefined ? o.trafficSpeed : o.speed) * 0.9 + (along - 9) * 0.6);
      };
      movers.forEach(check);
      this.cars.forEach(check);
      // slow down for the corner ahead
      if (!v.turn) {
        const left = v.dir > 0 ? v.e.len - v.e.t1 - v.s : v.s - v.e.t0;
        if (left < 35) {
          if (!v.next) v.next = this.pickNext(v);
          const corner = v.next.turn > 2.4 ? 5 : v.next.turn > 0.6 ? 9 : 99;
          target = Math.min(target, corner + left * 0.45);
        }
      } else if (v.turn.len > 6) target = Math.min(target, 9);
      v.trafficSpeed += clamp(target - v.trafficSpeed, -14 * dt, 4 * dt);
      const step = v.trafficSpeed * dt;
      if (v.turn) {
        v.turn.t += step / v.turn.len;
        if (v.turn.t >= 1) {
          const T = v.turn;
          v.e = T.ne;
          v.dir = T.dir;
          v.lane = T.lane;
          v.s = T.s1 + (T.t - 1) * T.len * T.dir;
          v.turn = null;
        }
      } else {
        v.s += v.dir * step;
        const e = v.e;
        if ((v.dir > 0 && v.s >= e.len - e.t1) || (v.dir < 0 && v.s <= e.t0)) this.startTurn(v);
      }
      this.position(v);
      const gr = this.world.groundAt(v.x, v.z, v.y + 0.5);
      if (Math.abs(gr.h - v.y) < 2) v.y = gr.h;
      v.pitchT = -Math.atan(gr.gx * Math.sin(v.h) + gr.gz * Math.cos(v.h));
      v.vx = Math.sin(v.h) * v.trafficSpeed;
      v.vz = Math.cos(v.h) * v.trafficSpeed;
      v.vF = v.trafficSpeed;
      v.vh = distP > 200 ? v.h : dampAngle(v.vh, v.h, 10, dt);
      const g = v.parts.group;
      g.position.set(v.x, v.y, v.z);
      g.rotation.set(v.pitchT || 0, v.vh, 0);
      v.spinAngle = (v.spinAngle || 0) + (v.trafficSpeed * dt) / v.parts.dims.wheel;
      v.parts.wheels.forEach((w) => { w.rotation.x = v.spinAngle; });
      v.parts.tail.emissiveIntensity = target < v.trafficSpeed - 1 ? 4 : 1.2;
    }
  }

  // Turn a traffic car into a coasting wreck after a hit.
  wreckCar(v) {
    if (v.wreck > 0) return false;
    v.wreck = 9;
    v.spin = (Math.random() - 0.5) * 6;
    v.trafficSpeed = 0;
    return true;
  }
}
