// Core Breach heads and hair, sculpted as signed distance fields (skull, jaw, cheekbones, brow ridge,
// eye sockets, nose with nostrils, lips and chin) and meshed once per variant. Hair is a shell grown
// over the same skull, trimmed to a hairline, with strand grooves; brows are part of the hair mesh.
// Units are metres in head space (face toward -z), matching the eye and ear placement in models.js.
import * as THREE from 'three';
import { roundCone, ellipsoid, smin, meshField } from './skin.js';

const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const ssub = (d, cut, k) => { const h = Math.max(k - Math.abs(-cut - d), 0) / k; return Math.max(d, -cut) + h * h * k * 0.25; };

// variants: 0 square jaw, 1 narrow face, 2 broad cheeks / softer
const V = [
  { jaw: 1.06, chin: 1.0, nose: 1.0, cheek: 1.0, lip: 1.0, brow: 1.1 },
  { jaw: 0.92, chin: 1.1, nose: 1.08, cheek: 0.92, lip: 0.9, brow: 0.95 },
  { jaw: 1.0, chin: 0.92, nose: 0.94, cheek: 1.12, lip: 1.12, brow: 1.0 },
];

function skull(x, y, z) { return ellipsoid(x, y, z, [0, 0.028, 0.006], [0.074, 0.088, 0.094]); }

function headField(variant) {
  const p = V[variant % 3];
  return (x, y, z) => {
    const ax = Math.abs(x);
    let d = skull(x, y, z);
    d = smin(d, ellipsoid(x, y, z, [0, -0.004, -0.04], [0.06 * p.cheek, 0.072, 0.056]), 0.026); // face mass
    d = smin(d, ellipsoid(x, y, z, [0, -0.045, -0.025], [0.053 * p.jaw, 0.05, 0.064]), 0.026); // jaw
    d = smin(d, roundCone(ax, y, z, [0.045 * p.jaw, -0.048, 0.0], [0.02, -0.086, -0.05], 0.012, 0.015), 0.022); // jaw line
    d = smin(d, len(x, y + 0.086 * p.chin, z + 0.062) - 0.019, 0.02); // chin
    d = smin(d, len(ax - 0.042 * p.cheek, y + 0.002, z + 0.066) - 0.017, 0.02); // cheekbones
    d = smin(d, roundCone(ax, y, z, [0.0, 0.037, -0.086], [0.043, 0.037, -0.078], 0.0125 * p.brow, 0.009), 0.016); // brow ridge
    // eye sockets
    d = ssub(d, len(ax - 0.028, y - 0.015, z + 0.094) - 0.0165, 0.012);
    // nose: bridge to tip, wings, nostrils
    const nk = p.nose;
    d = smin(d, roundCone(x, y, z, [0, 0.026, -0.087], [0, -0.019 * nk, -0.104 - 0.004 * nk], 0.0075, 0.0105 * nk), 0.008);
    d = smin(d, len(ax - 0.0115 * nk, y + 0.024 * nk, z + 0.093) - 0.0085 * nk, 0.007);
    d = ssub(d, len(ax - 0.0068, y + 0.0315 * nk, z + 0.097) - 0.0036, 0.003);
    // lips with the mouth line between them, philtrum groove above
    const lp = p.lip;
    d = smin(d, ellipsoid(x, y, z, [0, -0.0455, -0.0905], [0.023 * lp, 0.0068, 0.011]), 0.006);
    d = smin(d, ellipsoid(x, y, z, [0, -0.0565, -0.0885], [0.0205 * lp, 0.0075, 0.011]), 0.006);
    d = ssub(d, roundCone(x, y, z, [-0.025 * lp, -0.0505, -0.098], [0.025 * lp, -0.0505, -0.098], 0.0022, 0.0022), 0.004);
    d = ssub(d, ellipsoid(x, y, z, [0, -0.036, -0.101], [0.0035, 0.007, 0.003]), 0.003);
    d = smin(d, roundCone(x, y, z, [0, -0.07, 0.012], [0, -0.13, 0.016], 0.043, 0.048), 0.02); // neck stub
    // ears: a flattened shell with the bowl carved out, angled back from the skull
    const ex = ax - 0.074; const ey = y - 0.004; const ez = z - 0.014;
    const ery = ey * 0.94 + ez * 0.34; const erz = ez * 0.94 - ey * 0.34;
    d = smin(d, ellipsoid(ex, ery, erz, [0.004, 0, 0], [0.011, 0.031, 0.02]), 0.006);
    d = ssub(d, ellipsoid(ex, ery, erz, [0.013, -0.004, -0.002], [0.007, 0.018, 0.012]), 0.004);
    return d;
  };
}

// hairline: 1 inside the haired area. ang 0 = face, 1 = back
function hairline(x, y, z, style) {
  const a = Math.abs(Math.atan2(x, -z)) / Math.PI;
  let line = a < 0.2 ? 0.058 + (style === 2 ? 0.006 * Math.sin(x * 120) : 0) : a < 0.42 ? 0.058 - (a - 0.2) * 0.32 : -0.012 - (a - 0.42) * (style === 1 ? 0.25 : 0.1);
  if (a > 0.32 && a < 0.42) line -= 0.022; // sideburns
  return y - line;
}

const SPIKES = [];
for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2; const r = i % 2 ? 0.035 : 0.022; SPIKES.push([Math.sin(a) * r, -Math.cos(a) * r - 0.005, Math.sin(a) * 0.02, 0.025 + Math.cos(a) * 0.01, 0.055 + (i % 3) * 0.012]); }

