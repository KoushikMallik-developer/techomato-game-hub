// Core Breach models: agents (sculpted humanoids from body.js with per-agent outfits, animated procedurally),
// weapons (world and first-person), the Core device and the watch turret.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { AGENT, WEAPON, clamp, damp } from './data.js';
import * as B from './body.js';
import * as SK from './skin.js';
import * as HD from './head.js';
import * as G from './guns.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r1, r2, h, s = 10) => new THREE.CylinderGeometry(r1, r2, h, s);
const sph = (r, a = 14, b = 10, ...rest) => new THREE.SphereGeometry(r, a, b, ...rest);

function mesh(geo, mat, parent, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// rim light: a coloured glow on edges facing away from the camera (team colour)
function rimify(mat, rim) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: rim.color };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat rimF = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 4.0);\ntotalEmissiveRadiance += rimColor * rimF * 0.55;');
  };
  mat.customProgramCacheKey = () => 'rim';
  return mat;
}

const SKIN = ['#e0b896', '#c99a74', '#8d5f3e', '#f1cfb0', '#6b4630'];

// ───────────── agents ─────────────
// Characters are built from smooth parts (capsule limbs, a lathed torso, rounded armour plates) with a
// woven-fabric normal map, posed every frame: legs follow the movement direction, the upper body aims,
// and both arms reach the gun with two-bone IK.
const rbox = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const cap = (r, len, seg = 12) => new THREE.CapsuleGeometry(r, len, 4, seg);

let FABRIC = null;
function fabricNormal() {
  if (FABRIC) return FABRIC;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // twill weave: diagonal ridges plus fine noise
      const t = Math.sin(((x + y) / S) * Math.PI * 2 * 16);
      const u = Math.sin(((x - y) / S) * Math.PI * 2 * 32) * 0.3;
      const nx = t * 0.35 + (Math.random() - 0.5) * 0.15;
      const ny = u * 0.35 + (Math.random() - 0.5) * 0.15;
      const i = (y * S + x) * 4;
      img.data[i] = 128 + nx * 127; img.data[i + 1] = 128 + ny * 127; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  FABRIC = new THREE.CanvasTexture(c);
  FABRIC.wrapS = FABRIC.wrapT = THREE.RepeatWrapping;
  FABRIC.repeat.set(5, 5);
  return FABRIC;
}

// where the hands go on each kind of gun (gun-local coordinates) and where the gun sits (spine space)
const HOLD = {
  sidearm: { pos: [0.04, 0.4, -0.46], grip: [0, -0.06, 0.03], fore: [-0.018, -0.075, 0.03] },
  melee: { pos: [0.16, 0.2, -0.3], grip: [0, 0, 0.06], fore: null },
  smg: { pos: [0.07, 0.37, -0.3], grip: [0, -0.06, 0.03], fore: [0, -0.01, -0.24] },
  rifle: { pos: [0.07, 0.37, -0.33], grip: [0, -0.06, 0.03], fore: [0, -0.01, -0.3] },
  shotgun: { pos: [0.07, 0.37, -0.33], grip: [0, -0.06, 0.03], fore: [0, 0.0, -0.36] },
  sniper: { pos: [0.07, 0.36, -0.34], grip: [0, -0.06, 0.03], fore: [0, -0.01, -0.32] },
  heavy: { pos: [0.08, 0.34, -0.33], grip: [0, -0.07, 0.03], fore: [0, -0.1, -0.265] },
};

const BODY_CACHE = new Map();
let BODY_CLOTH = null;

