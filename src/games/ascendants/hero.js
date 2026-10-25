// Ascendants heroes, drawn like an anime fighter: cel-shaded skin and cloth (three flat tones and a rim
// light), dark ink outlines around every part, martial-arts outfits (a gi top, baggy trousers, a knotted
// sash with hanging tails, wristbands and boots), and spiky hair that stands up and blazes gold when the
// hero ascends. The bodies, heads and hands are the same sculpted, skinned meshes as Core Breach's agents.
// Animated procedurally for running, flying, fighting, charging ki, firing beams and more.
import * as THREE from 'three';
import * as SK from '../corebreach/skin.js';
import * as HD from '../corebreach/head.js';
import * as B from '../corebreach/body.js';
import { HERO, SKIN, clamp, damp } from './data.js';

const BODY = new Map();
// three-tone light ramp for cel shading
let RAMP = null;
function ramp() {
  if (RAMP) return RAMP;
  const d = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 225, 225, 225, 255, 255, 255, 255, 255]);
  RAMP = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  RAMP.minFilter = RAMP.magFilter = THREE.NearestFilter;
  RAMP.needsUpdate = true;
  return RAMP;
}
// cel material with a bright rim (and the form's glow fed through `rim`)
function toonMat(o, rim) {
  const { roughness, metalness, ...rest } = o; void roughness; void metalness;
  const m = new THREE.MeshToonMaterial({ gradientMap: ramp(), ...rest });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: rim };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.4);
        rimF = smoothstep(0.42, 0.52, rimF);
        totalEmissiveRadiance += diffuseColor.rgb * rimF * 0.35 + rimColor * rimF * 1.2;`);
  };
  m.customProgramCacheKey = () => 'herotoon';
  return m;
}
// ink outline: the mesh again, pushed out along its normals and drawn from the inside
const OUTLINE = new Map();
function outlineMat(th) {
  if (OUTLINE.has(th)) return OUTLINE.get(th);
  const m = new THREE.MeshBasicMaterial({ color: 0x0a0a12, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = vec3(position) + normal * ${th.toFixed(4)};`); };
  m.customProgramCacheKey = () => `ink${th}`;
  OUTLINE.set(th, m);
  return m;
}

