// Midnight Pursuit: skid marks, smoke/sparks particles and rain.
import * as THREE from 'three';

const dummy = new THREE.Object3D();

export class Skids {
  constructor(scene, n = 800) {
    const geo = new THREE.PlaneGeometry(0.34, 1.25);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n);
    this.mesh.frustumCulled = false;
    this.n = n;
    this.i = 0;
    dummy.position.set(0, -50, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    for (let k = 0; k < n; k++) this.mesh.setMatrixAt(k, dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  add(x, y, z, h) {
    dummy.position.set(x, y + 0.035, z);
    dummy.rotation.set(0, h, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    this.mesh.setMatrixAt(this.i, dummy.matrix);
    this.i = (this.i + 1) % this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Particles {
  constructor(scene, tex, n, { additive = false, color = 0xffffff } = {}) {
    this.pool = [];
    this.color = color;
    for (let k = 0; k < n; k++) {
      const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      const s = new THREE.Sprite(m);
      s.visible = false;
      scene.add(s);
      this.pool.push({ s, m, age: 0, life: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, op: 1, grav: 0, drag: 0 });
    }
    this.i = 0;
  }

  spawn(x, y, z, vx, vy, vz, o = {}) {
    const p = this.pool[this.i];
    this.i = (this.i + 1) % this.pool.length;
    p.age = 0;
    p.life = o.life || 1;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.s0 = o.s0 !== undefined ? o.s0 : 1;
    p.s1 = o.s1 !== undefined ? o.s1 : 3;
    p.op = o.op !== undefined ? o.op : 0.5;
    p.grav = o.grav || 0;
    p.drag = o.drag || 0;
    p.m.color.set(o.color !== undefined ? o.color : this.color);
    p.s.position.set(x, y, z);
    p.s.scale.setScalar(p.s0);
    p.m.opacity = p.op;
    p.s.visible = true;
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.s.visible) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.s.visible = false;
        continue;
      }
      p.vy += p.grav * dt;
      const f = Math.exp(-p.drag * dt);
      p.vx *= f;
      p.vy *= f;
      p.vz *= f;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * t);
      p.m.opacity = p.op * (1 - t);
    }
  }
}

export class Rain {
  constructor(scene, n = 1500) {
    this.n = n;
    this.drops = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      this.drops[k * 3] = (Math.random() - 0.5) * 120;
      this.drops[k * 3 + 1] = Math.random() * 50;
      this.drops[k * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    this.pos = new Float32Array(n * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xaab8d8, transparent: true, opacity: 0.4 }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(dt, cam) {
    if (!this.mesh.visible) return;
    const d = this.drops;
    const p = this.pos;
    for (let k = 0; k < this.n; k++) {
      d[k * 3 + 1] -= 36 * dt;
      if (d[k * 3 + 1] < 0) {
        d[k * 3 + 1] += 50;
        d[k * 3] = (Math.random() - 0.5) * 120;
        d[k * 3 + 2] = (Math.random() - 0.5) * 120;
      }
      const x = d[k * 3];
      const y = d[k * 3 + 1];
      const z = d[k * 3 + 2];
      p[k * 6] = x;
      p[k * 6 + 1] = y;
      p[k * 6 + 2] = z;
      p[k * 6 + 3] = x + 0.25;
      p[k * 6 + 4] = y + 1.3;
      p[k * 6 + 5] = z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.position.set(cam.position.x, 0, cam.position.z);
  }
}

// Red tail-light streaks that stretch out behind the car at speed.
export class Trails {
  constructor(scene, n = 9) {
    this.n = n;
    this.pts = [[], []];
    this.meshes = [0, 1].map(() => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      const idx = [];
      for (let k = 0; k < n - 1; k++) {
        const a = k * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });
  }

  update(points, intensity) {
    [0, 1].forEach((s) => {
      const list = this.pts[s];
      if (points && intensity > 0.02) list.unshift(points[s]);
      else list.pop();
      while (list.length > this.n) list.pop();
      // keep the streak short: a glow just behind the lamp, not a line along the road
      while (list.length > 1) {
        const a = list[0];
        const z = list[list.length - 1];
        if (Math.hypot(a[0] - z[0], a[1] - z[1], a[2] - z[2]) <= 3.2) break;
        list.pop();
      }
      const pos = this.meshes[s].geometry.attributes.position;
      const col = this.meshes[s].geometry.attributes.color;
      for (let k = 0; k < this.n; k++) {
        const p = list[Math.min(k, list.length - 1)];
        if (!p) {
          pos.setXYZ(k * 2, 0, -100, 0);
          pos.setXYZ(k * 2 + 1, 0, -100, 0);
          continue;
        }
        pos.setXYZ(k * 2, p[0], p[1] + 0.035, p[2]);
        pos.setXYZ(k * 2 + 1, p[0], p[1] - 0.035, p[2]);
        const f = 0.7 * intensity * (1 - k / this.n) ** 2;
        col.setXYZ(k * 2, f, f * 0.06, f * 0.04);
        col.setXYZ(k * 2 + 1, f, f * 0.06, f * 0.04);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    });
  }
}