export function buildAgent(agentId, team, opts = {}) {
  const ag = AGENT[agentId] || AGENT.vex;
  const rimColor = new THREE.Color(opts.rim || '#000000');
  const rim = { color: rimColor };
  const cloth = B.clothNormal();
  const web = B.webbingNormal();
  const M = (color, o = {}) => rimify(new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o }), rim);
  const F = (color, o = {}) => M(color, { normalMap: cloth, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92, ...o });
  const W = (color, o = {}) => M(color, { normalMap: web, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.9, ...o });
  const skinTone = SKIN[opts.skin ?? (agentId.length % SKIN.length)];
  const mats = {
    suit: F(ag.suit || '#2a2e38'),
    suit2: F(ag.suit2 || '#3a3f4c'),
    accent: M(ag.color, { roughness: 0.3, metalness: 0.25, emissive: ag.color, emissiveIntensity: 0.22 }),
    accent2: M(ag.accent, { roughness: 0.32, metalness: 0.3, emissive: ag.accent, emissiveIntensity: 0.2 }),
    skin: rimify(new THREE.MeshPhysicalMaterial({ color: skinTone, roughness: 0.55, sheen: 0.6, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ff9a7a'), normalMap: B.skinNormal(), normalScale: new THREE.Vector2(0.15, 0.15) }), rim),
    dark: M('#17181c', { roughness: 0.55, metalness: 0.2 }),
    glove: M('#1d1e22', { roughness: 0.7, normalMap: cloth, normalScale: new THREE.Vector2(0.4, 0.4) }),
    gear: W('#3b3a33'),
    sole: M('#0c0c0e', { roughness: 0.9 }),
    eye: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12 }),
    glow: new THREE.MeshStandardMaterial({ color: '#000000', emissive: ag.accent, emissiveIntensity: 3.2 }),
    hair: M(['#1c1612', '#d9d2c4', '#3a2516', '#7a2a2a'][agentId.length % 4], { roughness: 0.85 }),
    metal: M('#5c6068', { roughness: 0.35, metalness: 0.8 }),
    // armour plates: team colour knocked back toward a tactical grey so the kit reads as real gear
    plate: M(new THREE.Color(ag.color).lerp(new THREE.Color('#2a2c30'), 0.38), { roughness: 0.38, metalness: 0.3, emissive: ag.color, emissiveIntensity: 0.1, normalMap: B.webbingNormal(), normalScale: new THREE.Vector2(0.2, 0.2) }),
  };
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);
  const legRoot = new THREE.Group(); // turns with the movement direction
  hips.add(legRoot);
  // pelvis, belt with buckle and a drop pouch
  mesh(B.curvedPlate(0.31, 0.05, 0.03, 1.5, 0.012), mats.dark, legRoot, 0, 0.075, -0.1);
  mesh(B.curvedPlate(0.31, 0.05, 0.03, 1.5, 0.012), mats.dark, legRoot, 0, 0.075, 0.1).rotation.y = Math.PI;
  mesh(rbox(0.05, 0.04, 0.012, 0.005), mats.metal, legRoot, 0, 0.075, -0.118);
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(0.093 * s, -0.05, 0);
    legRoot.add(hip);
    mesh(B.pouchGeometry(0.05, 0.12, 0.13), mats.gear, hip, 0.085 * s, -0.17, -0.005); // cargo pocket
    if (s > 0) {
      const hol = mesh(B.pouchGeometry(0.045, 0.17, 0.11), mats.dark, hip, 0.1, -0.2, 0.03); // holster
      hol.rotation.x = 0.12;
      mesh(rbox(0.035, 0.07, 0.04, 0.01), mats.dark, hip, 0.1, -0.08, 0.04); // pistol grip
    }
    const knee = new THREE.Group();
    knee.position.y = -0.43;
    hip.add(knee);
    mesh(B.padGeometry(0.06), mats.plate, knee, 0, -0.005, -0.045); // knee pad
    [-0.02, 0.03].forEach((y) => mesh(rbox(0.13, 0.014, 0.12, 0.006), mats.dark, knee, 0, y - 0.01, 0.01)); // pad straps
    const foot = new THREE.Group();
    foot.position.y = -0.42;
    knee.add(foot);
    mesh(B.bootGeometry(), mats.dark, foot, 0, 0.02, 0);
    mesh(B.soleGeometry(), mats.sole, foot, 0, 0.02, 0);
    mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.05, 14), mats.dark, foot, 0, 0.1, 0.005); // boot collar
    return { hip, knee, foot };
  });
  // torso: sculpted body under a plate carrier with webbing and pouches
  const spine = new THREE.Group();
  spine.position.y = 0.08;
  hips.add(spine);
  mesh(B.curvedPlate(0.31, 0.31, 0.05, 1.6, 0.025), mats.plate, spine, 0, 0.35, -0.135); // front plate
  mesh(B.curvedPlate(0.32, 0.33, 0.05, 1.6, 0.025), mats.plate, spine, 0, 0.35, 0.115).rotation.y = Math.PI; // back plate
  mesh(B.torsoGeometry(1, 0.14, 0.46, 1.1), mats.gear, spine, 0, 0, 0); // cummerbund (wraps the waist)
  [-1, 0, 1].forEach((k) => mesh(B.pouchGeometry(0.075, 0.11, 0.05), mats.gear, spine, k * 0.085, 0.24, -0.175)); // mag pouches
  mesh(B.pouchGeometry(0.06, 0.13, 0.05), mats.gear, spine, -0.13, 0.4, -0.16); // radio
  mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.22, 5), mats.dark, spine, -0.15, 0.55, -0.15); // antenna
  [-1, 1].forEach((s) => mesh(rbox(0.055, 0.03, 0.3, 0.012), mats.gear, spine, s * 0.11, 0.52, -0.01)); // shoulder straps
  mesh(rbox(0.22, 0.016, 0.01, 0.004), mats.glow, spine, 0, 0.44, -0.163); // light strip
  mesh(rbox(0.12, 0.05, 0.02, 0.008), mats.accent2, spine, -0.07, 0.4, -0.164); // patch
  mesh(rbox(0.26, 0.08, 0.04, 0.012), mats.gear, spine, 0, 0.5, 0.135); // drag handle
  // neck and head
  const neck = new THREE.Group();
  neck.position.y = 0.55;
  spine.add(neck);
  const collar = mesh(new THREE.CylinderGeometry(0.062, 0.085, 0.07, 20, 1, true), Object.assign(mats.suit.clone(), { side: THREE.DoubleSide }), neck, 0, 0.025, 0.008); // jacket collar
  collar.scale.set(1, 1, 0.92);
  const head = new THREE.Group();
  head.position.y = 0.16;
  neck.add(head);
  const detail = opts.detail || 'high';
  mesh(HD.headMesh(agentId.length % 3, detail), mats.skin, head, 0, 0, 0);
  [-1, 1].forEach((s) => {
    const eye = new THREE.Group();
    eye.position.set(0.028 * s, 0.016, -0.0785);
    eye.scale.setScalar(0.0108);
    head.add(eye);
    mesh(B.eyeGeometry(), mats.eye, eye, 0, 0, 0, false);
    mesh(B.lidGeometry(true), mats.skin, eye, 0, 0, 0, false);
    mesh(B.lidGeometry(false), mats.skin, eye, 0, 0, 0, false);
  });
  // arms (IK-driven): shoulder pivots, upper arm along -y, elbow, forearm, gloved hand
  const UPPER = 0.29; const LOWER = 0.27;
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(0.205 * s, 0.47, -0.02);
    spine.add(sh);
    mesh(B.curvedPlate(0.11, 0.07, 0.12, 2.2, 0.025), mats.plate, sh, 0.022 * s, 0.03, 0).rotation.z = -0.35 * s; // shoulder pad
    mesh(B.pouchGeometry(0.035, 0.06, 0.07), mats.gear, sh, 0.05 * s, -0.1, 0); // sleeve pocket
    const el = new THREE.Group();
    el.position.y = -UPPER;
    sh.add(el);
    mesh(B.padGeometry(0.04), mats.dark, el, 0, -0.01, 0.035).rotation.x = Math.PI; // elbow pad
    mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.07, 14), mats.glove, el, 0, -LOWER + 0.035, 0); // glove cuff
    const hand = new THREE.Group();
    hand.position.y = -LOWER;
    el.add(hand);
    mesh(SK.handMesh(1), mats.glove, hand, 0, 0, 0);
    return { sh, el, hand, s };
  });
  outfit(agentId, { head, spine, hips: legRoot, mats, arms, legs, detail });
  // the body itself: one continuous skinned mesh (skin.js) bound to the rig, so joints bend smoothly
  const bones = [legRoot, spine, neck, arms[0].sh, arms[1].sh, arms[0].el, arms[1].el, legs[0].hip, legs[1].hip, legs[0].knee, legs[1].knee].map((g) => { const b = new THREE.Bone(); g.add(b); return b; });
  const bodyKey = `${agentId}|${skinTone}|${detail}`;
  let bodyGeo = BODY_CACHE.get(bodyKey);
  if (!bodyGeo) {
    bodyGeo = SK.colouredBody(SK.bodyGeometry(1, detail), ag.suit || '#2a2e38', ag.suit2 || '#3a3f4c', skinTone);
    bodyGeo.userData.shared = true;
    BODY_CACHE.set(bodyKey, bodyGeo);
  }
  if (!BODY_CLOTH) { BODY_CLOTH = cloth.clone(); BODY_CLOTH.repeat.set(1, 1); BODY_CLOTH.needsUpdate = true; }
  mats.body = F('#ffffff', { vertexColors: true, normalMap: BODY_CLOTH, normalScale: new THREE.Vector2(0.7, 0.7) });
  const body = new THREE.SkinnedMesh(bodyGeo, mats.body);
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  root.add(body);
  arms.forEach((a) => { a.sh.rotation.set(0, 0, a.s * SK.A_POSE); });
  root.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton(bones));
  arms.forEach((a) => { a.sh.rotation.set(0, 0, 0); });
  const gunHolder = new THREE.Group();
  gunHolder.position.set(0.07, 0.37, -0.33);
  spine.add(gunHolder);
  return {
    root, hips, legRoot, spine, neck, head, legs, arms, gunHolder, mats, rim: rimColor, UPPER, LOWER,
    phase: 0, speed: 0, crouch: 0, death: 0, gunId: null, gun: null, agent: agentId, legYaw: 0, flinch: 0, air: 0, mx: 0, mz: 0,
  };
}

