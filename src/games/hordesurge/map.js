// Horde Surge world map: a chapter of 25 levels laid out as a dotted trail over five themed islands
// (meadow, frost, desert, candy, neon) in an animated sea. Finished levels show their stars, the current
// one has your unit bouncing on it, and every fifth is a boss castle. Drag or scroll to pan; tap a node to pick it.
import * as THREE from 'three';
import { THEMES, mulberry32 } from './data.js';
import { BOSSES } from './enemies.js';
import { makeLabel } from './world.js';
import { bake } from './assets.js';

const PER = 25;
const STEP = 5.4;
const nodePos = (i) => new THREE.Vector3(Math.sin(i * 0.62) * 6.5, 0.75, -i * STEP);

function starsTexture(n) {
  const c = document.createElement('canvas'); c.width = 192; c.height = 64;
  const g = c.getContext('2d');
  const star = (cx, cy, r) => { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5; const rr = k % 2 ? r * 0.45 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); };
  for (let k = 0; k < 3; k++) {
    star(32 + k * 64, k === 1 ? 28 : 36, k === 1 ? 27 : 23);
    g.lineWidth = 6; g.strokeStyle = '#1d1f45'; g.stroke();
    g.fillStyle = k < n ? '#ffd23f' : '#4a4e8c'; g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// the sea: soft moving bands of light and darker swells
function seaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, deep: { value: new THREE.Color('#1f6fb8') }, shallow: { value: new THREE.Color('#4ec3f0') } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float t; uniform vec3 deep; uniform vec3 shallow; varying vec3 vW;
      void main(){
        float w = sin(vW.x * 0.35 + t * 0.8) * sin(vW.z * 0.3 - t * 0.6) + sin((vW.x + vW.z) * 0.9 + t * 1.7) * 0.3;
        float sparkle = smoothstep(0.92, 1.0, sin(vW.x * 2.1 + t * 2.0) * sin(vW.z * 1.7 - t * 1.4));
        vec3 c = mix(deep, shallow, 0.5 + w * 0.25) + sparkle * 0.35;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

const REAL_TREES = { meadow: ['CommonTree_1', 'CommonTree_2', 'CommonTree_3'], snow: ['PineTree_Snow_1', 'PineTree_Snow_3'], desert: ['PalmTree_1', 'Cactus_1', 'Cactus_3'] };

function tree(theme, rnd) {
  const names = REAL_TREES[theme.id];
  if (names) {
    const name = names[Math.floor(rnd() * names.length)];
    const geo = bake(name, /Cactus/.test(name) ? 1.4 : 2.8);
    if (geo) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
      m.castShadow = true;
      const g = new THREE.Group();
      g.add(m);
      return g;
    }
  }
  const parts = [];
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
  if (theme.id === 'desert') {
    const m = std('#4f8a3a');
    parts.push([new THREE.CylinderGeometry(0.28, 0.32, 2.2, 8).translate(0, 1.1, 0), m]);
    parts.push([new THREE.CylinderGeometry(0.16, 0.18, 0.9, 8).translate(0.45, 1.3, 0), m]);
    parts.push([new THREE.CylinderGeometry(0.16, 0.18, 0.7, 8).translate(-0.45, 1.0, 0), m]);
  } else if (theme.id === 'candy') {
    parts.push([new THREE.CylinderGeometry(0.07, 0.07, 1.8, 6).translate(0, 0.9, 0), std('#ffffff')]);
    parts.push([new THREE.SphereGeometry(0.7, 14, 10).translate(0, 2.1, 0), std(rnd() < 0.5 ? '#ff5fa8' : '#9b6bff', { roughness: 0.3 })]);
  } else if (theme.neon) {
    parts.push([new THREE.OctahedronGeometry(0.7, 0).scale(0.6, 1.8, 0.6).translate(0, 1.3, 0), std(theme.tree, { emissive: theme.tree, emissiveIntensity: 0.8, roughness: 0.3 })]);
  } else {
    parts.push([new THREE.CylinderGeometry(0.15, 0.2, 0.9, 6).translate(0, 0.45, 0), std(theme.trunk)]);
    parts.push([new THREE.ConeGeometry(0.95, 2.3, 8).translate(0, 1.9, 0), std(theme.tree)]);
    if (theme.id === 'snow') parts.push([new THREE.ConeGeometry(0.5, 0.9, 8).translate(0, 2.65, 0), std('#ffffff')]);
  }
  const g = new THREE.Group();
  parts.forEach(([geo, mat]) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); });
  return g;
}

