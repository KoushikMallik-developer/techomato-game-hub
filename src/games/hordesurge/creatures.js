// Horde Surge big creatures: world bosses, charging brutes, the player's heroes and pets, as animated
// models when their files are loaded, otherwise the procedural brute from world.js.
// The returned view matches buildBrute's ({ group, body, arms, legs, bar, barFg, label }) plus `anim`.
import * as THREE from 'three';
import { creature } from './assets.js';
import { buildBrute, hpBar } from './world.js';

// o: { boss } a world boss def with a model, { brute: true } a charging bull, { champion: { color, roller } }
export function buildBig(theme, scale, o = {}) {
  let spec = null;
  if (o.boss && o.boss.model) spec = { model: o.boss.model, height: o.boss.height, tint: o.boss.tint, glow: o.boss.glow ? o.boss.skin : null, crown: o.boss.crown, move: 'walk' };
  else if (o.brute) spec = { model: 'Bull', height: 1.95 * scale, move: 'run' };
  else if (o.champion && !o.champion.roller) spec = { model: 'KnightCharacter', height: 2.5 * scale, tint: { Armor: o.champion.color }, move: 'run' };
  const c = spec && creature(spec.model, spec);
  if (!c) return buildBrute(theme, scale, o.champion ? { color: o.champion.color } : null, o.boss || null);
  const g = new THREE.Group();
  g.add(c.inner);
  const { bar, barFg, label } = hpBar(!!o.champion);
  bar.position.y = spec.height + 0.8;
  g.add(bar);
  c.anim.loop(spec.move);
  return { group: g, body: c.inner, arms: [], legs: [], bar, barFg, label, anim: c.anim, move: spec.move };
}

export function buildPet(model) {
  const c = creature(model, { height: 1.1 });
  if (!c) return null;
  const g = new THREE.Group();
  g.add(c.inner);
  c.anim.loop('idle');
  return { group: g, anim: c.anim };
}
