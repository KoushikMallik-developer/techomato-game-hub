// Horde Surge 3D models (.glb files in public/models/hordesurge: CC0 and CC-BY 3.0, authors in CREDITS.txt there and in Settings).
// Two ways to use them:
//   bake(name, size, byMax): a static model flattened into one vertex-coloured geometry standing on y = 0,
//                       `size` tall (or `size` across its largest side when byMax, for flat things like coins),
//                       the same form the scenery's instanced prop kits use (so it gets wind sway and AO)
//   creature(name, opts): an animated, skinned copy with an animation mixer and named moves
// Every model is optional: if a file can't be loaded the game falls back to its procedural models.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { assetBase } from '../../config.js';

const loader = new GLTFLoader();
const files = new Map();
const ready = new Map();
const url = (name) => `${assetBase().replace(/\/?$/, '/')}models/hordesurge/${name}.glb`;

export function load(name) {
  if (!files.has(name)) {
    files.set(name, fetch(url(name)).then(async (res) => {
      if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) return null; // SPA fallback page
      // textures kept beside a model (in its folder) resolve from there
      const gltf = await loader.parseAsync(await res.arrayBuffer(), url(name).replace(/[^/]*$/, ''));
      ready.set(name, gltf);
      return gltf;
    }).catch((e) => { console.warn(`Horde Surge model ${name} could not be loaded`, e); return null; }));
  }
  return files.get(name);
}

// loads a list, reporting progress (0..1); never rejects
export function loadAll(names, progress) {
  let done = 0;
  return Promise.all(names.map((n) => load(n).then((g) => { done++; if (progress) progress(done / names.length); return g; })));
}

export const has = (name) => ready.has(name);

// ───────────── static models ─────────────
const baked = new Map();
const _w = new THREE.Color('#ffffff');
// a texture's pixels, read once through a canvas (glTF textures aren't flipped: v = 0 is the top row)
const pixels = new WeakMap();
function texels(tex) {
  if (!pixels.has(tex)) {
    const img = tex.image; const w = img.width; const h = img.height;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
    pixels.set(tex, { w, h, d: ctx.getImageData(0, 0, w, h).data });
  }
  return pixels.get(tex);
}
export function bake(name, height, byMax = false) {
  const key = `${name}@${height}${byMax ? 'm' : ''}`;
  if (baked.has(key)) return baked.get(key);
  const gltf = ready.get(name);
  if (!gltf) return null;
  gltf.scene.updateMatrixWorld(true);
  const pos = []; const nor = []; const col = [];
  const c = new THREE.Color();
  gltf.scene.traverse((m) => {
    if (!m.isMesh) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    const mats = [].concat(m.material);
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
    const p = g.attributes.position; const n = g.attributes.normal; const uv = g.attributes.uv;
    for (const gr of groups) {
      const mat = mats[gr.materialIndex || 0];
      const px = mat.map && uv ? texels(mat.map) : null;
      c.copy(mat.color || c.set('#ffffff'));
      for (let i = gr.start; i < gr.start + gr.count; i++) {
        // textured (palette) models: each face takes the texture colour under its centre
        if (px && (i - gr.start) % 3 === 0) {
          const u0 = (uv.getX(i) + uv.getX(i + 1) + uv.getX(i + 2)) / 3; const u = u0 - Math.floor(u0); const v0 = (uv.getY(i) + uv.getY(i + 1) + uv.getY(i + 2)) / 3; const v = v0 - Math.floor(v0);
          const o = (Math.min(px.h - 1, Math.floor(v * px.h)) * px.w + Math.min(px.w - 1, Math.floor(u * px.w))) * 4;
          c.setRGB(px.d[o] / 255, px.d[o + 1] / 255, px.d[o + 2] / 255, THREE.SRGBColorSpace).multiply(mat.color || _w);
        }
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        nor.push(n.getX(i), n.getY(i), n.getZ(i));
        col.push(c.r, c.g, c.b);
      }
    }
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingBox();
  const b = out.boundingBox; const size = b.getSize(new THREE.Vector3());
  const s = height / Math.max(byMax ? Math.max(size.x, size.y, size.z) : size.y, 1e-6);
  out.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  out.scale(s, s, s);
  out.computeBoundingSphere();
  baked.set(key, out);
  return out;
}

// a plain (unbaked) copy of a static model, keeping its textures: scaled to `size` along its longest side,
// standing on y = 0 and centred. Materials are shared between copies.
export function instance(name, size) {
  const gltf = ready.get(name);
  if (!gltf) return null;
  const root = gltf.scene.clone(true);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const d = box.getSize(new THREE.Vector3());
  const s = size / Math.max(d.x, d.y, d.z, 1e-6);
  root.scale.multiplyScalar(s);
  root.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
  root.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = true;
    [].concat(m.material).forEach((x) => { if (x.metalness !== undefined && !x.userData.hsFixed) { x.userData.hsFixed = true; x.metalness = Math.min(x.metalness, 0.3); x.roughness = Math.max(x.roughness, 0.4); } });
  });
  const g = new THREE.Group();
  g.add(root);
  return g;
}