// a flared coat tail wrapped around the back of the hips (open cylinder segment, cloth both sides)
// a curved band in front of the face (visors, masks): an open cylinder arc centred on -z
function visor(r, h, arc, mat, parent, y, z) {
  const m = mesh(new THREE.CylinderGeometry(r, r * 0.96, h, 40, 1, true, Math.PI - arc / 2, arc), mat, parent, 0, y, z);
  if (!mat.userData.ds) { mat.side = THREE.DoubleSide; mat.userData.ds = true; }
  return m;
}

// hanging cloth: a flared open cylinder arc whose hem ripples into folds that deepen toward the bottom
function drape(r0, r1, h, a0, al, folds) {
  const g = new THREE.CylinderGeometry(r0, r1, h, 64, 10, true, a0, al);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const t = 0.5 - y / h; // 0 top, 1 bottom
    const th = Math.atan2(x, z);
    const k = 1 + Math.sin((th - a0) / al * Math.PI * folds) * 0.09 * t * t;
    p.setXYZ(i, x * k, y - Math.sin((th - a0) / al * Math.PI * 2.3) * 0.01 * t, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function coatTail(hips, mats, h, y) {
  if (!mats.cloth2) { mats.cloth2 = mats.accent.clone(); mats.cloth2.side = THREE.DoubleSide; mats.cloth2.color.multiplyScalar(0.85); mats.cloth2.roughness = 0.75; mats.cloth2.metalness = 0; }
  const g = drape(0.17, 0.23, h, -Math.PI * 0.42, Math.PI * 0.84, 6);
  return mesh(g, mats.cloth2, hips, 0, y, 0.0);
}

function outfit(id, { head, spine, hips, mats, arms, detail }) {
  const hairCap = (sc = [1, 1, 1], style = id.length % 3) => { const h = mesh(HD.hairMesh(id.length % 3, style, detail), mats.hair, head, 0, 0, 0); h.scale.set(sc[0], Math.min(sc[1], 1.04), sc[2]); return h; };
  switch (id) {
    case 'vex': {
      hairCap([1, 1, 1], 3);
      // goggles pushed up on the forehead: strap, two lens cups with glowing glass
      const strap = mesh(new THREE.TorusGeometry(0.081, 0.0055, 6, 40), mats.dark, head, 0, 0.066, 0.004); strap.rotation.x = Math.PI / 2 + 0.28; strap.scale.set(1.0, 1.17, 1);
      [-1, 1].forEach((s) => {
        const cup = mesh(new THREE.CylinderGeometry(0.021, 0.024, 0.02, 20), mats.dark, head, 0.031 * s, 0.071, -0.079); cup.rotation.x = -(Math.PI / 2 - 0.55);
        const lens = mesh(new THREE.CircleGeometry(0.0175, 20), mats.glow, head, 0.031 * s, 0.0768, -0.0886); lens.rotation.x = Math.PI + 0.55;
      });
      mesh(rbox(0.024, 0.01, 0.012, 0.004), mats.dark, head, 0, 0.073, -0.084); // bridge
      coatTail(hips, mats, 0.24, -0.1); // jacket tails
      break;
    }
    case 'mirage': {
      if (!mats.cloth2) { mats.cloth2 = mats.accent.clone(); mats.cloth2.side = THREE.DoubleSide; mats.cloth2.roughness = 0.8; mats.cloth2.metalness = 0; mats.cloth2.normalMap = B.clothNormal(); }
      mesh(HD.headwear('hood', detail), mats.cloth2, head, 0, 0, 0);
      mesh(HD.headwear('mask', detail, id.length % 3), mats.dark, head, 0, 0, 0); // face mask over mouth and nose
      // flowing cape: a flared cloth tube segment hanging from the shoulders down the back
      if (!mats.cloth2) { mats.cloth2 = mats.accent.clone(); mats.cloth2.side = THREE.DoubleSide; mats.cloth2.roughness = 0.8; mats.cloth2.metalness = 0; mats.cloth2.normalMap = B.clothNormal(); }
      const cape = mesh(drape(0.19, 0.31, 0.86, -Math.PI * 0.42, Math.PI * 0.84, 9), mats.cloth2, spine, 0, 0.08, 0.02);
      cape.rotation.x = 0.08;
      break;
    }
    case 'echo': {
      hairCap([1, 1, 1], 0);
      mesh(HD.headwear('cap', detail), mats.accent, head, 0, 0, 0); // field cap with a curved peak
      mesh(rbox(0.27, 0.34, 0.13, 0.04), mats.gear, spine, 0, 0.3, 0.2); // backpack
      mesh(cyl(0.006, 0.006, 0.42, 5), mats.dark, spine, 0.1, 0.64, 0.22);
      mesh(sph(0.022, 6, 6), mats.glow, spine, 0.1, 0.86, 0.22);
      const mono = mesh(new THREE.TorusGeometry(0.017, 0.003, 8, 24), mats.dark, head, -0.028, 0.016, -0.1); // monocle display
      mesh(new THREE.CircleGeometry(0.016, 24), mats.glow, mono, 0, 0, 0.001).rotation.y = Math.PI;
      mesh(rbox(0.006, 0.006, 0.07, 0.002), mats.dark, head, -0.055, 0.02, -0.07).rotation.y = 0.5;
      break;
    }
    case 'halo': {
      const helm = mesh(B.helmetGeometry(), mats.accent, head, 0, 0.012, 0.008);
      helm.scale.set(0.118, 0.122, 0.118);
      mesh(HD.headwear('band', detail, id.length % 3), mats.visor || (mats.visor = new THREE.MeshPhysicalMaterial({ color: '#0b0d12', roughness: 0.08, metalness: 0.4, clearcoat: 1, emissive: mats.glow.emissive, emissiveIntensity: 0.25 })), head, 0, 0, 0); // tinted visor
      arms.forEach(({ sh, s }) => { const p = mesh(rbox(0.15, 0.08, 0.17, 0.03), mats.accent2, sh, 0.035 * s, 0.06, 0); p.rotation.z = -0.35 * s; });
      break;
    }
    case 'solace': {
      hairCap([1.05, 1.1, 1.1]);
      mesh(new THREE.TorusGeometry(0.12, 0.009, 6, 28), mats.glow, head, 0, 0.24, 0).rotation.x = Math.PI / 2;
      const tail = mesh(cap(0.04, 0.14), mats.hair, head, 0, -0.03, 0.12); tail.rotation.x = 0.4; // ponytail
      // long medic tabard, front and back, flaring over the legs
      [0, Math.PI].forEach((ry) => { const t = mesh(drape(0.17, 0.25, 0.5, Math.PI * 0.62, Math.PI * 0.76, 7), mats.cloth2 || (mats.cloth2 = Object.assign(mats.accent2.clone(), { side: THREE.DoubleSide, normalMap: B.clothNormal() })), hips, 0, -0.26, 0); t.rotation.y = ry; });
      break;
    }
    case 'riot': {
      mesh(HD.headwear('mohawk', detail), mats.accent, head, 0, 0, 0);
      mesh(HD.headwear('mask', detail, id.length % 3), mats.dark, head, 0, 0, 0); // respirator
      [-1, 1].forEach((s) => { const f = mesh(cyl(0.014, 0.016, 0.022, 18), mats.accent2, head, s * 0.04, -0.064, -0.098); f.rotation.x = Math.PI / 2 - 0.3; f.rotation.z = -s * 0.6; }); // filters
      const b = mesh(rbox(0.05, 0.62, 0.025, 0.01), mats.gear, spine, 0, 0.3, -0.16); b.rotation.z = 0.6; // bandolier
      for (let k = 0; k < 9; k++) { const sh = mesh(cyl(0.008, 0.008, 0.045, 8), mats.accent2, b, 0, -0.24 + k * 0.06, -0.016); sh.rotation.z = Math.PI / 2; } // shells
      break;
    }
    case 'nova': {
      hairCap([1, 1.08, 1.1]);
      const bun = mesh(sph(0.05, 10, 8), mats.hair, head, 0, 0.1, 0.08);
      bun.scale.set(1, 0.8, 1);
      mesh(HD.headwear('band', detail, id.length % 3), mats.glow, head, 0, 0.006, -0.002).scale.set(1.02, 0.6, 1); // visor band
      mesh(new THREE.TorusGeometry(0.21, 0.012, 6, 32, Math.PI), mats.glow, spine, 0, 0.46, 0.13).rotation.x = -0.3; // halo arc behind
      coatTail(hips, mats, 0.3, -0.13);
      break;
    }
    case 'warden': {
      const helm = mesh(B.helmetGeometry(), mats.dark, head, 0, 0.012, 0.008);
      helm.scale.set(0.12, 0.123, 0.12);
      // full gas mask: rubber face piece, glass eye band and a front filter canister
      mesh(HD.headwear('mask', detail, id.length % 3), mats.dark, head, 0, 0, 0);
      mesh(HD.headwear('band', detail, id.length % 3), mats.visor || (mats.visor = new THREE.MeshPhysicalMaterial({ color: '#10161a', roughness: 0.05, metalness: 0.3, clearcoat: 1, emissive: mats.glow.emissive, emissiveIntensity: 0.35 })), head, 0, 0, 0);
      const can = mesh(cyl(0.024, 0.026, 0.04, 20), mats.accent, head, 0, -0.072, -0.11); can.rotation.x = Math.PI / 2 - 0.5;
      mesh(cyl(0.02, 0.02, 0.006, 20), mats.metal, can, 0, 0.022, 0);
      const tank = mesh(cap(0.065, 0.24, 16), mats.accent2, spine, 0.06, 0.32, 0.2); tank.rotation.z = 0.1; // tank
      [-0.08, 0.08].forEach((y) => mesh(new THREE.TorusGeometry(0.066, 0.006, 6, 24), mats.dark, tank, 0, y, 0).rotation.x = Math.PI / 2);
      mesh(cyl(0.012, 0.012, 0.04, 10), mats.metal, tank, 0, 0.2, 0);
      break;
    }
    default: hairCap(); break;
  }
}

// two-bone IK in spine space: point the upper arm and forearm so the hand lands on `t`
const _v = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3() };
const _q = new THREE.Quaternion(); const _q2 = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
function armIK(arm, t, pole, A, B) {
  const S = arm.sh.position;
  const d = _v.a.subVectors(t, S);
  let L = d.length();
  L = clamp(L, 0.05, A + B - 0.002);
  d.normalize();
  const x = (A * A - B * B + L * L) / (2 * L);
  const h = Math.sqrt(Math.max(0, A * A - x * x));
  // pole direction orthogonal to the reach line
  const p = _v.b.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
  const E = _v.c.copy(S).addScaledVector(d, x).addScaledVector(p, h);
  const up = _v.d.subVectors(E, S).normalize();
  arm.sh.quaternion.setFromUnitVectors(DOWN, up);
  const T = _v.e.copy(S).addScaledVector(d, L);
  const fore = T.sub(E).normalize();
  _q.setFromUnitVectors(DOWN, fore);
  _q2.copy(arm.sh.quaternion).invert();
  arm.el.quaternion.copy(_q2.multiply(_q));
  arm.hand.rotation.set(0, 0, 0);
}

const _t = new THREE.Vector3(); const _pole = new THREE.Vector3();
// pose a rig each frame. s: { speed, mx, mz (move dir relative to facing: +mz forward, +mx right), crouch,
// pitch, dt, aimRecoil, alive, ground, deathDir }
export function animateAgent(rig, s) {
  const dt = s.dt;
  rig.speed = damp(rig.speed, s.speed, 10, dt);
  rig.crouch = damp(rig.crouch, s.crouch, 12, dt);
  rig.air = damp(rig.air, s.ground === false ? 1 : 0, 10, dt);
  rig.flinch = Math.max(0, rig.flinch - dt * 4);
  const sp = rig.speed;
  const c = rig.crouch;
  // legs turn toward the movement direction (up to ~50°), running backwards keeps the hips facing forward
  let mx = s.mx || 0; let mz = s.mz || 0;
  let back = false;
  if (sp > 0.4) {
    if (mz < -0.3) { back = true; mx = -mx; mz = -mz; }
    const yaw = clamp(Math.atan2(-mx, mz), -0.9, 0.9);
    rig.legYaw = damp(rig.legYaw, yaw, 8, dt);
  } else rig.legYaw = damp(rig.legYaw, 0, 6, dt);
  rig.legRoot.rotation.y = rig.legYaw;
  rig.phase += dt * (2.2 + sp * 1.75) * (back ? -1 : 1);
  const swing = clamp(sp / 5.4, 0, 1) * (0.75 - c * 0.35);
  rig.hips.position.y = 0.95 - c * 0.36 + Math.abs(Math.sin(rig.phase)) * 0.035 * clamp(sp / 5, 0, 1) - rig.air * 0.03;
  rig.legs.forEach((l, k) => {
    const ph = rig.phase + (k ? Math.PI : 0);
    const run = Math.sin(ph) * swing;
    const lift = Math.max(0, Math.sin(ph + 1.3)) * swing * 1.3;
    l.hip.rotation.x = run + c * 1.15 + rig.air * (k ? 0.25 : 0.8);
    l.knee.rotation.x = -(lift + c * 2.0 + rig.air * (k ? 0.5 : 1.1));
    l.foot.rotation.x = c * 0.85 - Math.max(0, -Math.sin(ph)) * swing * 0.3;
    l.hip.rotation.z = (k ? -1 : 1) * (0.03 + c * 0.1);
  });
  // upper body: counter-rotate the legs' turn so the aim stays on target, lean into the aim and the run
  const pitch = s.pitch || 0;
  const breathe = Math.sin(performance.now() * 0.0018) * 0.012 * (1 - clamp(sp, 0, 1));
  rig.spine.rotation.set(pitch * 0.5 - c * 0.15 + clamp(sp / 5.4, 0, 1) * 0.08 * (back ? -1 : 1) + breathe - rig.flinch * 0.25, -rig.legYaw, Math.sin(rig.phase) * 0.03 * swing);
  rig.neck.rotation.set(pitch * 0.4 + rig.flinch * 0.2, 0, rig.flinch * 0.15);
  if (!s.alive) {
    // dying: fall in the direction of the hit and settle; arms go limp
    rig.death = Math.min(1, rig.death + dt * 2.4);
    const e = 1 - (1 - rig.death) ** 3;
    const dir = s.deathDir ?? 1; // 1 = backwards
    rig.hips.rotation.x = e * 1.5 * dir;
    rig.hips.position.y = 0.95 - e * 0.8 - c * 0.2;
    rig.legs.forEach((l, k) => { l.hip.rotation.x = -e * 0.25 * dir + (k ? 0.3 : 0) * e; l.knee.rotation.x = -e * (k ? 0.9 : 0.3); });
    rig.arms.forEach((a) => { a.sh.quaternion.setFromEuler(new THREE.Euler(-e * 1.4 * dir, 0, a.s * e * 0.9)); a.el.quaternion.identity(); a.el.rotation.x = e * 0.4; });
    rig.gunHolder.visible = rig.death < 0.4;
    return;
  }
  if (rig.death > 0) { rig.death = 0; rig.hips.rotation.x = 0; rig.gunHolder.visible = true; }
  // the gun: placement by weapon type, raised with the aim, kicks with recoil
  const cat = (WEAPON[rig.gunId] || WEAPON.wasp).cat;
  const H = HOLD[cat] || HOLD.rifle;
  const rec = s.aimRecoil || 0;
  const runLow = clamp(sp / 5.4, 0, 1) * 0.12 * (cat === 'sidearm' ? 0.5 : 1);
  rig.gunHolder.position.set(H.pos[0], H.pos[1] - runLow * 0.3, H.pos[2] + rec * 0.05);
  rig.gunHolder.rotation.set(pitch * 0.5 + rec * 0.25 - runLow, cat === 'melee' ? 0.3 : 0, 0);
  rig.gunHolder.updateMatrix();
  // hands on the gun
  const [L, R] = rig.arms;
  _t.set(...H.grip).applyMatrix4(rig.gunHolder.matrix);
  armIK(R, _t, _pole.set(0.6, -1, 0.35), rig.UPPER, rig.LOWER + 0.03);
  if (H.fore) {
    _t.set(...H.fore).applyMatrix4(rig.gunHolder.matrix);
    armIK(L, _t, _pole.set(-0.5, -1, 0.1), rig.UPPER, rig.LOWER + 0.03);
  } else {
    _t.set(-0.25, 0.08, -0.12);
    armIK(L, _t, _pole.set(-0.3, -0.2, 1), rig.UPPER, rig.LOWER + 0.03);
  }
}

export function hitFlinch(rig) { rig.flinch = 1; }

export function setAgentGun(rig, gunId, skin = null) {
  const key = `${gunId}|${skin ? skin.id : ''}`;
  if (rig.gunKey === key) return;
  rig.gunKey = key;
  rig.gunId = gunId;
  if (rig.gun) { rig.gunHolder.remove(rig.gun); disposeTree(rig.gun); }
  rig.gun = buildGun(gunId, { world: true, color: skin && skin.color, glow: skin && skin.glow });
  rig.gunHolder.add(rig.gun);
}

export function disposeTree(o) {
  o.traverse((m) => {
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => { if (!x.userData.shared) x.dispose(); });
  });
}

