// Midnight Pursuit: real 3D car models (glTF binary).
// Bundled: public/models/cars/concept.glb, a detailed concept car (Khronos sample asset, CC-BY 4.0,
// based on a CC0 model by Unity Fan; see public/models/cars/CREDITS.txt). Several player cars use it,
// each with its own proportions, paint and rim finish.
// You can add more:  public/models/cars/<key>.glb  where <key> is a car id (kestrel, vanta, brigand,
// tundra, nightfall, phantom), "cop", or "traffic-<style>" (sedan, hatch, suv, van, coupe).
// Models should face +Z with Y up (they are scaled to the car's length and set on the ground).
// Materials named "carpaint", "paint" or "body" take the car's colour; a material named like
// "brake"/"taillight" becomes the brake lights. Nodes named WheelFrontL/WheelFrontR/WheelRearL/WheelRearR
// (or containing "wheel" + front/rear + left/right) spin and steer.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const MODEL_KEYS = ['kestrel', 'vanta', 'brigand', 'tundra', 'nightfall', 'phantom', 'cop', 'traffic-sedan', 'traffic-hatch', 'traffic-suv', 'traffic-van', 'traffic-coupe'];

// Cars that use the bundled model, with per-car proportions (sx width, sy height, sz length) and accent colour.
export const BUNDLED = {
  kestrel: { file: 'concept', length: 4.35, sx: 1, sy: 1, accent: '#0d0d10', rim: 'silver' },
  nightfall: { file: 'concept', length: 4.5, sx: 1.04, sy: 0.95, accent: '#0d0d10', rim: 'black' },
  phantom: { file: 'concept', length: 4.62, sx: 1.07, sy: 0.92, accent: '#121218', rim: 'dark' },
};

const WHEEL_RE = /wheel.?(front|rear|f|r).?(l|r|left|right)$/i;

export class ModelLibrary {
  constructor(base) {
    this.base = base.endsWith('/') ? base : `${base}/`;
    this.map = new Map();
    this.files = new Map();
    this.loader = new GLTFLoader();
  }

  async loadAll(lengthFor) {
    await Promise.all(MODEL_KEYS.map((k) => this.load(k, lengthFor(k))));
    return this.map.size;
  }

  fetchFile(name) {
    if (!this.files.has(name)) {
      const url = `${this.base}models/cars/${name}.glb`;
      this.files.set(name, fetch(url).then(async (res) => {
        if (!res.ok) return null;
        const type = res.headers.get('content-type') || '';
        if (type.includes('text/html')) return null; // SPA fallback page, not a model
        const buf = await res.arrayBuffer();
        return this.loader.parseAsync(buf, '');
      }).catch((e) => {
        console.warn(`Model ${name} could not be loaded`, e);
        return null;
      }));
    }
    return this.files.get(name);
  }

  async load(key, length) {
    const cfg = BUNDLED[key];
    // a car-specific file always wins over the bundled model
    let gltf = await this.fetchFile(key);
    let opts = { length, sx: 1, sy: 1 };
    if (!gltf && cfg) {
      gltf = await this.fetchFile(cfg.file);
      opts = { ...cfg };
    }
    if (!gltf) return;
    this.map.set(key, prepare(gltf.scene.clone(true), opts));
  }

  get(key) {
    return this.map.get(key);
  }
}

// Scale and centre a model, find its wheels and build spin/steer pivots for them.
function prepare(root, opts) {
  const holder = new THREE.Group();
  holder.add(root);
  root.updateMatrixWorld(true);
  let bbox = new THREE.Box3().setFromObject(root);
  const size = bbox.getSize(new THREE.Vector3());
  const s = opts.length / Math.max(size.z, size.x, 0.001);
  root.scale.multiply(new THREE.Vector3(s * opts.sx, s * opts.sy, s));
  root.updateMatrixWorld(true);
  bbox = new THREE.Box3().setFromObject(root);
  const c = bbox.getCenter(new THREE.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= bbox.min.y;
  holder.updateMatrixWorld(true);
  bbox.setFromObject(root);
  const dims = { L: bbox.max.z - bbox.min.z, W: bbox.max.x - bbox.min.x, H: bbox.max.y, wheel: 0.34 };

  const wheelNodes = [];
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m) return;
        if (m.transparent) o.castShadow = false;
        if (m.envMapIntensity !== undefined) m.envMapIntensity = /glass/i.test(m.name) ? 1.4 : 1;
        if (opts.accent && /accent/i.test(m.name)) m.color.set(opts.accent);
        if (/^rim/i.test(m.name) && opts.rim === 'black') { m.color.set('#111216'); m.roughness = 0.35; }
        if (/headlight/i.test(m.name) && m.emissiveIntensity > 2) m.emissiveIntensity = 2.2;
        if (/^rim/i.test(m.name) && opts.rim === 'dark') { m.color.set('#3a3d44'); m.roughness = 0.25; }
      });
    }
    if (WHEEL_RE.test(o.name) && !o.isMesh) wheelNodes.push(o);
  });
  // some files make every wheel a mesh rather than a group
  if (wheelNodes.length < 4) root.traverse((o) => { if (WHEEL_RE.test(o.name) && !wheelNodes.includes(o)) wheelNodes.push(o); });
  let hasWheels = false;
  if (wheelNodes.length >= 4) {
    hasWheels = true;
    wheelNodes.slice(0, 4).forEach((node) => {
      const m = node.name.match(WHEEL_RE);
      const front = /^f/i.test(m[1]);
      const wb = new THREE.Box3().setFromObject(node);
      const wc = wb.getCenter(new THREE.Vector3());
      dims.wheel = Math.max(0.2, (wb.max.y - wb.min.y) / 2);
      const pivot = new THREE.Group();
      pivot.name = front ? 'wpivot_front' : 'wpivot_rear';
      pivot.position.copy(wc);
      holder.add(pivot);
      const spin = new THREE.Group();
      spin.name = 'wspin';
      pivot.add(spin);
      holder.updateMatrixWorld(true);
      spin.attach(node);
    });
  }
  return {
    hasWheels,
    dims,
    instantiate(color) {
      const obj = holder.clone(true);
      let paint = null;
      let tail = null;
      const own = [];
      obj.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const next = mats.map((m) => {
          if (!m) return m;
          if (/carpaint|^paint|body/i.test(m.name || '')) {
            if (!paint) {
              paint = m.clone();
              paint.color = new THREE.Color(color);
              own.push(paint);
            }
            return paint;
          }
          if (/brake ?light|taillight|tail_light/i.test(m.name || '')) {
            if (!tail) {
              tail = m.clone();
              tail.emissive = new THREE.Color(0xff1020);
              own.push(tail);
            }
            return tail;
          }
          return m;
        });
        o.material = Array.isArray(o.material) ? next : next[0];
      });
      const wheels = [];
      const pivots = [];
      obj.children.forEach((ch) => {
        if (!/^wpivot_/.test(ch.name)) return;
        wheels.push(ch.children[0]);
        if (ch.name === 'wpivot_front') pivots.push(ch);
      });
      return { object: obj, paint, tail, own, wheels, pivots };
    },
  };
}