// ── spiky anime hair ──
// head space: front is -z, the scalp's centre is about (0, 0.03, 0.01), radius ~0.095
const HAIR = new Map();
const STYLES = {
  wild: { rows: [[72, 6, 0.15, 0.04], [40, 9, 0.17, 0.042], [8, 7, 0.15, 0.04]], bangs: 4, up: 0.25, back: 0.15 },
  flame: { rows: [[75, 5, 0.22, 0.045], [45, 7, 0.2, 0.045], [12, 5, 0.12, 0.038]], bangs: 3, up: 0.9, back: 0.1 },
  swept: { rows: [[65, 5, 0.17, 0.04], [35, 7, 0.18, 0.04], [5, 6, 0.14, 0.036]], bangs: 2, up: 0.15, back: 0.9 },
  short: { rows: [[70, 6, 0.08, 0.035], [35, 9, 0.08, 0.035], [5, 6, 0.07, 0.032]], bangs: 4, up: 0.3, back: 0.2 },
  long: { rows: [[70, 5, 0.15, 0.04], [35, 8, 0.2, 0.042], [0, 7, 0.32, 0.045], [-25, 5, 0.3, 0.04]], bangs: 4, up: 0.0, back: 0.3, droop: 0.6 },
};
function spikyHair(style, stage) {
  const key = `${style}|${stage}`;
  if (HAIR.has(key)) return HAIR.get(key);
  const S = STYLES[style] || STYLES.wild;
  const C = new THREE.Vector3(0, 0.035, 0.012); const R = 0.092;
  const up = new THREE.Vector3(0, 1, 0);
  const parts = [];
  // stage 1 and 2: everything sweeps up and grows (2 grows more and adds spikes)
  const lift = stage === 0 ? 0 : stage === 1 ? 0.9 : 1.3;
  const grow = stage === 0 ? 1 : stage === 1 ? 1.35 : 1.75;
  const spike = (dir, len, rad, bend) => {
    const g = new THREE.ConeGeometry(rad, len, 6, 3);
    // a gentle curve along the spike
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / len + 0.5; p.setX(i, p.getX(i) + bend * y * y * len * 0.35); }
    g.computeVertexNormals();
    const axis = dir.clone().normalize();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, axis));
    const base = C.clone().addScaledVector(dir.clone().normalize(), R * 0.78);
    g.translate(base.x + axis.x * len * 0.45, base.y + axis.y * len * 0.45, base.z + axis.z * len * 0.45);
    parts.push(g);
  };
  let seed = style.length * 7 + 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  S.rows.forEach(([el, n, len, rad], ri) => {
    const nn = stage === 2 ? n + 2 : n;
    for (let k = 0; k < nn; k++) {
      // spread around the back and sides; the front stays clear for the face
      const span = el > 55 ? Math.PI * 2 : Math.PI * 1.45;
      const az = el > 55 ? (k / nn) * span + ri : -span / 2 + ((k + 0.5) / nn) * span + (rnd() - 0.5) * 0.2;
      const e = (el + (rnd() - 0.5) * 10) * Math.PI / 180;
      const d = new THREE.Vector3(Math.sin(az) * Math.cos(e), Math.sin(e), Math.cos(az) * Math.cos(e));
      const dir = d.clone()
        .add(new THREE.Vector3(0, S.up + lift * (1.1 - Math.max(0, e)), 0))
        .add(new THREE.Vector3(0, 0, S.back * (1 - lift * 0.5)))
        .add(new THREE.Vector3(0, -(S.droop || 0) * (1 - lift) * (e < 0.3 ? 1 : 0), 0));
      spike(dir, len * grow * (0.85 + rnd() * 0.3), rad * (stage ? 1.1 : 1), (rnd() - 0.5) * 0.8);
    }
  });
  // bangs over the forehead
  const nb = S.bangs + (stage === 2 ? 1 : 0);
  for (let k = 0; k < nb; k++) {
    const az = Math.PI + (k / Math.max(1, nb - 1) - 0.5) * 1.3;
    const d = new THREE.Vector3(Math.sin(az) * 0.8, 0.55, Math.cos(az) * 0.8);
    const dir = new THREE.Vector3(d.x * 0.6, stage ? 0.35 + lift * 0.4 : -0.55, -0.55);
    const g0 = spike;
    g0(dir, (stage ? 0.08 : 0.1) * (0.8 + rnd() * 0.4), 0.026, (rnd() - 0.5) * 0.6);
    parts[parts.length - 1].translate(d.x * 0.02, 0.0, 0);
  }
  const m = B.mergeAll(parts);
  m.userData.shared = true;
  HAIR.set(key, m);
  return m;
}