// ───────────── weapons ─────────────
// Guns point down -z; the grip is at the origin. A child named 'muzzle' marks the barrel end,
// 'mag' is the magazine (animated on reload). Side profiles are extruded shapes with bevelled edges,
// so silhouettes read like real hardware rather than boxes.

// surface micro-detail: brushed/bead-blasted metal and stippled polymer (normal + roughness variation)
const GUN_TEX = {};
function gunTex(kind) {
  if (GUN_TEX[kind]) return GUN_TEX[kind];
  const S = 256; const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); const img = g.createImageData(S, S);
  const h = new Float32Array(S * S);
  let seed = kind === 'metal' ? 11 : 23;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < h.length; i++) h[i] = r();
  if (kind === 'metal') { // brushed along u: blur each row
    for (let y = 0; y < S; y++) { let a = 0; for (let k = 0; k < 2; k++) for (let x = 0; x < S; x++) { a = a * 0.85 + h[y * S + x] * 0.15; h[y * S + x] = a; } }
  } else { // stipple: blobs
    for (let k = 0; k < 900; k++) { const cx = r() * S; const cy = r() * S; for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) { const d = x * x + y * y; if (d < 9) { const i = (((Math.floor(cy) + y) + S) % S) * S + (((Math.floor(cx) + x) + S) % S); h[i] += (1 - d / 9) * 0.8; } } }
  }
  const H = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  const k = kind === 'metal' ? 1.2 : 1.6;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x - 1, y) - H(x + 1, y)) * k; const dy = (H(x, y - 1) - H(x, y + 1)) * k; const l = Math.hypot(dx, dy, 1); const i = (y * S + x) * 4;
    img.data[i] = (dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  GUN_TEX[kind] = t;
  return t;
}

