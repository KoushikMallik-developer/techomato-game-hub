// Core Breach agents as downloaded 3D characters: KayKit "Adventurers" (CC0, public/models/corebreach, credits in CREDITS.txt).
// Five hero models share one rig and one animation library (kept in Knight.glb); the other agents are recoloured copies.
// Each frame the animation is built from clips: the legs blend idle / walk / run / strafe / backwards by how the agent moves,
// the upper body plays an aiming pose for the weapon in hand, the aim pitch is added on top of the spine, and the gun sits in the right hand.
// Dying plays a death clip. If the files fail to load, buildModelAgent returns null and models.js builds the built-in procedural agent instead.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { WEAPON, clamp, damp } from './data.js';
import { assetBase } from '../../config.js';

// agent -> [model file, outfit hue shift in degrees]
const CHAR = {
  vex: ['Barbarian', 0], mirage: ['Mage', 0], echo: ['Rogue_Hooded', 0], halo: ['Knight', 0],
  solace: ['Knight', 140], riot: ['Barbarian', 200], nova: ['Mage', 120], warden: ['Rogue', 70],
};
const HEIGHT = 1.78; // metres, the same as the player
const gltfs = new Map();
let CLIPS = null; // { lower, upper, death }

export function loadAgentModels(base = assetBase()) {
  const dir = `${base.replace(/\/?$/, '/')}models/corebreach/`;
  const loader = new GLTFLoader();
  return Promise.all([...new Set(Object.values(CHAR).map((c) => c[0]))].map(async (f) => {
    try {
      const res = await fetch(`${dir}${f}.glb`);
      if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) return; // SPA fallback page = file missing
      gltfs.set(f, await loader.parseAsync(await res.arrayBuffer(), dir));
    } catch (e) { console.warn(`Core Breach agent model ${f} could not be loaded`, e); }
  })).then(() => { CLIPS = makeClips(gltfs.get('Knight')); });
}

// split a full-body clip into a legs part and an upper-body part, so the two can be chosen separately
const LOWER = /^(hips|upperleg|lowerleg|foot|toes)/;
const UPPER = /^(spine|chest|upperarm|lowerarm|wrist|hand|head)/;
function part(clip, re, tag) {
  const tracks = clip.tracks.filter((t) => re.test(t.name.split('.')[0])).map((t) => t.clone());
  return new THREE.AnimationClip(`${clip.name}:${tag}`, clip.duration, tracks);
}
function makeClips(g) {
  if (!g) return null;
  const by = Object.fromEntries(g.animations.map((a) => [a.name, a]));
  const lowerNames = ['Idle', 'Walking_A', 'Running_A', 'Running_Strafe_Left', 'Running_Strafe_Right', 'Walking_Backwards', 'Jump_Idle'];
  const upperNames = ['2H_Ranged_Aiming', '1H_Ranged_Aiming', '2H_Melee_Idle'];
  if ([...lowerNames, ...upperNames, 'Death_A', 'Death_B'].some((n) => !by[n])) { console.warn('Core Breach agent animations missing'); return null; }
  const lower = {}; lowerNames.forEach((n) => { lower[n] = part(by[n], LOWER, 'lower'); });
  const upper = {}; upperNames.forEach((n) => { upper[n] = part(by[n], UPPER, 'upper'); });
  return { lower, upper, death: [by.Death_A, by.Death_B] };
}

// recolour a palette texture: clothes change hue, skin, leather and greys (low saturation or orange-brown hues) stay
const RECOLOURED = new Map();
function recolour(tex, shift) {
  const key = `${tex.uuid}|${shift}`;
  if (RECOLOURED.has(key)) return RECOLOURED.get(key);
  const img = tex.image;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const data = x.getImageData(0, 0, c.width, c.height);
  const p = data.data; const col = new THREE.Color(); const hsl = {};
  for (let i = 0; i < p.length; i += 4) {
    col.setRGB(p[i] / 255, p[i + 1] / 255, p[i + 2] / 255, THREE.SRGBColorSpace);
    col.getHSL(hsl, THREE.SRGBColorSpace);
    const deg = hsl.h * 360;
    if (hsl.s < 0.25 || (deg > 8 && deg < 55 && hsl.s < 0.85)) continue; // skin, leather, metal
    col.setHSL((hsl.h + shift / 360) % 1, hsl.s, hsl.l, THREE.SRGBColorSpace);
    p[i] = Math.round(col.r * 255); p[i + 1] = Math.round(col.g * 255); p[i + 2] = Math.round(col.b * 255);
  }
  x.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.anisotropy = tex.anisotropy;
  RECOLOURED.set(key, t);
  return t;
}