function castle(theme) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: theme.fort, roughness: 0.85 });
  const roof = new THREE.MeshStandardMaterial({ color: theme.neon ? '#ff3b6b' : '#c0392b', roughness: 0.5, emissive: theme.neon ? '#ff3b6b' : '#000', emissiveIntensity: theme.neon ? 0.6 : 0 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(3.6, 2, 1.4), stone, 0, 1, 0);
  for (let k = -1; k <= 1; k++) add(new THREE.BoxGeometry(0.6, 0.5, 1.4), stone, k * 1.3, 2.25, 0);
  [-1, 1].forEach((s) => {
    add(new THREE.CylinderGeometry(0.75, 0.85, 3.4, 12), stone, s * 2, 1.7, 0);
    add(new THREE.ConeGeometry(0.95, 1.6, 12), roof, s * 2, 4.2, 0);
  });
  const flag = add(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshStandardMaterial({ color: '#ff3b4a', side: THREE.DoubleSide }), 0.45, 4.1, 0);
  add(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), stone, 0, 3.4, 0);
  g.userData.flag = flag;
  return g;
}

function heroBlob(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.35 }));
  body.scale.set(1, 1.05, 1); body.position.y = 0.6; body.castShadow = true;
  g.add(body);
  [-1, 1].forEach((s) => {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.3 }));
    w.position.set(s * 0.2, 0.78, 0.48); g.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#111' }));
    p.position.set(s * 0.2, 0.78, 0.6); g.add(p);
  });
  return g;
}