const GUN_MATS = new Map();
function gunMats(id, opts) {
  const key = `${id}|${opts.color || ''}|${opts.glow || ''}`;
  if (GUN_MATS.has(key)) return GUN_MATS.get(key);
  const w = WEAPON[id] || WEAPON.wasp;
  const m = {
    metal: new THREE.MeshStandardMaterial({ color: '#2a2c31', roughness: 0.42, metalness: 0.85, normalMap: gunTex('metal'), normalScale: new THREE.Vector2(0.35, 0.35) }),
    steel: new THREE.MeshStandardMaterial({ color: '#7a7f88', roughness: 0.28, metalness: 0.95, normalMap: gunTex('metal'), normalScale: new THREE.Vector2(0.25, 0.25) }),
    poly: new THREE.MeshStandardMaterial({ color: '#2c2f34', roughness: 0.82, metalness: 0.02, normalMap: gunTex('poly'), normalScale: new THREE.Vector2(0.22, 0.22) }),
    skin: new THREE.MeshPhysicalMaterial({ color: opts.color || GUN_COLORS[w.id] || '#c9cbd1', roughness: 0.38, metalness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.18, normalMap: gunTex('poly'), normalScale: new THREE.Vector2(0.06, 0.06) }),
    glow: new THREE.MeshStandardMaterial({ color: '#000', emissive: opts.glow || '#5ef2ff', emissiveIntensity: 3.4 }),
    glass: new THREE.MeshStandardMaterial({ color: '#3a6a7a', roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.35 }),
    dot: new THREE.MeshBasicMaterial({ color: '#ff3040' }),
    dark: new THREE.MeshStandardMaterial({ color: '#0d0e10', roughness: 0.6, metalness: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.95, metalness: 0, normalMap: gunTex('poly'), normalScale: new THREE.Vector2(0.4, 0.4) }),
    brass: new THREE.MeshStandardMaterial({ color: '#b8893a', roughness: 0.3, metalness: 1 }),
  };
  Object.values(m).forEach((x) => { x.userData.shared = true; });
  GUN_MATS.set(key, m);
  return m;
}