export function buildHero(heroId, skinIdx = 1, detail = 'medium') {
  const H = HERO[heroId] || HERO.vanguard;
  const rim = new THREE.Color(0x000000);
  const cloth = B.clothNormal();
  const skinTone = SKIN[skinIdx % SKIN.length];
  const mats = {
    body: toonMat({ color: 0xffffff, vertexColors: true, normalMap: cloth, normalScale: new THREE.Vector2(0.25, 0.25) }, rim),
    trim: toonMat({ color: H.trim }, rim),
    skin: toonMat({ color: skinTone }, rim),
    glow: new THREE.MeshBasicMaterial({ color: H.glow }),
    eye: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12 }),
    hair: toonMat({ color: H.hairColor || ['#1c1612', '#3a2516', '#d9d2c4', '#7a2a2a'][H.hair % 4] }, rim),
    mask: toonMat({ color: H.band || H.suit }, rim),
    sash: toonMat({ color: H.sash || H.trim }, rim),
    under: toonMat({ color: H.under || '#20232c' }, rim),
    cape: H.cape ? toonMat({ color: H.cape, side: THREE.DoubleSide }, rim) : null,
  };
  const ink = outlineMat(0.011);
  const inkThin = outlineMat(0.006);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = new THREE.Group(); hips.position.y = 0.95; body.add(hips);
  const legRoot = new THREE.Group(); hips.add(legRoot);
  const near = []; const far = [];
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0, outline = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m);
    if (outline && detail !== 'low') { const o = new THREE.Mesh(geo, outline === 'thin' ? inkThin : ink); m.add(o); near.push(o); }
    return m;
  };
  // level of detail: sculpted meshes come as a near version (with ink) and a light far version
  const lod = (fn, mat, parent, line = true) => {
    const ga = fn(detail);
    const a = new THREE.Mesh(ga, mat); a.castShadow = true; parent.add(a);
    const b = new THREE.Mesh(fn('lod'), mat); b.castShadow = true; parent.add(b);
    b.visible = false; near.push(a); far.push(b);
    if (line && detail !== 'low') { const o = new THREE.Mesh(ga, inkThin); a.add(o); }
    return [a, b];
  };
  const nearOnly = (m) => { near.push(m); return m; };
  // the sash: a knotted band with two tails hanging at the side
  const belt = mesh(new THREE.TorusGeometry(0.162, 0.03, 8, 30), mats.sash, legRoot, 0, 0.06, 0.005, 'thin'); belt.rotation.x = Math.PI / 2; belt.scale.set(1.0, 0.68, 1.2);
  const knot = mesh(new THREE.SphereGeometry(0.035, 10, 8), mats.sash, legRoot, 0.11, 0.06, -0.08, 'thin'); knot.scale.set(1.2, 0.9, 0.8);
  const tails = [0, 1].map((k) => { const t = mesh(new THREE.BoxGeometry(0.04, 0.17, 0.012), mats.sash, legRoot, 0.12 + k * 0.025, -0.03, -0.085, 'thin'); t.rotation.z = 0.18 - k * 0.22; t.rotation.y = -0.6; return t; });
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group(); hip.position.set(0.093 * s, -0.05, 0); legRoot.add(hip);
    const knee = new THREE.Group(); knee.position.y = -0.43; hip.add(knee);
    const foot = new THREE.Group(); foot.position.y = -0.42; knee.add(foot);
    mesh(B.bootGeometry(), mats.trim, foot, 0, 0.02, 0);
    mesh(B.soleGeometry(), mats.under, foot, 0, 0.02, 0, false);
    mesh(new THREE.CylinderGeometry(0.06, 0.052, 0.2, 16), mats.trim, foot, 0, 0.16, 0.004); // boot shaft
    // the trouser cuff tucked into the boot
    mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 18), mats.sash, foot, 0, 0.26, 0.004, 'thin').rotation.x = Math.PI / 2;
    return { hip, knee, foot };
  });
  const spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine);
  // the gi's crossed collar showing the undershirt, and an emblem patch on the chest
  const vee = new THREE.Shape(); vee.moveTo(-0.07, 0.03); vee.lineTo(0.07, 0.03); vee.lineTo(0, -0.11); vee.closePath();
  const veeG = new THREE.ShapeGeometry(vee); veeG.rotateY(Math.PI);
  mesh(veeG, mats.under, spine, 0, 0.47, -0.118, false).rotation.x = -0.12;
  [-1, 1].forEach((s) => { const lap = mesh(new THREE.BoxGeometry(0.03, 0.17, 0.012), mats.sash, spine, s * 0.04, 0.45, -0.12, 'thin'); lap.rotation.z = -s * 0.42; lap.rotation.x = -0.12; });
  const em = new THREE.Group(); em.position.set(0.075, 0.38, -0.124); spine.add(em);
  mesh(new THREE.CircleGeometry(0.038, 24), mats.under, em, 0, 0, 0, false).rotation.y = Math.PI;
  const glyph = new THREE.Shape();
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + Math.PI / 2; const r = k % 2 ? 0.012 : 0.028; (k ? glyph.lineTo : glyph.moveTo).call(glyph, Math.cos(a) * r, Math.sin(a) * r); }
  const sg = new THREE.ExtrudeGeometry(glyph, { depth: 0.004, bevelEnabled: false }); sg.rotateY(Math.PI);
  nearOnly(mesh(sg, mats.glow, em, 0, 0, -0.002, false));
  const neck = new THREE.Group(); neck.position.y = 0.55; spine.add(neck);
  const head = new THREE.Group(); head.position.y = 0.16; neck.add(head);
  const variant = heroId.length % 2;
  lod((d) => HD.headMesh(variant, d), mats.skin, head);
  [-1, 1].forEach((s) => {
    const eye = new THREE.Group(); eye.position.set(0.028 * s, 0.016, -0.0785); eye.scale.setScalar(0.0108); head.add(eye); nearOnly(eye);
    mesh(B.eyeGeometry(), mats.eye, eye, 0, 0, 0, false); mesh(B.lidGeometry(true), mats.skin, eye, 0, 0, 0, false); mesh(B.lidGeometry(false), mats.skin, eye, 0, 0, 0, false);
  });
  // headgear and hair: the spiky hair comes in three stages (base, ascended, ascended II)
  let hairSets = null;
  if (H.mask === 'hood') lod((d) => HD.headwear('hood', d), mats.cape || mats.mask, head);
  else if (H.mask === 'mohawk') lod((d) => HD.headwear('mohawk', d), mats.hair, head);
  else {
    lod((d) => HD.hairMesh(variant, 0, d), mats.hair, head);
    if (H.hairStyle !== 'bald') {
      hairSets = [0, 1, 2].map((st) => {
        const m = new THREE.Mesh(spikyHair(H.hairStyle || 'wild', st), mats.hair);
        m.castShadow = true; head.add(m);
        if (detail !== 'low') m.add(new THREE.Mesh(m.geometry, inkThin));
        m.visible = st === 0;
        return m;
      });
    }
  }
  if (H.mask === 'band') lod((d) => HD.headwear('band', d, variant), mats.mask, head).forEach((b) => b.scale.set(1.02, 0.85, 1.0));
  if (H.mask === 'mask') { lod((d) => HD.headwear('mask', d, variant), mats.mask, head); lod((d) => HD.headwear('band', d, variant), mats.mask, head); }
  // arms
  const UPPER = 0.29; const LOWER = 0.27;
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group(); sh.position.set(0.205 * s, 0.47, -0.02); spine.add(sh);
    const el = new THREE.Group(); el.position.y = -UPPER; sh.add(el);
    mesh(new THREE.CylinderGeometry(0.05, 0.044, 0.1, 16), mats.sash, el, 0, -LOWER + 0.075, 0); // wristband
    const hand = new THREE.Group(); hand.position.y = -LOWER; el.add(hand);
    lod((d) => SK.handMesh(0.9, d === 'lod' ? 'lod' : 'medium'), mats.skin, hand);
    if (H.armor) mesh(B.curvedPlate(0.12, 0.07, 0.13, 2.2, 0.025), mats.trim, sh, 0.024 * s, 0.03, 0).rotation.z = -0.35 * s;
    return { sh, el, hand, s };
  });
  // the body: one skinned mesh, coloured gi top / trousers / skin, plus its ink outline
  const bodyGeo = (d) => {
    const key = `${heroId}|${skinTone}|${d}`;
    let geo = BODY.get(key);
    if (!geo) { geo = SK.colouredBody(SK.bodyGeometry(1.1, d), H.suit, H.suit2, skinTone); geo.userData.shared = true; BODY.set(key, geo); }
    return geo;
  };
  const bones = [legRoot, spine, neck, arms[0].sh, arms[1].sh, arms[0].el, arms[1].el, legs[0].hip, legs[1].hip, legs[0].knee, legs[1].knee].map((g) => { const b = new THREE.Bone(); g.add(b); return b; });
  const skel = new THREE.Skeleton(bones);
  arms.forEach((a) => a.sh.rotation.set(0, 0, a.s * SK.A_POSE));
  root.updateMatrixWorld(true);
  [detail, 'lod'].forEach((d, i) => {
    const sm = new THREE.SkinnedMesh(bodyGeo(d), mats.body);
    sm.castShadow = true; sm.frustumCulled = false;
    body.add(sm);
    sm.bind(skel);
    (i ? far : near).push(sm);
    if (i) sm.visible = false;
    if (!i && detail !== 'low') {
      const o = new THREE.SkinnedMesh(sm.geometry, ink);
      o.frustumCulled = false; body.add(o); o.bind(skel, sm.bindMatrix); near.push(o);
    }
  });
  arms.forEach((a) => a.sh.rotation.set(0, 0, 0));
  // cape (a few heroes wear a long cloak): a cloth strip hung from the shoulders, animated per frame
  let cape = null;
  if (mats.cape) {
    const cols = 7; const rows = 11;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(cols * rows * 3); const uv = new Float32Array(cols * rows * 2); const idx = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c; uv[i * 2] = c / (cols - 1); uv[i * 2 + 1] = 1 - r / (rows - 1); if (r < rows - 1 && c < cols - 1) idx.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, mats.cape); m.castShadow = true; m.frustumCulled = false;
    m.position.set(0, 0.5, 0.1); spine.add(m);
    cape = { mesh: m, cols, rows, len: 1.05, top: 0.36, bot: 0.62, swing: 0, flap: 0 };
    updateCape(cape, 0, 0, 0, 0);
  }
  return {
    root, body, hips, legRoot, spine, neck, head, legs, arms, mats, rim, cape, UPPER, LOWER, hero: heroId, near, far, isFar: false, hairSets, tails,
    setFar(f) { if (f === this.isFar) return; this.isFar = f; this.near.forEach((m) => { m.visible = !f; }); this.far.forEach((m) => { m.visible = f; }); },
    phase: 0, speed: 0, air: 0, lean: 0, death: 0, punch: 0, punchN: 0, castT: 0, t: Math.random() * 10, scale: 1,
  };
}