// ───────────── animated creatures ─────────────
// moves are found by name, so every pack's naming works ("AnimalArmature|Gallop", "TRex_Walk", "Punch"...)
const MOVES = {
  idle: [/idle$/i, /idle/i],
  walk: [/walk$/i, /walk/i],
  run: [/gallop$/i, /run$/i, /run/i, /walk/i],
  attack: [/headbutt/i, /attack$/i, /punch/i, /attack/i, /swordslash/i],
  death: [/death/i],
  eat: [/eating/i, /idle/i],
  drive: [/forward/i, /walk/i],
};
const fits = new Map();

// height: how tall the creature stands. faceZ: the file's model looks down +Z (true for these packs);
// the returned group faces -Z like the game's procedural brutes. tint: { materialName: colour }.
export function creature(name, { height = 3, faceZ = true, tint = null, glow = null, crown = null } = {}) {
  const gltf = ready.get(name);
  if (!gltf) return null;
  const root = cloneSkinned(gltf.scene);
  const inner = new THREE.Group();
  inner.add(root);
  if (faceZ) inner.rotation.y = Math.PI;
  // measure the posed model once per file, then scale it to the asked height
  if (!fits.has(name)) {
    root.updateMatrixWorld(true);
    root.traverse((m) => { if (m.isSkinnedMesh) m.skeleton.update(); });
    const box = new THREE.Box3().setFromObject(root, true);
    fits.set(name, box);
  }
  const box = fits.get(name);
  const size = box.getSize(new THREE.Vector3());
  const s = height / Math.max(size.y, 1e-6);
  root.scale.multiplyScalar(s);
  root.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
  // own materials, so tints, flashes and the enraged glow stay on this one creature
  root.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = true;
    m.frustumCulled = false; // skinned bounds don't follow the animation
    m.material = [].concat(m.material).map((mt) => {
      const x = mt.clone();
      // glTF defaults to fully metallic when a file leaves it out, which renders these toy colours almost black
      if (x.metalness !== undefined) { x.metalness = Math.min(x.metalness, 0.15); x.roughness = Math.max(x.roughness, 0.5); }
      if (tint && tint[x.name]) x.color.set(tint[x.name]);
      if (glow && x.emissive) { x.emissive.set(glow); x.emissiveIntensity = 0.35; }
      return x;
    });
    if (m.material.length === 1) m.material = m.material[0];
  });
  if (crown) addCrown(root, crown, height);
  const mixer = new THREE.AnimationMixer(root);
  const clips = gltf.animations;
  const find = (move) => { for (const re of MOVES[move] || []) { const c = clips.find((k) => re.test(k.name.split('|').pop())); if (c) return c; } return null; };
  let base = null; let cur = null;
  const action = (move) => { const c = find(move); return c ? mixer.clipAction(c) : null; };
  const anim = {
    mixer,
    // loop a move (crossfading from the last one)
    loop(move, speed = 1) {
      const a = action(move);
      if (!a) return;
      a.timeScale = speed;
      if (a === base && a === cur) return;
      a.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      if (cur && cur !== a) cur.crossFadeTo(a, 0.2, false);
      base = cur = a;
    },
    // play a move once, then go back to the loop (or hold the last frame, for death)
    once(move, hold = false, speed = 1) {
      const a = action(move);
      if (!a || a === cur) return;
      a.reset().setLoop(THREE.LoopOnce, 1).play();
      a.clampWhenFinished = true;
      a.timeScale = speed;
      if (cur) cur.crossFadeTo(a, 0.12, false);
      cur = a;
      a.userData = { hold };
    },
    update(dt) { mixer.update(dt); },
  };
  mixer.addEventListener('finished', (e) => {
    if (e.action !== cur || (e.action.userData && e.action.userData.hold) || !base) return;
    base.reset().play();
    cur.crossFadeTo(base, 0.2, false);
    cur = base;
  });
  return { root, inner, anim };
}

// a gold crown on the creature's head bone (it follows the head as the creature moves)
function addCrown(root, color, height) {
  const geo = bake('Crown', 1);
  let head = null;
  root.traverse((b) => { if (b.isBone && /head/i.test(b.name) && !/end|top/i.test(b.name) && !head) head = b; });
  if (!geo || !head) return;
  root.updateMatrixWorld(true);
  const crown = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, color, metalness: 0.85, roughness: 0.25, emissive: color, emissiveIntensity: 0.25 }));
  const ws = head.getWorldScale(new THREE.Vector3());
  const hp = head.getWorldPosition(new THREE.Vector3());
  const size = height * 0.16;
  crown.scale.set(size / ws.x, size / ws.y, size / ws.z);
  // sit it a little above the head bone, upright in world space
  const target = hp.clone().add(new THREE.Vector3(0, height * 0.07, 0));
  crown.position.copy(head.worldToLocal(target));
  const q = head.getWorldQuaternion(new THREE.Quaternion()).invert();
  crown.quaternion.copy(q);
  crown.castShadow = true;
  head.add(crown);
}