export function buildGun(id, opts = {}) {
  const w = WEAPON[id] || WEAPON.wasp;
  const g = new THREE.Group();
  const m = gunMats(w.id, opts);
  const K = G.makeKit(g, m, !opts.view);
  const P = G.parts(K, m);
  const muzzle = new THREE.Object3D();
  const mag = new THREE.Group();
  g.add(muzzle, mag);
  const out = G.buildWeapon(w, K, P, m, mag);
  muzzle.position.set(0, out.muzzle[0], out.muzzle[1]);
  muzzle.name = 'muzzle';
  mag.name = 'mag';
  g.userData.muzzle = muzzle;
  g.userData.mag = mag;
  if (out.slide) { g.userData.slide = out.slide; out.slide.userData.z0 = out.slide.position.z; }
  return g;
}

const GUN_COLORS = {
  wasp: '#c8ccd4', hornet: '#d8a040', mamba: '#5f6b7a', magnum: '#b7a27a', swift: '#43c6b4', breaker: '#a8613a',
  ranger: '#7f8f6a', sentinel: '#d0d3d8', falcon: '#e2c86a', raptor: '#4c5562', scout: '#b5b8bd', longbow: '#3e4b5c', anvil: '#7a6a58', knife: '#d8dde5',
  bolt: '#8a5a3a', viper: '#5b8a3c', tempest: '#3f4a5a', marshal: '#9a8f78',
};