function hairField(variant, style) {
  const p = V[variant % 3];
  return (x, y, z) => {
    const s = skull(x, y, z);
    const thick = style === 0 || style === 3 ? 0.0045 : style === 1 ? 0.011 : 0.009;
    const top = style === 2 ? Math.max(0, y - 0.05) * 0.18 : style === 1 ? Math.max(0, y) * 0.06 : 0;
    // strands: grooves running from the crown toward the hairline
    const a = Math.atan2(x, -z);
    const groove = (0.5 + 0.5 * Math.sin(a * 38 + y * 24)) * 0.0009 * (style === 0 ? 0.4 : 1);
    let d = Math.max(s - thick - top + groove, -(s + 0.002)); // a shell over the skull
    d = Math.max(d, -hairline(x, y, z, style) * 0.6);
    if (style === 3) {
      // swept-up spikes: tapered cones grown from the crown, leaning back
      for (let k = 0; k < SPIKES.length; k++) { const [px, pz, lx, lz, h] = SPIKES[k]; d = smin(d, roundCone(x, y, z, [px, 0.07, pz], [px + lx, 0.07 + h, pz + lz], 0.019, 0.002), 0.014); }
    }
    if (style === 1) d = smin(d, ellipsoid(x, y, z, [0, -0.03, 0.07], [0.055, 0.07, 0.03]), 0.02); // longer back
    // brows
    const ax = Math.abs(x);
    const bw = roundCone(ax, y, z, [0.014, 0.0385, -0.0955], [0.043, 0.041 - 0.003 * p.brow, -0.084], 0.0042 * p.brow, 0.0026);
    return Math.min(d, bw);
  };
}

const cache = new Map();
export function headMesh(variant = 0, detail = 'high') {
  const key = `h${variant}${detail}`;
  if (!cache.has(key)) cache.set(key, meshField(headField(variant), [-0.1, -0.15, -0.13], [0.1, 0.13, 0.12], detail === 'low' ? 0.005 : detail === 'medium' ? 0.0036 : 0.0026));
  return cache.get(key);
}
export function hairMesh(variant = 0, style = 0, detail = 'high') {
  const key = `r${variant}${style}${detail}`;
  if (!cache.has(key)) cache.set(key, meshField(hairField(variant, style), [-0.1, -0.12, -0.12], [0.1, 0.2, 0.13], detail === 'low' ? 0.005 : detail === 'medium' ? 0.0036 : 0.0026));
  return cache.get(key);
}

// headwear grown from the same skull so it fits snugly: 'hood' (open at the face, draped to the
// shoulders), 'cap' (crown with a curved peak) and 'mohawk' (a ridge of hair over a buzz cut)
function wearField(kind, variant) {
  const hf = headField(variant);
  return (x, y, z) => {
    if (kind === 'mask' || kind === 'band') {
      const hd = hf(x, y, z);
      if (kind === 'mask') return Math.max(hd - 0.008, -(hd - 0.0015), y + 0.014, z + 0.035 - Math.max(0, -y - 0.06) * 0.3);
      return Math.max(hd - 0.017, -(hd - 0.008), Math.abs(y - 0.017) - 0.016, z + 0.03);
    }
    const s = skull(x, y, z);
    if (kind === 'hood') {
      let d = Math.max(s - 0.02, -(s - 0.004));
      d = smin(d, roundCone(x, y, z, [0, -0.04, 0.03], [0, -0.13, 0.05], 0.085, 0.11), 0.03); // drape over the neck
      d = Math.max(d, -(roundCone(x, y, z, [0, -0.04, 0.01], [0, -0.16, 0.02], 0.062, 0.075))); // room for the neck
      d = Math.max(d, -ellipsoid(x, y, z, [0, -0.012, -0.11], [0.062, 0.088, 0.075])); // face opening
      d += Math.sin(Math.atan2(x, z) * 9 + y * 20) * 0.0012 * Math.max(0, -y * 8); // folds
      return d;
    }
    if (kind === 'cap') {
      let d = Math.max(s - 0.007, -(s - 0.001));
      d = Math.max(d, 0.03 - y + Math.max(0, -z - 0.05) * 0.2);
      const peak = Math.max(ellipsoid(x, y, z, [0, 0.032, -0.1], [0.07, 0.006, 0.06]) - (Math.abs(x) * Math.abs(x)) * 0.4, -(z + 0.06));
      return smin(d, peak, 0.006);
    }
    // mohawk
    let d = Math.max(s - 0.005, -(s + 0.0015));
    d = Math.max(d, -hairline(x, y, z, 0) * 0.6);
    const fin = roundCone(x, y, z, [0, 0.105, -0.05], [0, 0.095, 0.075], 0.02, 0.012);
    const ridge = Math.max(fin, Math.abs(x) - 0.012 + (y - 0.1) * 0.05);
    const strands = Math.sin(z * 160) * 0.001;
    return Math.min(d, ridge + strands);
  };
}
export function headwear(kind, detail = 'high', variant = 0) {
  const key = `w${kind}${variant}${detail}`;
  if (!cache.has(key)) cache.set(key, meshField(wearField(kind, variant), [-0.13, -0.2, -0.17], [0.13, 0.17, 0.15], detail === 'low' ? 0.005 : detail === 'medium' ? 0.0036 : 0.0028));
  return cache.get(key);
}