export class WorldMap {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8fd3ff');
    this.scene.fog = new THREE.Fog('#8fd3ff', 70, 170);
    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 400);
    const hemi = new THREE.HemisphereLight('#ffffff', '#5a8a6a', 1.1);
    const sun = new THREE.DirectionalLight('#fff4dc', 2.0);
    sun.position.set(30, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 });
    this.sun = sun;
    this.scene.add(hemi, sun, sun.target);
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), seaMaterial());
    this.sea.rotation.x = -Math.PI / 2; this.sea.position.y = -0.4;
    this.scene.add(this.sea);
    this.focus = 0; this.target = 0; this.t = 0;
    this.nodes = [];
    this.content = null;
  }

  // builds one chapter (default: the player's current one); older chapters show their stars for replay
  open(save, skinColor, chapter = Math.floor((save.level - 1) / PER)) {
    if (this.content) this.disposeContent();
    const g = new THREE.Group();
    this.content = g;
    this.scene.add(g);
    this.first = chapter * PER + 1;
    this.chapter = chapter;
    const rnd = mulberry32(chapter * 97 + 5);
    // islands: one per world, overlapping into a single winding land
    for (let w = 0; w < 5; w++) {
      const T = THEMES[w];
      const c = new THREE.Vector3();
      for (let k = 0; k < 5; k++) c.add(nodePos(w * 5 + k));
      c.multiplyScalar(0.2);
      const sand = new THREE.Mesh(new THREE.CylinderGeometry(15.5, 17, 1.2, 32), new THREE.MeshStandardMaterial({ color: T.neon ? '#2a2f55' : T.id === 'snow' ? '#c9d6e2' : '#ead9a6', roughness: 0.95 }));
      sand.position.set(c.x, -0.3, c.z); sand.receiveShadow = true;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(14.2, 15, 0.5, 32), new THREE.MeshStandardMaterial({ color: T.ground, roughness: 0.9, emissive: T.neon ? '#1b2240' : '#000' }));
      top.position.set(c.x, 0.3, c.z); top.receiveShadow = true;
      g.add(sand, top);
      // trees scattered off the trail
      for (let k = 0; k < 16; k++) {
        const a = rnd() * Math.PI * 2; const r = 3 + rnd() * 10;
        const p = new THREE.Vector3(c.x + Math.cos(a) * r, 0.55, c.z + Math.sin(a) * r);
        let near = false;
        for (let i = 0; i < 5; i++) if (p.distanceTo(nodePos(w * 5 + i)) < 2.6) near = true;
        if (near) continue;
        const t = tree(T, rnd); t.position.copy(p); t.rotation.y = rnd() * 6; t.scale.setScalar(0.7 + rnd() * 0.6);
        g.add(t);
      }
      if (T.id === 'snow') [-1, 1].forEach((s) => {
        const m = new THREE.Mesh(new THREE.ConeGeometry(4.5, 7, 7), new THREE.MeshStandardMaterial({ color: '#8a98a8', roughness: 0.9, flatShading: true }));
        m.position.set(c.x + s * 10, 3.5, c.z - 4 * s); g.add(m);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(2.1, 3.2, 7), new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true }));
        cap.position.set(c.x + s * 10, 5.6, c.z - 4 * s); g.add(cap);
      });
      // world name floating beside the island
      const lab = makeLabel(T.name.toUpperCase(), { w: 512, h: 96, color: '#ffffff' });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lab.texture, depthWrite: false }));
      sp.scale.set(10, 1.9, 1);
      sp.position.set(c.x - Math.sign(c.x || 1) * 9, 5, c.z);
      g.add(sp);
    }
    // the dotted trail
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: PER }, (_, i) => nodePos(i)));
    const dots = Math.floor(curve.getLength() / 0.9);
    const dm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: '#fff3d6', roughness: 0.6 }), dots);
    const M = new THREE.Matrix4();
    for (let k = 0; k < dots; k++) { const p = curve.getPointAt(k / dots); M.makeTranslation(p.x, 0.62, p.z); dm.setMatrixAt(k, M); }
    g.add(dm);
    // level nodes
    this.nodes = [];
    const starTex = [0, 1, 2, 3].map(starsTexture);
    this.starTex = starTex;
    for (let i = 0; i < PER; i++) {
      const n = this.first + i;
      const boss = n % 5 === 0;
      const done = n < save.level; const cur = n === save.level; const locked = n > save.level;
      const T = THEMES[Math.floor((n - 1) / 5) % THEMES.length];
      const col = locked ? '#7a7fb8' : boss ? '#ff5a5a' : done ? '#ffcf3a' : '#ffffff';
      const r = boss ? 1.45 : 1.1;
      const node = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.12, 0.5, 28), new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: done ? 0.4 : 0.05, emissive: cur ? '#ffffff' : '#000', emissiveIntensity: cur ? 0.25 : 0 }));
      const p = nodePos(i);
      node.position.copy(p);
      node.castShadow = true;
      node.userData.n = n;
      node.userData.locked = locked;
      g.add(node);
      const lab = makeLabel(String(n), { w: 128, h: 96, color: locked ? '#c9cbe8' : '#ffffff' });
      const ls = new THREE.Sprite(new THREE.SpriteMaterial({ map: lab.texture, depthWrite: false }));
      ls.scale.set(1.5, 1.1, 1); ls.position.set(p.x, p.y + 1.1, p.z);
      g.add(ls);
      if (done) {
        const ss = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex[save.stars[n] || 0], depthWrite: false }));
        ss.scale.set(1.9, 0.63, 1); ss.position.set(p.x, p.y + 2, p.z);
        g.add(ss);
      }
      if (boss) {
        const c = castle(T);
        c.position.set(p.x + (p.x > 0 ? 3.2 : -3.2), 0.5, p.z - 0.5);
        c.rotation.y = p.x > 0 ? -0.4 : 0.4;
        g.add(c);
        this.flags = (this.flags || []).concat(c.userData.flag);
        const bl = makeLabel(BOSSES[T.id].name.toUpperCase(), { w: 512, h: 80, color: '#ffb3b3' });
        const bs = new THREE.Sprite(new THREE.SpriteMaterial({ map: bl.texture, depthWrite: false }));
        bs.scale.set(6, 0.95, 1); bs.position.set(c.position.x, 6.2, c.position.z);
        g.add(bs);
      }
      this.nodes.push(node);
    }
    // the player's unit bounces on the current node with a pulsing ring
    const ci = Math.max(0, Math.min(PER - 1, save.level - this.first));
    this.hero = this.ring = null;
    if (save.level >= this.first && save.level < this.first + PER) { // an older chapter has no "you are here"
      this.hero = heroBlob(skinColor);
      this.hero.position.copy(nodePos(ci));
      this.ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.6, 32), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, depthWrite: false }));
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.copy(nodePos(ci)).setY(1.02);
      g.add(this.hero, this.ring);
    }
    this.minZ = nodePos(PER - 1).z; this.maxZ = 0;
    this.target = this.focus = nodePos(ci).z;
    this.t = 0;
  }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  scroll(d) { this.target = Math.max(this.minZ, Math.min(this.maxZ, this.target + d)); }

  focusOn(n) { this.target = Math.max(this.minZ, Math.min(this.maxZ, nodePos(n - this.first).z)); }

  // level number under a screen point (ndc), or null
  pick(x, y) {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hit = rc.intersectObjects(this.nodes, false)[0];
    return hit ? hit.object.userData.n : null;
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    this.sea.material.uniforms.t.value = t;
    this.focus += (this.target - this.focus) * (1 - Math.exp(-6 * dt));
    const portrait = this.camera.aspect < 1;
    const x = Math.sin(-this.focus / STEP * 0.62) * 2;
    // high enough to see a whole world; the picked node sits in the upper half, clear of the level card
    this.camera.position.set(x, portrait ? 46 : 34, this.focus + (portrait ? 24 : 26));
    this.camera.lookAt(x * 0.6, 0, this.focus + 4);
    this.sun.position.set(30, 60, this.focus + 20);
    this.sun.target.position.set(0, 0, this.focus);
    // nodes pop in one after another when the map opens
    this.nodes.forEach((m, i) => { const k = Math.min(1, Math.max(0, (t - i * 0.025) * 4)); const e = k < 1 ? 1 - Math.pow(1 - k, 3) * Math.cos(k * 6) : 1; m.scale.setScalar(Math.max(0.001, e)); });
    if (this.hero) {
      this.hero.position.y = 1 + Math.abs(Math.sin(t * 4)) * 0.6;
      this.hero.rotation.y = Math.sin(t * 1.3) * 0.5;
      this.hero.children[0].scale.set(1 + (1 - Math.abs(Math.sin(t * 4))) * 0.1, 1.05 - (1 - Math.abs(Math.sin(t * 4))) * 0.1, 1);
      const r = (t * 0.8) % 1;
      this.ring.scale.setScalar(1 + r * 0.6);
      this.ring.material.opacity = 1 - r;
    }
    (this.flags || []).forEach((f, i) => { f.rotation.y = Math.sin(t * 3 + i) * 0.4; });
  }

  draw(renderer) { renderer.render(this.scene, this.camera); }

  disposeContent() {
    this.scene.remove(this.content);
    this.content.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    this.content = null;
    this.flags = [];
    this.nodes = [];
  }

  dispose() {
    if (this.content) this.disposeContent();
    this.sea.geometry.dispose(); this.sea.material.dispose();
  }
}