// edge glow in the team colour (red on enemies), the same look as the procedural agents
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

const X = new THREE.Vector3(1, 0, 0);
const _q = new THREE.Quaternion(); const _q2 = new THREE.Quaternion(); const _v = new THREE.Vector3();

export function buildModelAgent(agentId, team, opts = {}) {
  const [file, hue] = CHAR[agentId] || CHAR.vex;
  const g = gltfs.get(file);
  if (!g || !CLIPS) return null;
  const root = new THREE.Group();
  const pivot = new THREE.Group(); pivot.rotation.y = Math.PI; // the models face +z, the game faces -z
  const model = cloneSkinned(g.scene);
  pivot.add(model); root.add(pivot);
  const rim = { color: new THREE.Color(opts.rim || '#000000') };
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
    const m = o.material.clone();
    if (hue && m.map && m.map.image) m.map = recolour(m.map, hue);
    o.material = rimify(m, rim);
  });
  // stand them on the floor at player height
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  let h = box.max.y - box.min.y; let floor = box.min.y;
  if (!Number.isFinite(h) || h < 0.5) { // a mesh with a broken bounding box: size from the head and ankle bones instead
    const head = model.getObjectByName('head').getWorldPosition(new THREE.Vector3()).y;
    const ankle = Math.min(model.getObjectByName('footl').getWorldPosition(new THREE.Vector3()).y, model.getObjectByName('footr').getWorldPosition(new THREE.Vector3()).y);
    h = (head - ankle) * 1.3; floor = ankle - 0.05;
  }
  const k = HEIGHT / Math.max(0.5, h);
  pivot.scale.setScalar(k); pivot.position.y = -floor * k;
  root.updateMatrixWorld(true);
  // each bone the code bends on top of the clips, with the axis for "lean forward" (the character's side axis) in the bone's own frame
  const bones = {};
  ['spine', 'chest', 'head', 'upperlegl', 'upperlegr', 'lowerlegl', 'lowerlegr', 'footl', 'footr'].forEach((n) => {
    const b = model.getObjectByName(n);
    bones[n] = { b, axis: X.clone().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize() };
  });
  const hips = model.getObjectByName('hips');
  const mixer = new THREE.AnimationMixer(model);
  const act = (clip) => { const a = mixer.clipAction(clip); a.play(); a.setEffectiveWeight(0); return a; };
  const A = {
    idle: act(CLIPS.lower.Idle), walk: act(CLIPS.lower.Walking_A), run: act(CLIPS.lower.Running_A), sl: act(CLIPS.lower.Running_Strafe_Left), sr: act(CLIPS.lower.Running_Strafe_Right),
    back: act(CLIPS.lower.Walking_Backwards), air: act(CLIPS.lower.Jump_Idle),
    aim2: act(CLIPS.upper['2H_Ranged_Aiming']), aim1: act(CLIPS.upper['1H_Ranged_Aiming']), melee: act(CLIPS.upper['2H_Melee_Idle']),
  };
  const death = CLIPS.death.map((c) => { const a = mixer.clipAction(c); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; return a; });
  // the gun sits in the right hand slot: for each aiming pose, find the rotation that makes the gun point forward
  const slot = model.getObjectByName('handslotr');
  const holdQ = {};
  ['aim2', 'aim1', 'melee'].forEach((key) => {
    Object.values(A).forEach((a) => a.setEffectiveWeight(0));
    A.idle.setEffectiveWeight(1); A[key].setEffectiveWeight(1);
    mixer.setTime(0); mixer.update(0); root.updateMatrixWorld(true);
    holdQ[key] = slot.getWorldQuaternion(new THREE.Quaternion()).invert();
  });
  Object.values(A).forEach((a) => a.setEffectiveWeight(0));
  const gunHolder = new THREE.Group();
  gunHolder.scale.setScalar(1 / slot.getWorldScale(_v).x); // guns stay life-size under the scaled model
  slot.add(gunHolder);
  return {
    root, model: true, mixer, A, death, deathPlaying: -1, bones, hips, hipsBind: hips.position.clone(), k, holdQ, holdKey: '', gunHolder, rim: rim.color,
    w: {}, speed: 0, crouch: 0, gunId: null, gun: null, agent: agentId, flinch: 0, air: 0,
  };
}

const LOWER_KEYS = ['idle', 'walk', 'run', 'sl', 'sr', 'back', 'air'];
const UPPER_KEYS = ['aim2', 'aim1', 'melee'];
const lean = (rig, name, a) => { if (a) { const d = rig.bones[name]; d.b.quaternion.multiply(_q.setFromAxisAngle(d.axis, a)); } };