// lay out the cape: it hangs from the shoulders and swings back with speed and falling, with a ripple
function updateCape(cape, back, side, flutter, t) {
  const p = cape.mesh.geometry.attributes.position;
  const { cols, rows, len } = cape;
  for (let r = 0; r < rows; r++) {
    const f = r / (rows - 1);
    const w = cape.top + (cape.bot - cape.top) * f;
    const ang = back * Math.pow(f, 0.8);
    const ripple = Math.sin(t * 9 - f * 6) * flutter * f;
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1) - 0.5;
      const i = r * cols + c;
      const along = f * len;
      const x = u * w + side * f * 0.3;
      const y = -Math.cos(ang) * along;
      const z = Math.sin(ang) * along + Math.abs(u) * -0.05 * (1 - f) + ripple * 0.12 + Math.cos(u * Math.PI) * 0.05 * f;
      p.setXYZ(i, x, y, z + 0.02);
    }
  }
  p.needsUpdate = true;
  cape.mesh.geometry.computeVertexNormals();
}

const _q = new THREE.Quaternion(); const _e = new THREE.Euler();
// s: { speed (horizontal), vy, mode, ground, sprint, aimPitch, aiming, castT, melee {n, t}, using, alive, deathDir,
//      titan, frozen, dt, moveYaw (relative to body), swim }
export function animateHero(h, s) {
  const dt = s.dt;
  h.t += dt;
  if (s.frozen) { if (h.cape) updateCape(h.cape, h.cape.swing, 0, 0, h.t); return; }
  h.scale = 1;
  h.speed = damp(h.speed, s.speed, 10, dt);
  const air = s.mode === 'ground' ? (s.ground ? 0 : 1) : 0;
  h.air = damp(h.air, air, 8, dt);
  const run = clamp(h.speed / 7, 0, 1.6);
  h.phase += dt * (2 + h.speed * 1.45);
  const L = h.legs; const A = h.arms;
  const reset = () => {
    h.hips.rotation.set(0, 0, 0); h.spine.rotation.set(0, 0, 0); h.neck.rotation.set(0, 0, 0); h.legRoot.rotation.set(0, 0, 0);
    L.forEach((l) => { l.hip.rotation.set(0, 0, 0); l.knee.rotation.set(0, 0, 0); l.foot.rotation.set(0, 0, 0); });
    A.forEach((a) => { a.sh.rotation.set(0, 0, 0); a.el.rotation.set(0, 0, 0); a.hand.rotation.set(0, 0, 0); });
  };
  reset();
  h.hips.position.y = 0.95;
  let capeBack = 0.12 + run * 0.35; let capeSide = 0; let flutter = 0.15 + run * 0.4;
  if (!s.alive) {
    h.death = Math.min(1, h.death + dt * 2.2);
    const e = 1 - (1 - h.death) ** 3;
    h.hips.rotation.x = e * 1.45 * (s.deathDir || 1);
    h.hips.position.y = 0.95 - e * 0.78;
    L.forEach((l, k) => { l.hip.rotation.x = -e * 0.2 + (k ? 0.3 : 0) * e; l.knee.rotation.x = -e * (k ? 0.8 : 0.2); });
    A.forEach((a) => { a.sh.rotation.set(-e * 1.3, 0, a.s * e * 1.1); a.el.rotation.x = e * 0.4; });
    if (h.cape) updateCape(h.cape, 0.2, 0, 0, h.t);
    return;
  }
  h.death = 0;
  switch (s.mode) {
    case 'fall': {
      // skydiving: belly down, limbs spread, cape whipping
      h.hips.rotation.x = -1.25; h.hips.position.y = 1.0;
      L.forEach((l, k) => { l.hip.rotation.set(0.2, 0, (k ? -1 : 1) * 0.35); l.knee.rotation.x = -0.6; });
      A.forEach((a) => { a.sh.rotation.set(-0.3, 0, a.s * 1.25); a.el.rotation.x = 0.6; });
      h.neck.rotation.x = 0.9;
      capeBack = 1.5; flutter = 1; break;
    }
    case 'glide': {
      // upright soaring glide: arms spread wide, legs trailing
      h.hips.rotation.x = -0.35;
      L.forEach((l, k) => { l.hip.rotation.set(0.25 + k * 0.15, 0, (k ? -1 : 1) * 0.08); l.knee.rotation.x = -0.35 - k * 0.2; });
      A.forEach((a) => { a.sh.rotation.set(-0.15, 0, a.s * 1.45); a.el.rotation.x = 0.15; });
      h.neck.rotation.x = 0.2;
      capeBack = 1.25; capeSide = 0; flutter = 0.8; break;
    }
    case 'fly': {
      // flying: horizontal, leading fist forward
      const f = clamp((h.speed - 2) / 14, 0, 1);
      h.hips.rotation.x = -1.35 * f - 0.08 + Math.sin(h.t * 2) * 0.03;
      if (f < 0.3) { L.forEach((l, k) => { l.hip.rotation.set(0.15 + k * 0.25, 0, (k ? -1 : 1) * 0.06); l.knee.rotation.x = -0.35 - k * 0.45; }); A.forEach((a) => { a.sh.rotation.set(0.15, 0, a.s * 0.28); a.el.rotation.x = 0.6; }); h.neck.rotation.x = 0; capeBack = 0.25; flutter = 0.4; break; }
      L.forEach((l, k) => { l.hip.rotation.set(0.05 + k * 0.12, 0, 0); l.knee.rotation.x = -0.1 - k * 0.3; });
      A[1].sh.rotation.set(2.9 * f + 0.2, 0, 0.1); A[1].el.rotation.x = 0.05; // fist forward
      A[0].sh.rotation.set(0.2, 0, -0.2); A[0].el.rotation.x = 0.4;
      h.neck.rotation.x = 1.15 * f;
      capeBack = 1.5 * f + 0.2; flutter = 1; break;
    }
    case 'swim': {
      h.hips.rotation.x = -1.1; h.hips.position.y = 0.95;
      const ph = h.phase;
      A.forEach((a, k) => { a.sh.rotation.set(-Math.PI + Math.sin(ph + k * Math.PI) * 1.4, 0, a.s * 0.2); a.el.rotation.x = 0.3; });
      L.forEach((l, k) => { l.hip.rotation.x = Math.sin(ph * 2 + k * Math.PI) * 0.35; });
      h.neck.rotation.x = 0.9;
      capeBack = 1.1; flutter = 0.3; break;
    }
    default: {
      // on foot: run cycle with arm swing, lean into the run; jumping tucks the legs
      const swing = clamp(h.speed / 7, 0, 1) * (s.sprint ? 0.95 : 0.75);
      h.hips.position.y = 0.95 + Math.abs(Math.sin(h.phase)) * 0.045 * clamp(h.speed / 6, 0, 1) - h.air * 0.02;
      L.forEach((l, k) => {
        const ph = h.phase + (k ? Math.PI : 0);
        l.hip.rotation.x = Math.sin(ph) * swing + h.air * (k ? 0.2 : 0.9);
        l.knee.rotation.x = -(Math.max(0, Math.sin(ph + 1.3)) * swing * 1.4 + h.air * (k ? 0.5 : 1.3));
        l.foot.rotation.x = -Math.max(0, -Math.sin(ph)) * swing * 0.3;
      });
      A.forEach((a, k) => {
        const ph = h.phase + (k ? 0 : Math.PI);
        a.sh.rotation.set(Math.sin(ph) * swing * 0.9 + h.air * 0.5, 0, a.s * (0.12 + h.air * 0.5));
        a.el.rotation.x = 0.35 + swing * 0.6;
      });
      h.spine.rotation.x = -clamp(h.speed / 10, 0, 1) * (s.sprint ? 0.32 : 0.15);
      h.spine.rotation.y = Math.sin(h.phase) * 0.08 * swing;
      // idle breathing
      h.spine.rotation.x += Math.sin(h.t * 1.8) * 0.015 * (1 - clamp(h.speed, 0, 1));
      if (s.using) { L.forEach((l, k) => { l.hip.rotation.x = k ? 1.4 : 0.2; l.knee.rotation.x = k ? -2.2 : -1.6; }); h.hips.position.y = 0.6; A.forEach((a) => { a.sh.rotation.set(0.9, 0, a.s * 0.3); a.el.rotation.x = 1.2; }); }
      break;
    }
  }
  // looking up/down with the aim
  if (s.mode === 'ground' || s.mode === 'swim') { h.neck.rotation.x += (s.aimPitch || 0) * 0.45; h.spine.rotation.x += (s.aimPitch || 0) * 0.25; }
  // melee: jab, cross, hook, knee, spinning kick, and the overhead hammer smash
  if (s.melee && s.melee.t > 0) {
    const k = 1 - s.melee.t / s.melee.dur; const e = Math.sin(Math.min(1, k * 1.6) * Math.PI);
    const n = s.melee.n;
    const guard = (a) => { a.sh.rotation.set(0.9, 0, a.s * 0.25); a.el.rotation.x = 1.9; };
    if (n === 0 || n === 1) {
      const a = A[n === 0 ? 0 : 1]; const o = A[n === 0 ? 1 : 0];
      a.sh.rotation.set(1.5 * e + 0.1, 0, a.s * 0.1); a.el.rotation.x = (1 - e) * 1.6 - 0.05;
      guard(o);
      h.spine.rotation.y = (n === 0 ? 1 : -1) * e * 0.45;
    } else if (n === 2) {
      // hook: the left arm sweeps across
      const a = A[0];
      a.sh.rotation.set(1.3, 0, a.s * (0.9 - e * 0.9)); a.el.rotation.x = 1.1;
      guard(A[1]);
      h.spine.rotation.y = -e * 0.8 + 0.3;
    } else if (n === 3) {
      // rising knee
      L[1].hip.rotation.x = 1.9 * e; L[1].knee.rotation.x = -2.1 * e;
      A.forEach((a) => { a.sh.rotation.set(1.0 - e * 0.4, 0, a.s * 0.3); a.el.rotation.x = 1.6; });
      h.spine.rotation.x -= e * 0.25;
    } else if (n === 4) {
      // spinning kick: a full turn with the leg out
      h.hips.rotation.y = -k * Math.PI * 2;
      L[1].hip.rotation.set(e * 1.5, 0, -e * 1.1); L[1].knee.rotation.x = -(1 - e) * 1.0 - 0.05;
      A.forEach((a) => { a.sh.rotation.set(0.4, 0, a.s * 0.9); a.el.rotation.x = 0.6; });
    } else {
      // heavy: both fists raised overhead, then hammered down
      const up = Math.min(1, k / 0.45); const down = Math.max(0, (k - 0.45) / 0.3);
      const ang = 2.9 * up - 1.9 * Math.min(1, down);
      A.forEach((a) => { a.sh.rotation.set(ang, 0, a.s * -0.15); a.el.rotation.x = 0.25; });
      h.spine.rotation.x += 0.25 * up - 0.75 * Math.min(1, down);
      L[0].hip.rotation.x = 0.5 * down; L[0].knee.rotation.x = -0.6 * down;
    }
  }
  // poses held while doing something: charging ki, firing a beam, gathering a sphere, a barrage,
  // ascending, lying downed, tumbling through the air, and emotes
  const P = s.pose;
  if (P) {
    const t = h.t;
    const plant = () => { L.forEach((l, k) => { l.hip.rotation.set(0.25, 0, (k ? 1 : -1) * 0.28); l.knee.rotation.x = -0.55; l.foot.rotation.x = 0.3; }); h.hips.position.y = 0.86; };
    if (P === 'charge' || P === 'transform') {
      plant();
      const j = Math.sin(t * 40) * 0.02;
      A.forEach((a) => { a.sh.rotation.set(-0.15 + j, 0, a.s * 0.5); a.el.rotation.x = 0.7; a.hand.rotation.x = 0.3; });
      h.spine.rotation.x = 0.12 + j; h.neck.rotation.x = P === 'transform' ? 0.55 : 0.2;
      if (P === 'transform') { A.forEach((a) => { a.sh.rotation.set(0.2, 0, a.s * 0.95); a.el.rotation.x = 1.6; }); h.spine.rotation.x = 0.3; }
    } else if (P === 'beamcharge') {
      // hands cupped at the side, body wound up
      plant();
      A.forEach((a) => { a.sh.rotation.set(-0.5, 0, a.s * 0.12 + 0.35); a.el.rotation.x = 1.7; });
      h.spine.rotation.y = 0.75; h.legRoot.rotation.y = -0.4;
    } else if (P === 'beam') {
      plant();
      const ap = s.aimPitch || 0;
      A.forEach((a) => { a.sh.rotation.set(Math.PI / 2 + ap, a.s * 0.32, -a.s * 0.05); a.el.rotation.x = 0.08; a.hand.rotation.x = -0.6; });
      h.spine.rotation.y = -0.15; h.spine.rotation.x = ap * 0.3 - 0.05;
    } else if (P === 'gather') {
      plant();
      A.forEach((a) => { a.sh.rotation.set(2.95, 0, a.s * -0.22); a.el.rotation.x = 0.1; a.hand.rotation.x = -0.4; });
      h.neck.rotation.x = 0.5; h.spine.rotation.x = 0.15;
    } else if (P === 'barrage') {
      plant();
      A.forEach((a, k) => { const ph = Math.sin(t * 26 + k * Math.PI); a.sh.rotation.set(Math.PI / 2 + (s.aimPitch || 0) + (ph > 0 ? 0 : -0.4), 0, a.s * 0.05); a.el.rotation.x = ph > 0 ? 0.05 : 1.1; });
      h.spine.rotation.y = Math.sin(t * 26) * 0.18;
    } else if (P === 'downed') {
      h.hips.rotation.x = -1.42; h.hips.position.y = 0.22;
      const c = Math.sin(t * 3) * clamp(h.speed, 0, 1);
      A.forEach((a, k) => { a.sh.rotation.set(2.6 + (k ? c : -c) * 0.5, 0, a.s * 0.4); a.el.rotation.x = 0.6; });
      L.forEach((l, k) => { l.hip.rotation.x = (k ? -c : c) * 0.3 - 0.1; l.knee.rotation.x = -0.3; });
      h.neck.rotation.x = 0.8;
    } else if (P === 'tumble') {
      h.hips.rotation.x = t * 11; h.hips.position.y = 0.9;
      A.forEach((a, k) => { a.sh.rotation.set(1 + Math.sin(t * 9 + k) * 1.2, 0, a.s * 1.1); a.el.rotation.x = 0.8; });
      L.forEach((l, k) => { l.hip.rotation.x = Math.sin(t * 8 + k * 2) * 0.9; l.knee.rotation.x = -0.9; });
    } else if (P === 'pose') {
      // fists on hips, chest out
      A.forEach((a) => { a.sh.rotation.set(-0.35, 0, a.s * 0.62); a.el.rotation.x = 2.0; a.el.rotation.y = 0; });
      L.forEach((l, k) => { l.hip.rotation.z = (k ? -1 : 1) * 0.16; });
      h.spine.rotation.x = 0.12; h.neck.rotation.x = 0.12;
    } else if (P === 'taunt') {
      // come on, then
      A[1].sh.rotation.set(1.35, 0, 0.1); A[1].el.rotation.x = 0.35 + Math.max(0, Math.sin(t * 9)) * 1.2;
      A[0].sh.rotation.set(-0.2, 0, -0.4); A[0].el.rotation.x = 1.8;
      h.spine.rotation.x = 0.08; h.neck.rotation.x = 0.1;
    } else if (P === 'bow') {
      h.spine.rotation.x = -0.75; h.neck.rotation.x = -0.25;
      A[1].sh.rotation.set(1.2, -0.6, 0.2); A[1].el.rotation.x = 1.5; // fist in palm
      A[0].sh.rotation.set(1.2, 0.6, -0.2); A[0].el.rotation.x = 1.5;
    }
  }
  if (h.cape) {
    h.cape.swing = damp(h.cape.swing, capeBack, 6, dt);
    updateCape(h.cape, h.cape.swing, capeSide, flutter, h.t);
  }
}