// first-person arms holding a gun
export function buildViewModel(gunId, agentId, skin = null) {
  const ag = AGENT[agentId] || AGENT.vex;
  const g = new THREE.Group();
  const gun = buildGun(gunId, { view: true, color: skin && skin.color, glow: skin && skin.glow });
  g.add(gun);
  const cloth = B.clothNormal();
  const sleeve = new THREE.MeshStandardMaterial({ color: ag.suit || '#2a2e38', roughness: 0.9, normalMap: cloth, normalScale: new THREE.Vector2(0.6, 0.6) });
  const cuff = new THREE.MeshStandardMaterial({ color: ag.color, roughness: 0.45, metalness: 0.15 });
  const glove = new THREE.MeshStandardMaterial({ color: '#1d1e22', roughness: 0.65, normalMap: cloth, normalScale: new THREE.Vector2(0.3, 0.3) });
  const knuckle = new THREE.MeshStandardMaterial({ color: '#2a2c31', roughness: 0.5, metalness: 0.1 });
  const w = WEAPON[gunId] || WEAPON.wasp;
  const Y = new THREE.Vector3(0, -1, 0);
  // A gloved hand wrapped around a bar (pistol grip or handguard). The hand's knuckle line runs along the
  // bar's axis, the fingers point along `fingers` and the palm faces `palm`; the hand is placed so the bar
  // sits inside the curled fingers. mirror flips the hand (thumb on the other side).
  const hold = (bar, fingers, palm, mirror, curl = 1) => {
    const ny = fingers.clone().normalize().negate();
    const nz = palm.clone().normalize().negate();
    nz.addScaledVector(ny, -nz.dot(ny)).normalize();
    const nx = new THREE.Vector3().crossVectors(ny, nz);
    const R = new THREE.Matrix4().makeBasis(nx, ny, nz);
    const hand = new THREE.Group();
    hand.quaternion.setFromRotationMatrix(R);
    if (mirror) hand.scale.x = -1;
    const off = new THREE.Vector3(0, -0.088, -0.024).applyQuaternion(hand.quaternion);
    if (mirror) off.set(0, -0.088, -0.024).applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1)).applyQuaternion(hand.quaternion);
    hand.position.copy(bar).sub(off);
    g.add(hand);
    mesh(SK.handMesh(curl), glove, hand, 0, 0, 0, false);
    return hand;
  };
  // a sleeved forearm from the elbow (off screen) to the wrist of a hand, with cuff and gauntlet
  const forearm = (elbow, hand) => {
    const wrist = hand.position.clone().add(new THREE.Vector3(0, 0.01, 0).applyQuaternion(hand.quaternion));
    const dir = new THREE.Vector3().subVectors(wrist, elbow);
    const len = dir.length();
    dir.normalize();
    const arm = new THREE.Group();
    arm.position.copy(elbow);
    arm.quaternion.setFromUnitVectors(Y, dir);
    g.add(arm);
    const f = mesh(B.foreArmGeometry(0.27), sleeve, arm, 0, 0, 0, false);
    f.scale.set(1.08, len / 0.27, 1.08);
    mesh(new THREE.CylinderGeometry(0.047, 0.045, 0.035, 18), cuff, arm, 0, -len + 0.085, 0, false);
    mesh(new THREE.CylinderGeometry(0.041, 0.035, 0.085, 18), glove, arm, 0, -len + 0.03, 0, false);
    return arm;
  };
  const grip = new THREE.Vector3(0, -0.07, 0.035);
  // where the support hand closes: the centre of the handguard / pump / forend it wraps around
  const FORE = { sidearm: null, smg: [0, 0.01, -0.27], rifle: [0, 0.006, -0.31], shotgun: [0, 0.0, -0.36], sniper: [0, 0.0, -0.33], heavy: [0, -0.05, -0.265] };
  const fore = FORE[w.cat] ? new THREE.Vector3(...FORE[w.cat]) : null;
  // right hand: knuckles down the grip, fingers forward around its front, palm against its right side
  const rh = hold(grip, new THREE.Vector3(-0.15, -0.05, -1), new THREE.Vector3(-1, 0, 0.1), true);
  forearm(new THREE.Vector3(0.2, -0.4, 0.4), rh);
  if (w.cat === 'sidearm') {
    // support hand cupping from the left, fingers over the right hand's
    const lh = hold(new THREE.Vector3(-0.03, -0.085, 0.03), new THREE.Vector3(0.25, -0.1, -1), new THREE.Vector3(1, 0, 0.15), false);
    forearm(new THREE.Vector3(-0.22, -0.4, 0.38), lh);
  } else if (w.cat === 'heavy') {
    // support hand round the vertical foregrip, like the firing hand on the pistol grip
    const lh = hold(fore, new THREE.Vector3(0.15, -0.05, -1), new THREE.Vector3(1, 0, 0.1), false);
    forearm(new THREE.Vector3(-0.24, -0.42, fore.z + 0.38), lh);
  } else if (fore) {
    // support hand under the handguard, palm up, fingers wrapping up its right side
    const lh = hold(fore, new THREE.Vector3(1, 0.15, 0), new THREE.Vector3(-0.1, 1, 0), false, 0.85);
    forearm(new THREE.Vector3(-0.26, -0.4, fore.z + 0.42), lh);
  }
  g.userData.gun = gun;
  g.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
  return g;
}

// ───────────── devices ─────────────
export function buildCore() {
  // the Core: a ruggedised device on a hex base plate — armoured housing with a window onto a glowing
  // energy cell, carry handles, a status display, coiled cables and a short antenna
  const g = new THREE.Group();
  const m = {
    metal: new THREE.MeshStandardMaterial({ color: '#30343c', roughness: 0.38, metalness: 0.75, normalMap: B.webbingNormal(), normalScale: new THREE.Vector2(0.08, 0.08) }),
    plate: new THREE.MeshStandardMaterial({ color: '#6b6f75', roughness: 0.45, metalness: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#dfe6ee', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, clearcoat: 1 }),
    hazard: new THREE.MeshStandardMaterial({ color: '#e0b020', roughness: 0.6 }),
    screen: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff6a5a', emissiveIntensity: 1.2 }),
  };
  const glowMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff4655', emissiveIntensity: 2.5 });
  const K = G.makeKit(g, { ...m, glow: glowMat }, true);
  // hex base with feet
  K.lathe([[0, 0], [0.27, 0], [0.28, 0.012], [0.28, 0.035], [0.26, 0.045], [0, 0.045]].map(([r, h]) => [r, h]), m.metal, 0, 0, { seg: 6 }).rotation.set(Math.PI / 2, 0, 0);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; K.cyl(0.03, 0.035, 0.02, m.rubber, Math.cos(a) * 0.24, 0.01, Math.sin(a) * 0.24, { seg: 12 }); }
  // housing: lower drum, window band with the energy cell, upper drum
  const d1 = K.lathe([[0, 0], [0.19, 0], [0.2, 0.01], [0.2, 0.13], [0.19, 0.14], [0, 0.14]], m.metal, 0, 0, { seg: 40 }); d1.rotation.set(Math.PI / 2, 0, 0); d1.position.y = 0.045;
  const cell = K.cyl(0.1, 0.1, 0.16, glowMat, 0, 0.27, 0, { seg: 32 }); cell.castShadow = false;
  K.cyl(0.16, 0.16, 0.16, m.glass, 0, 0.27, 0, { seg: 40 }).castShadow = false;
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; K.box(0.03, 0.17, 0.03, m.plate, Math.cos(a) * 0.165, 0.27, Math.sin(a) * 0.165, { r: 0.006 }).rotation.y = -a; }
  const d2 = K.lathe([[0, 0], [0.18, 0], [0.19, 0.01], [0.19, 0.08], [0.15, 0.12], [0, 0.12]], m.metal, 0, 0, { seg: 40 }); d2.rotation.set(Math.PI / 2, 0, 0); d2.position.y = 0.35;
  // hazard bands and glowing seams
  K.cyl(0.202, 0.202, 0.02, m.hazard, 0, 0.1, 0, { seg: 40 });
  [0.185, 0.355].forEach((y) => K.cyl(0.205, 0.205, 0.012, glowMat, 0, y, 0, { seg: 40 }).castShadow = false);
  // carry handles on two sides
  [-1, 1].forEach((sd) => { const t = K.add(new THREE.TorusGeometry(0.07, 0.012, 8, 20, Math.PI), m.rubber); t.position.set(sd * 0.2, 0.42, 0); t.rotation.set(0, Math.PI / 2, 0); });
  // display and keypad on top
  K.box(0.14, 0.03, 0.1, m.plate, 0, 0.485, -0.02, { r: 0.008 });
  K.box(0.1, 0.004, 0.05, m.screen, 0, 0.502, -0.035, { r: 0 });
  for (let k = 0; k < 6; k++) K.box(0.018, 0.008, 0.014, m.rubber, -0.03 + (k % 3) * 0.03, 0.502, 0.01 + Math.floor(k / 3) * 0.02, { r: 0.003 });
  // antenna with the beacon light
  K.cyl(0.006, 0.004, 0.18, m.plate, 0.1, 0.56, 0.06, { seg: 8 });
  const light = K.add(new THREE.SphereGeometry(0.022, 14, 10), glowMat); light.position.set(0.1, 0.655, 0.06); light.castShadow = false;
  // cables looping from the top cap down into the base
  [[0.12, 0.6], [-0.15, 2.4], [0.02, 4.2]].forEach(([o, a]) => {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(Math.cos(a) * 0.15, 0.44, Math.sin(a) * 0.15), new THREE.Vector3(Math.cos(a + 0.3) * 0.27, 0.3 + o * 0.3, Math.sin(a + 0.3) * 0.27), new THREE.Vector3(Math.cos(a + 0.5) * 0.25, 0.08, Math.sin(a + 0.5) * 0.25)]);
    K.add(new THREE.TubeGeometry(c, 20, 0.011, 8), m.rubber);
  });
  g.userData.glow = glowMat;
  g.userData.light = light;
  return g;
}

