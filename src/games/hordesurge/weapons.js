// Horde Surge arsenal: the launcher the player fires units from. Each one is stronger than the last
// (rate × burst = units per second compared to the starter cannon), adds cannon armor, and from the
// tanks on has a special that fires on its own. Models are from Poly Pizza (CC0 or CC-BY 3.0): the credits
// are in public/models/hordesurge/CREDITS.txt and in Settings.
// yaw: quarter turns that point the model's front down -Z (toward the fortress).
import * as THREE from 'three';
import { CANNON_Z } from './data.js';
import { instance } from './assets.js';
import { buildCannon } from './world.js';

export const WEAPONS = [
  { id: 'cannon', name: 'Field Cannon', kind: 'cannon', icon: 'cannon', model: 'arsenal/FieldCannon', yaw: 1, size: 2.8, desc: 'The trusty starter.', rate: 1, burst: 1, armor: 0, cost: 0, from: 1 },
  { id: 'ballista', name: 'Field Artillery', kind: 'cannon', icon: 'cannon', model: 'arsenal/Artillery', yaw: 0, size: 3.4, desc: 'A long-barrelled gun that fires units in pairs.', rate: 0.75, burst: 2, armor: 5, cost: 1900, from: 3 },
  { id: 'pirate', name: 'Fortress Cannon', kind: 'cannon', icon: 'cannon', model: 'arsenal/FortressCannon', yaw: 2, size: 3, desc: 'A heavy iron gun on an oak carriage.', rate: 1.7, burst: 1, armor: 10, cost: 3750, from: 5 },
  { id: 'turret', name: 'Gatling Turret', kind: 'cannon', icon: 'cannon', model: 'arsenal/GatlingTurret', yaw: 2, size: 3, desc: 'Spinning barrels, rapid fire.', rate: 2, burst: 1, armor: 15, cost: 6250, from: 7 },
  { id: 'tank', name: 'Battle Tank', kind: 'tank', icon: 'tank', model: 'arsenal/BattleTank', yaw: 2, size: 4, desc: 'Lobs an exploding shell into the horde.', rate: 1.2, burst: 2, armor: 20, cost: 10000, from: 10, special: 'shell', every: 7 },
  { id: 'assault', name: 'Assault Tank', kind: 'tank', icon: 'tank', model: 'arsenal/AssaultTank', yaw: -1, size: 4.4, desc: 'Faster shells, more armor.', rate: 1.4, burst: 2, armor: 25, cost: 15000, from: 13, special: 'shell', every: 5 },
  { id: 'heavy', name: 'Heavy Tank', kind: 'tank', icon: 'tank', model: 'arsenal/HeavyTank', yaw: 1.387, /* this model's front is not on an axis */ size: 4.8, desc: 'Huge shells and a thick hide.', rate: 1.1, burst: 3, armor: 30, cost: 21250, from: 16, special: 'bigshell', every: 4 },
  { id: 'plane', name: 'Fighter Plane', kind: 'plane', icon: 'plane', model: 'arsenal/Fighter', yaw: 2, size: 5, air: true, desc: 'Drops units from the air and strafes the lane.', rate: 1.8, burst: 2, armor: 30, cost: 28750, from: 19, special: 'strafe', every: 9 },
  { id: 'jet', name: 'Striker Jet', kind: 'jet', icon: 'jet', model: 'arsenal/StrikerJet', yaw: 2, size: 5.5, air: true, desc: 'Fires a salvo of homing missiles.', rate: 1.5, burst: 3, armor: 35, cost: 38750, from: 22, special: 'missiles', every: 7 },
  { id: 'stealth', name: 'Stealth Fighter', kind: 'jet', icon: 'jet', model: 'arsenal/StealthJet', yaw: 2, size: 6, air: true, desc: 'The ultimate war machine: bigger salvos, more often.', rate: 1.4, burst: 4, armor: 40, cost: 52500, from: 25, special: 'missiles', every: 5, salvo: 6 },
];
export const weaponPower = (w) => Math.round(w.rate * w.burst * 10) / 10;
export const SPECIAL_NAMES = { shell: 'Shell barrage', bigshell: 'Heavy shells', strafe: 'Strafing run', missiles: 'Missile salvo' };

// the weapon's 3D view, with the same parts the game drives on the old cannon
// (group, barrel for recoil, body colour, ready ring, muzzle flash) plus muzzle and air
export function buildWeapon(def, color) {
  if (!def) return { ...buildCannon(color), muzzle: new THREE.Vector3(0, 1.4, -2.3) }; // stand-in while a model loads
  const model = instance(def.model, def.size);
  if (!model) return null; // its file hasn't loaded (yet)
  const g = new THREE.Group();
  const barrel = new THREE.Group(); // the game slides this back for recoil
  const pivot = new THREE.Group();
  pivot.rotation.y = (def.yaw || 0) * (Math.PI / 2);
  pivot.add(model);
  barrel.add(pivot);
  g.add(barrel);
  if (def.air) barrel.position.y = 3.4;
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pivot);
  const muzzle = new THREE.Vector3(0, def.air ? 3.2 : Math.max(0.6, box.max.y * 0.6), box.min.z);
  // ready ring (the hero meter is full) and muzzle flash, at the front of the weapon
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0 }));
  ring.position.set(0, muzzle.y - barrel.position.y, muzzle.z);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshBasicMaterial({ color: '#fff1a8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.position.set(0, muzzle.y - barrel.position.y, muzzle.z - 0.3);
  barrel.add(ring, flash);
  g.position.set(0, 0, CANNON_Z + 1.5);
  return { group: g, barrel, body: new THREE.MeshBasicMaterial(), ring, flash, muzzle, air: !!def.air, def }; // body: models keep their own paint
}