// same inputs as animateAgent in models.js: s = { speed, mx, mz, crouch, pitch, dt, aimRecoil, alive, ground, deathDir }
export function animateModelAgent(rig, s) {
  const dt = s.dt;
  rig.speed = damp(rig.speed, s.speed, 10, dt);
  rig.crouch = damp(rig.crouch, s.crouch, 12, dt);
  rig.air = damp(rig.air, s.ground === false ? 1 : 0, 10, dt);
  rig.flinch = Math.max(0, rig.flinch - dt * 4);
  const sp = rig.speed; const c = rig.crouch;
  const alive = s.alive !== false;
  const A = rig.A;
  const target = {};
  if (alive) {
    if (rig.deathPlaying >= 0) { rig.death[rig.deathPlaying].stop(); rig.deathPlaying = -1; }
    // legs: how much of each clip, from the speed and the direction of movement
    const move = clamp((sp - 0.3) / 0.9, 0, 1);
    const len = Math.hypot(s.mx || 0, s.mz || 0) || 1;
    const fz = (s.mz || 0) / len; const fx = (s.mx || 0) / len;
    const fw = Math.max(0, fz); const bk = Math.max(0, -fz); const sr = Math.max(0, fx); const sl = Math.max(0, -fx);
    const sum = fw + bk + sr + sl || 1;
    const runMix = clamp((sp - 2.6) / 2.4, 0, 1);
    const grounded = 1 - rig.air;
    target.idle = (1 - move) * grounded;
    target.walk = move * (fw / sum) * (1 - runMix) * grounded;
    target.run = move * (fw / sum) * runMix * grounded;
    target.back = move * (bk / sum) * grounded;
    target.sl = move * (sl / sum) * grounded; target.sr = move * (sr / sum) * grounded;
    target.air = rig.air;
    const cat = (WEAPON[rig.gunId] || WEAPON.wasp).cat;
    const upper = cat === 'sidearm' ? 'aim1' : cat === 'melee' ? 'melee' : 'aim2';
    UPPER_KEYS.forEach((n) => { target[n] = n === upper ? 1 : 0; });
    if (rig.holdKey !== upper) { rig.holdKey = upper; rig.gunHolder.quaternion.copy(rig.holdQ[upper]); }
    A.walk.timeScale = clamp(sp / 2.6, 0.6, 1.4); A.run.timeScale = clamp(sp / 5.2, 0.7, 1.5);
    A.sl.timeScale = A.sr.timeScale = clamp(sp / 5.2, 0.7, 1.5); A.back.timeScale = clamp(sp / 2.4, 0.6, 1.4);
  } else {
    LOWER_KEYS.concat(UPPER_KEYS).forEach((n) => { target[n] = 0; });
    if (rig.deathPlaying < 0) { rig.deathPlaying = (s.deathDir ?? 1) >= 0 ? 0 : 1; const d = rig.death[rig.deathPlaying]; d.reset(); d.setEffectiveWeight(1); d.play(); }
  }
  for (const key of Object.keys(target)) {
    const w = alive ? damp(rig.w[key] ?? 0, target[key], 14, dt) : 0;
    rig.w[key] = w; A[key].setEffectiveWeight(w);
  }
  rig.mixer.update(dt);
  const dying = rig.deathPlaying >= 0 ? rig.death[rig.deathPlaying] : null;
  rig.gunHolder.visible = !dying || dying.time < 0.4;
  if (!alive) return;
  // on top of the clips: the aim pitch through the spine and head, a flinch when hit, and crouching (legs fold, hips drop)
  const pitch = s.pitch || 0;
  lean(rig, 'spine', pitch * 0.3 - rig.flinch * 0.12);
  lean(rig, 'chest', pitch * 0.35 - rig.flinch * 0.12);
  lean(rig, 'head', pitch * 0.25 + rig.flinch * 0.2);
  if (c > 0.01) {
    lean(rig, 'upperlegl', c * 1.15); lean(rig, 'upperlegr', c * 1.15);
    lean(rig, 'lowerlegl', -c * 2.0); lean(rig, 'lowerlegr', -c * 2.0);
    lean(rig, 'footl', c * 0.85); lean(rig, 'footr', c * 0.85);
    // drop the hips by c * 0.36 m: a world-space vector turned into the hips' parent frame
    rig.root.getWorldQuaternion(_q2);
    _v.set(0, -c * 0.36, 0).applyQuaternion(_q2);
    rig.hips.parent.getWorldQuaternion(_q).invert();
    rig.hips.position.add(_v.applyQuaternion(_q).divideScalar(rig.k));
  }
}
