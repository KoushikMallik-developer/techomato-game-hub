// Sky Hopper particles: one InstancedMesh holds every puff, spark and bit of debris (a ring buffer, so nothing is allocated per burst).
import * as THREE from 'three';

export class Particles {
  constructor(scene, max = 200) {
    this.max = max; this.i = 0;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.p = Array.from({ length: max }, () => ({ life: 0 }));
    this.m = new THREE.Matrix4(); this.c = new THREE.Color(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.pos = new THREE.Vector3(); this.sc = new THREE.Vector3(); this.dirty = true;
    scene.add(this.mesh);
    this.update(0);
  }

  burst(x, y, color, n = 8, { speed = 4, size = 0.14, life = 0.5, gravity = -12, up = 1 } = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2; const s = speed * (0.4 + Math.random() * 0.6);
      Object.assign(this.p[this.i], { x, y, z: (Math.random() - 0.5) * 0.8, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7 + up * speed * 0.5, vz: (Math.random() - 0.5) * 2, life, max: life, size, g: gravity, r: Math.random() * 6 });
      this.c.set(color); this.mesh.setColorAt(this.i, this.c);
      this.i = (this.i + 1) % this.max;
    }
    this.mesh.instanceColor.needsUpdate = true; this.dirty = true;
  }

  update(dt) {
    if (!this.dirty) return; // nothing alive: no work
    let alive = false;
    for (let k = 0; k < this.max; k++) {
      const p = this.p[k];
      if (p.life > 0) { alive = true; p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.r += dt * 8; }
      const s = p.life > 0 ? p.size * (p.life / p.max) : 0;
      this.e.set(p.r || 0, p.r || 0, 0); this.q.setFromEuler(this.e);
      this.m.compose(this.pos.set(p.x || 0, p.y || 0, p.z || 0), this.q, this.sc.set(s, s, s));
      this.mesh.setMatrixAt(k, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.dirty = alive;
  }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent(); }
}