export function buildTurret(team) {
  // watch turret: telescopic tripod, pan head, armoured sensor body with a lens, shrouded barrel, ammo can
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: '#d7dbe2', roughness: 0.42, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: '#25282e', roughness: 0.45, metalness: 0.65 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#131416', roughness: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#0a0c10', roughness: 0.04, metalness: 0.2, clearcoat: 1 });
  const eye = new THREE.MeshStandardMaterial({ color: '#000', emissive: team === 'red' ? '#ff4655' : '#3edbc4', emissiveIntensity: 2.5 });
  const K = G.makeKit(g, { metal: dark, steel: dark, glow: eye }, true);
  for (let k = 0; k < 3; k++) {
    const a = (k * 2 * Math.PI) / 3;
    const leg = new THREE.Group(); leg.position.set(0, 0.62, 0); leg.rotation.set(Math.sin(a) * 0.42, 0, -Math.cos(a) * 0.42); g.add(leg);
    K.lathe([[0.022, 0], [0.022, 0.32], [0.017, 0.33], [0.017, 0.66], [0.014, 0.67]].map(([r, h]) => [r, -h]), dark, 0, 0, { seg: 12, parent: leg }).rotation.set(Math.PI / 2, 0, 0);
    K.box(0.035, 0.03, 0.035, body, 0, -0.32, 0, { r: 0.008, parent: leg }); // leg lock
    const foot = K.add(new THREE.SphereGeometry(0.03, 12, 8), rubber, leg); foot.position.y = -0.67; foot.scale.y = 0.6;
  }
  K.cyl(0.06, 0.07, 0.07, dark, 0, 0.64, 0, { seg: 24 }); // hub
  const head = new THREE.Group();
  head.position.y = 0.76;
  g.add(head);
  K.cyl(0.05, 0.055, 0.06, dark, 0, -0.07, 0, { seg: 24, parent: head }); // pan bearing
  K.add(new RoundedBoxGeometry(0.3, 0.2, 0.36, 3, 0.05), body, head);
  [-1, 1].forEach((sd) => { const p = K.add(new RoundedBoxGeometry(0.04, 0.17, 0.3, 2, 0.015), dark, head); p.position.set(sd * 0.165, 0, 0.0); }); // side armour
  K.box(0.2, 0.025, 0.24, dark, 0, 0.11, 0.0, { r: 0.008, parent: head }); // top plate
  // sensor: a bezel with a dark lens and a glowing ring
  const lens = K.cyl(0.045, 0.05, 0.03, dark, 0, 0.045, -0.18, { rx: Math.PI / 2, seg: 28, parent: head });
  K.cyl(0.035, 0.035, 0.006, glass, 0, 0.045, -0.197, { rx: Math.PI / 2, seg: 28, parent: head });
  const ring = K.add(new THREE.TorusGeometry(0.04, 0.004, 6, 32), eye, head); ring.position.set(0, 0.045, -0.198);
  void lens;
  // barrel with a vented shroud and muzzle
  K.lathe([[0.028, 0], [0.028, 0.2], [0.024, 0.21]], dark, -0.04, -0.17, { seg: 18, parent: head });
  for (let k = 0; k < 5; k++) K.box(0.06, 0.006, 0.02, rubber, 0, -0.012, -0.21 - k * 0.035, { r: 0.002, parent: head });
  K.lathe([[0.012, 0], [0.012, 0.2], [0.016, 0.2], [0.016, 0.24], [0.0, 0.24]], dark, -0.04, -0.37, { seg: 16, parent: head });
  // ammo can and feed on the left, antenna on top
  K.box(0.09, 0.12, 0.16, new THREE.MeshStandardMaterial({ color: '#4b5a3a', roughness: 0.7 }), -0.22, -0.06, 0.04, { r: 0.008, parent: head });
  K.cyl(0.004, 0.003, 0.2, dark, 0.08, 0.22, 0.12, { seg: 6, parent: head });
  K.box(0.12, 0.012, 0.004, eye, 0, 0.0, -0.181, { r: 0, parent: head }).position.y = -0.065;
  g.userData.head = head;
  return g;
}

// The sculpted meshes (bodies, heads, hair, headwear, hands) take a few hundred ms each to mesh the first
// time. Build them one at a time in idle moments while the menus are up, so a match starts without a stall.
export function warmModels(detail = 'high') {
  const jobs = [
    () => SK.bodyGeometry(1, detail), () => SK.handMesh(1), () => SK.handMesh(0.85),
    () => HD.headMesh(0, detail), () => HD.headMesh(1, detail),
    () => HD.hairMesh(0, 3, detail), () => HD.hairMesh(1, 1, detail), () => HD.hairMesh(0, 0, detail), () => HD.hairMesh(1, 0, detail),
    () => HD.headwear('hood', detail), () => HD.headwear('cap', detail), () => HD.headwear('mohawk', detail),
    () => HD.headwear('mask', detail, 0), () => HD.headwear('mask', detail, 1), () => HD.headwear('band', detail, 0), () => HD.headwear('band', detail, 1),
  ];
  const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 0 }), 60));
  const next = () => { const j = jobs.shift(); if (!j) return; try { j(); } catch (e) { /* built on demand instead */ } idle(next, { timeout: 400 }); };
  idle(next, { timeout: 1500 });
}