// transformations: the hair (and a rim of light around the whole body) takes on the form's glow
export function setForm(h, form, color) {
  if (h.form === form && h.formColor === color) return;
  h.form = form; h.formColor = color;
  const m = h.mats.hair;
  if (!h.hairBase) h.hairBase = m.color.clone();
  const c = new THREE.Color(color || '#ffd84a');
  if (form) { m.color.copy(c); m.emissive.copy(c).multiplyScalar(form === 2 ? 0.75 : 0.5); h.rim.copy(c).multiplyScalar(form === 2 ? 1.0 : 0.6); } else { m.color.copy(h.hairBase); m.emissive.setRGB(0, 0, 0); h.rim.setRGB(0, 0, 0); }
  if (h.hairSets) h.hairSets.forEach((hm, i) => { hm.visible = i === (form || 0); });
}
// a red rim while surging, white while charging
export function setRim(h, color, k) { if (h.form) return; if (!color) h.rim.setRGB(0, 0, 0); else h.rim.set(color).multiplyScalar(k); }

export function disposeHero(h) {
  h.root.traverse((m) => {
    if (m.geometry && !m.geometry.userData.shared && m !== (h.cape && h.cape.mesh)) m.geometry.dispose();
    if (m.material && !Array.isArray(m.material)) m.material.dispose();
  });
  if (h.cape) h.cape.mesh.geometry.dispose();
}
void _q; void _e;
