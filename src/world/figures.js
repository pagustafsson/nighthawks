import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { D, CA, SA } from '../config.js';
import { fp, mesh, tube, ball, box } from '../util.js';

// Hoppers fyra nattugglor. Kropparna är svepta ur tvärsnitt (axlar, bröst,
// midja), huvudena skulpterade ur en sfär med käke, ögonhålor och näsa, och
// kläderna har slag, kragar och manschetter. Allt byggs i kod – inga modeller.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gauss = (d, w) => Math.exp(-(d * d) / (w * w));

// ---------------------------------------------------------------------------
// geometri
// ---------------------------------------------------------------------------

/**
 * Sveper en form ur tvärsnitt. Varje snitt: { y, rx, rz, x, z, back, p }
 * rx/rz = halvaxlar, back = faktor för baksidans djup, p = superellips (2 = rund).
 */
export function loft(secs, { segs = 30, capTop = true, capBottom = true } = {}) {
  const pos = [];
  const idx = [];
  for (const s of secs) {
    const e = 2 / (s.p || 2);
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const rz = sn < 0 ? s.rz * (s.back ?? 1) : s.rz;
      pos.push(
        (s.x || 0) + Math.sign(c) * Math.pow(Math.abs(c), e) * s.rx,
        s.y,
        (s.z || 0) + Math.sign(sn) * Math.pow(Math.abs(sn), e) * rz,
      );
    }
  }
  const n = secs.length;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * segs + i;
      const b = j * segs + ((i + 1) % segs);
      idx.push(a, a + segs, b, b, a + segs, b + segs);
    }
  }
  if (capBottom) {
    const s = secs[0];
    const k = pos.length / 3;
    pos.push(s.x || 0, s.y, s.z || 0);
    for (let i = 0; i < segs; i++) idx.push(k, i, (i + 1) % segs);
  }
  if (capTop) {
    const s = secs[n - 1];
    const k = pos.length / 3;
    const base = (n - 1) * segs;
    pos.push(s.x || 0, s.y, s.z || 0);
    for (let i = 0; i < segs; i++) idx.push(k, base + ((i + 1) % segs), base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Platta ytor av trianglar (kavajslag, skjortbröst, näsa). */
function patch(tris, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(2), 3));
  g.computeVertexNormals();
  const mm = mat.clone();
  mm.side = THREE.DoubleSide;
  return mesh(g, mm, { cast: false });
}

const HEADS = {
  man: { W: 0.076, H: 0.118, Dp: 0.098, jaw: 0.4, chin: 0.1, brow: 0.07, socket: 0.11, gaunt: 0.07, nose: 0.03 },
  gaunt: { W: 0.074, H: 0.12, Dp: 0.097, jaw: 0.44, chin: 0.11, brow: 0.08, socket: 0.13, gaunt: 0.12, nose: 0.034 },
  woman: { W: 0.07, H: 0.11, Dp: 0.092, jaw: 0.46, chin: 0.07, brow: 0.025, socket: 0.07, gaunt: 0.02, nose: 0.022 },
};

/** Hårfäste: 1 där det växer hår, 0 i ansiktet. Koordinater på enhetssfären. */
function hairMask(ux, uy, uz) {
  let line;
  if (uz > 0.25) line = 0.3 + sstep(0.25, 0.75, uz) * 0.44;
  else if (uz > -0.35) line = -0.25 + ((uz + 0.35) / 0.6) * 0.55;
  else line = -0.25 - sstep(0.35, 0.85, -uz) * 0.32;
  return sstep(line - 0.035, line + 0.035, uy);
}

/** Huvud skulpterat ur en sfär, med hudton, skuggade ögonhålor och hår som hörnfärger. */
function sculptHead(o, skinHex, hairHex) {
  let g = new THREE.SphereGeometry(1, 48, 34);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-5);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const skin = new THREE.Color(skinHex);
  const hair = new THREE.Color(hairHex);
  const dark = skin.clone().multiply(new THREE.Color(0.5, 0.42, 0.42));
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const ux = p.getX(i);
    const uy = p.getY(i);
    const uz = p.getZ(i);
    let x = ux;
    let z = uz;
    const down = Math.max(0, -uy);
    x *= 1 - o.jaw * Math.pow(down, 1.5);
    z *= uz > 0 ? 1 - 0.16 * Math.pow(down, 1.7) : 1 - 0.34 * Math.pow(down, 1.3);
    let shade = 0;
    if (uz > 0) {
      const ax = Math.abs(ux);
      z += o.chin * gauss(uy + 0.88, 0.17) * gauss(ux, 0.32);
      z += o.brow * gauss(uy - 0.2, 0.09) * (1 - sstep(0.5, 0.9, ax));
      const sock = gauss(ax - 0.38, 0.19) * gauss(uy - 0.07, 0.1);
      z -= o.socket * sock;
      z += 0.03 * gauss(ax - 0.62, 0.2) * gauss(uy + 0.1, 0.14);
      const hc = gauss(ax - 0.5, 0.2) * gauss(uy + 0.45, 0.17);
      z -= o.gaunt * hc;
      x *= 1 - o.gaunt * 0.5 * hc;
      shade = Math.min(1, sock * 0.75 + hc * o.gaunt * 2.5);
    }
    const h = hairMask(ux, uy, uz);
    const r = 1 + 0.03 * h;
    p.setXYZ(i, x * o.W * r, uy * o.H * r, z * o.Dp * r);
    c.copy(skin).lerp(dark, shade).lerp(hair, h);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Ytans djup (z) framtill på huvudet vid en viss x, y. */
function surf(geo, x, y) {
  const p = geo.attributes.position;
  let best = Infinity;
  let z = 0;
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) < 0) continue;
    const d = (p.getX(i) - x) ** 2 + (p.getY(i) - y) ** 2;
    if (d < best) {
      best = d;
      z = p.getZ(i);
    }
  }
  return z;
}

export function fedora(matHat, matBand, pinch = 0.3) {
  const h = new THREE.Group();
  const crown = loft(
    [
      { y: 0, rx: 0.094, rz: 0.109 },
      { y: 0.04, rx: 0.092, rz: 0.106 },
      { y: 0.08, rx: 0.086, rz: 0.1 },
      { y: 0.103, rx: 0.074, rz: 0.09 },
      { y: 0.113, rx: 0.055, rz: 0.072 },
      { y: 0.117, rx: 0.032, rz: 0.048 },
      { y: 0.118, rx: 0.012, rz: 0.02 },
    ],
    { segs: 44, capBottom: false },
  );
  // veck längs hjässan och nyp framtill
  const p = crown.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const top = sstep(0.094, 0.116, y);
    const pin = sstep(0.0, 0.09, z) * sstep(0.045, 0.11, y);
    p.setXYZ(i, x * (1 - pinch * pin), y - 0.021 * top * gauss(x, 0.026), z);
  }
  crown.computeVertexNormals();
  h.add(mesh(crown, matHat));

  // brätte: nedvikt fram, uppvikt bak och på sidorna
  const rings = 5;
  const segs = 56;
  const pos = [];
  const idx = [];
  for (let k = 0; k <= rings; k++) {
    const t = k / rings;
    const rx = 0.094 + (0.158 - 0.094) * t;
    const rz = 0.109 + (0.184 - 0.109) * t;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const front = Math.max(0, s);
      const back = Math.max(0, -s);
      const y = t * (-0.024 * front * front + 0.014 * back + 0.016 * c * c) + 0.006 * sstep(0.7, 1, t);
      pos.push(rx * c, y, rz * s);
    }
  }
  for (let k = 0; k < rings; k++) {
    for (let i = 0; i < segs; i++) {
      const a = k * segs + i;
      const b = k * segs + ((i + 1) % segs);
      idx.push(a, a + segs, b, b, a + segs, b + segs);
    }
  }
  const brim = new THREE.BufferGeometry();
  brim.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  brim.setIndex(idx);
  brim.computeVertexNormals();
  const brimMat = matHat.clone();
  brimMat.side = THREE.DoubleSide;
  h.add(mesh(brim, brimMat));

  h.add(
    mesh(
      loft(
        [
          { y: 0.001, rx: 0.0958, rz: 0.1108 },
          { y: 0.031, rx: 0.0942, rz: 0.1082 },
        ],
        { segs: 44, capTop: false, capBottom: false },
      ),
      matBand,
    ),
  );
  return h;
}

/** Servitörens vita båtmössa: uppvikt kant och en skarp ås fram till bak. */
export function sodaCap(mat) {
  const g = new THREE.Group();
  g.add(
    mesh(
      loft(
        [
          { y: 0, rx: 0.082, rz: 0.102 },
          { y: 0.04, rx: 0.08, rz: 0.104 },
          { y: 0.078, rx: 0.04, rz: 0.102, p: 2.4 },
          { y: 0.098, rx: 0.005, rz: 0.097 },
        ],
        { segs: 32 },
      ),
      mat,
    ),
  );
  g.add(
    mesh(
      loft(
        [
          { y: -0.002, rx: 0.086, rz: 0.106 },
          { y: 0.034, rx: 0.087, rz: 0.108 },
        ],
        { segs: 32, capTop: false, capBottom: false },
      ),
      mat,
    ),
  );
  return g;
}

/** Hand med handrygg, fyra fingrar och tumme. Lokalt +Z = fingrarnas riktning, +Y = handryggen. */
function hand(mat, side, curl = 0.3) {
  const h = new THREE.Group();
  h.add(ball(1, mat, 0, 0, 0.034, 0.035, 0.015, 0.04));
  const fingers = new THREE.Group();
  fingers.position.set(0, -0.002, 0.066);
  fingers.rotation.x = curl;
  h.add(fingers);
  const xs = [-0.026, -0.009, 0.008, 0.024]; // pekfinger → lillfinger
  const len = [0.058, 0.066, 0.061, 0.048];
  for (let i = 0; i < 4; i++) {
    const x = side * xs[i]; // pekfingret hamnar närmast tummen
    const tip = [x * 1.12, -0.006 - curl * 0.006, len[i]];
    fingers.add(tube([x, 0, -0.004], tip, 0.0088, 0.007, mat, 8));
    fingers.add(ball(0.007, mat, ...tip));
  }
  const t0 = [-side * 0.027, -0.004, 0.02];
  const t1 = [-side * 0.05, -0.012, 0.07];
  h.add(tube(t0, t1, 0.011, 0.0082, mat, 8));
  h.add(ball(0.0082, mat, ...t1));
  return h;
}

/**
 * Tvåledad arm i figurens koordinater: axel S → armbåge → handled W.
 * hint = hållet armbågen böjs åt, up = handryggens riktning.
 */
function arm(g, S, W, hint, o) {
  const l1 = o.l1;
  const l2 = o.l2;
  const d = W.clone().sub(S);
  let dist = d.length();
  const max = l1 + l2 - 0.004;
  if (dist > max) {
    W = S.clone().addScaledVector(d.normalize(), max);
    dist = max;
  } else d.normalize();
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = hint.clone().addScaledVector(d, -hint.dot(d)).normalize();
  const E = S.clone().addScaledVector(d, a).addScaledVector(perp, hgt);
  const fdir = W.clone().sub(E).normalize();
  const sl = o.sleeve;
  const sk = o.skin;

  if (o.short) {
    // kort puffärm, bar arm
    g.add(ball(0.07, sl, S.x, S.y, S.z));
    const mid = S.clone().lerp(E, 0.4);
    g.add(tube(S.toArray(), E.toArray(), 0.047, 0.04, sk, 14));
    g.add(tube(S.toArray(), mid.toArray(), 0.066, 0.056, sl, 14));
    g.add(ball(0.041, sk, E.x, E.y, E.z));
    g.add(tube(E.toArray(), W.toArray(), 0.04, 0.03, sk, 14));
  } else {
    g.add(ball(0.06, sl, S.x, S.y, S.z));
    g.add(tube(S.toArray(), E.toArray(), 0.058, 0.05, sl, 14));
    g.add(ball(0.05, sl, E.x, E.y, E.z));
    const cuffAt = E.clone().lerp(W, 0.9);
    g.add(tube(E.toArray(), cuffAt.toArray(), 0.05, 0.04, sl, 14));
    if (o.cuff) g.add(tube(cuffAt.toArray(), W.clone().addScaledVector(fdir, 0.012).toArray(), 0.036, 0.034, o.cuff, 12));
    else g.add(tube(cuffAt.toArray(), W.toArray(), 0.041, 0.038, sl, 12));
  }

  // handen: ligger plant om den vilar på disken
  const f = fdir.clone();
  if (o.flat) {
    f.y = 0;
    f.normalize();
  }
  const r = new THREE.Vector3().crossVectors(o.up, f).normalize();
  const u = new THREE.Vector3().crossVectors(f, r);
  const h = hand(sk, o.side, o.curl ?? 0.3);
  h.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, f));
  h.position.copy(W);
  g.add(h);
}

// ---------------------------------------------------------------------------
// kroppar
// ---------------------------------------------------------------------------

const TORSO = {
  // kavaj: vadderade axlar, lite kutig rygg
  jacket: [
    { y: -0.09, rx: 0.19, rz: 0.15, back: 1.05 },
    { y: -0.02, rx: 0.18, rz: 0.138, back: 1.05 },
    { y: 0.08, rx: 0.168, rz: 0.122, back: 1.06 },
    { y: 0.17, rx: 0.172, rz: 0.12, back: 1.08, z: 0.004 },
    { y: 0.27, rx: 0.19, rz: 0.124, back: 1.1, z: 0.008 },
    { y: 0.37, rx: 0.212, rz: 0.117, back: 1.13, z: 0.01, p: 2.3 },
    { y: 0.44, rx: 0.222, rz: 0.1, back: 1.16, z: 0.012, p: 2.6 },
    { y: 0.478, rx: 0.165, rz: 0.086, back: 1.15, z: 0.014, p: 2.3 },
    { y: 0.505, rx: 0.086, rz: 0.07, z: 0.016 },
    { y: 0.52, rx: 0.06, rz: 0.056, z: 0.018 },
  ],
  // vit servitörsrock, smalare
  whites: [
    { y: -0.12, rx: 0.172, rz: 0.13, back: 1.05 },
    { y: 0.0, rx: 0.165, rz: 0.122, back: 1.05 },
    { y: 0.12, rx: 0.16, rz: 0.115, back: 1.06 },
    { y: 0.26, rx: 0.178, rz: 0.118, back: 1.1, z: 0.006 },
    { y: 0.37, rx: 0.198, rz: 0.112, back: 1.12, z: 0.01, p: 2.2 },
    { y: 0.44, rx: 0.206, rz: 0.096, back: 1.14, z: 0.012, p: 2.4 },
    { y: 0.478, rx: 0.155, rz: 0.084, back: 1.14, z: 0.014 },
    { y: 0.505, rx: 0.082, rz: 0.068, z: 0.016 },
    { y: 0.52, rx: 0.058, rz: 0.055, z: 0.018 },
  ],
  dress: [
    { y: -0.07, rx: 0.172, rz: 0.13 },
    { y: 0.02, rx: 0.16, rz: 0.118 },
    { y: 0.12, rx: 0.122, rz: 0.094 },
    { y: 0.2, rx: 0.132, rz: 0.104, z: 0.008 },
    { y: 0.27, rx: 0.148, rz: 0.116, z: 0.016 },
    { y: 0.34, rx: 0.158, rz: 0.1, z: 0.01 },
    { y: 0.4, rx: 0.172, rz: 0.084, z: 0.006, p: 2.2 },
    { y: 0.435, rx: 0.13, rz: 0.07, z: 0.006 },
    { y: 0.455, rx: 0.07, rz: 0.058, z: 0.008 },
  ],
};

function buildHead(o, mats) {
  const h = new THREE.Group();
  const P = HEADS[o.face];
  const geo = sculptHead(P, mats.skin.color.getHex(), o.hairMat.color.getHex());
  h.add(mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 })));
  const sz = (x, y) => surf(geo, x, y);

  // näsa – ett par plana ytor, som i måleriet
  {
    const yb = P.H * 0.24;
    const yu = -P.H * 0.33;
    const B = [0, yb, sz(0, yb) + 0.001];
    const U = [0, yu, sz(0, yu) - 0.001];
    const T = [0, -P.H * 0.25, sz(0, yu) + P.nose];
    const Lw = [0.016, yu + 0.004, sz(0.016, yu) - 0.001];
    const Rw = [-0.016, yu + 0.004, sz(0.016, yu) - 0.001];
    h.add(
      patch(
        [
          [B, T, Lw],
          [B, Rw, T],
          [T, U, Lw],
          [T, Rw, U],
        ],
        mats.skin,
      ),
    );
  }
  // öron
  for (const s of [-1, 1]) {
    const e = ball(1, mats.skin, s * P.W * 0.97, -0.006, -0.008, 0.009, 0.027, 0.017);
    e.rotation.y = s * 0.35;
    h.add(e);
  }
  // ögon, ögonbryn, mun
  const ex = P.W * 0.4;
  const ey = P.H * 0.065;
  for (const s of [-1, 1]) {
    h.add(ball(1, mats.eye, s * ex, ey, sz(ex, ey) + 0.0008, 0.0105, o.female ? 0.0026 : 0.0036, 0.003, { cast: false }));
    const by = ey + P.H * (o.female ? 0.16 : 0.13);
    const b = box(0.027, o.female ? 0.003 : 0.005, 0.005, o.browMat || o.hairMat, s * ex, by, sz(ex, by) + 0.001, { cast: false });
    b.rotation.z = -s * 0.1;
    h.add(b);
  }
  const my = -P.H * 0.55;
  h.add(
    ball(1, o.female ? mats.lips : mats.mouth, 0, my, sz(0, my) + 0.0006, o.female ? 0.016 : 0.018, o.female ? 0.0058 : 0.0032, 0.004, {
      cast: false,
    }),
  );

  if (o.female) {
    // långt, vågigt hår som faller bakom axlarna
    let hg = new THREE.SphereGeometry(1, 44, 30);
    hg.deleteAttribute('uv');
    hg.deleteAttribute('normal');
    hg = mergeVertices(hg, 1e-5);
    const p = hg.attributes.position;
    const sway = Math.tan(o.headPitch || 0); // håret ska hänga lodrätt fast huvudet är böjt
    for (let i = 0; i < p.count; i++) {
      const ux = p.getX(i);
      const uy = p.getY(i);
      const uz = p.getZ(i);
      let x = ux;
      let y = uy;
      let z = uz;
      let t = 0;
      // ansiktet lämnas fritt; luggen faller snett över pannan
      const face = uz > 0.1 && uy < 0.5 + 0.2 * ux && Math.abs(ux) < 0.74;
      if (face) {
        x *= 0.72;
        y *= 0.72;
        z *= 0.72;
      } else {
        const wave = 1 + 0.035 * Math.sin(Math.atan2(uz, ux) * 9 + uy * 6);
        x *= wave;
        z *= wave;
        if (uy < -0.05) {
          t = sstep(0.05, 1, -uy);
          y = uy - t * 1.25;
          x *= 1 + 0.5 * t * (1 - t);
          z = z * (1 - 0.25 * t) - 0.42 * t;
        }
      }
      const ym = y * P.H * 1.16 + 0.006;
      p.setXYZ(i, x * P.W * 1.3, ym, z * P.Dp * 1.26 - 0.006 + Math.max(0, -ym) * sway * t);
    }
    hg.computeVertexNormals();
    h.add(mesh(hg, o.hairMat));
  }

  if (o.hat) {
    o.hat.position.set(0, P.H * 0.5 + (o.hatY || 0), o.hatZ || 0);
    o.hat.rotation.set(o.hatTilt ?? 0.1, 0, o.hatRoll || 0);
    h.add(o.hat);
  }
  return h;
}

/**
 * Bygger en figur. Lokalt: +Z = framåt, +X = figurens vänstra sida, Y upp.
 * Sittande: origo på pallens sits. Stående: origo på golvet.
 */
function figure(o) {
  const g = new THREE.Group();
  const m = o.mats;
  const hipY = o.seated ? 0.1 : o.hipY || 0.88;

  // ben
  if (o.seated) {
    g.add(ball(1, m.pants, 0, 0.09, -0.01, 0.176, 0.1, 0.15));
    for (const s of [-1, 1]) {
      const knee = [s * 0.105, 0.085, 0.38];
      const ankle = [s * 0.1, -0.29, 0.31];
      g.add(tube([s * 0.085, 0.095, 0.02], knee, 0.083, 0.064, m.pants, 14));
      g.add(ball(0.066, m.pants, ...knee));
      g.add(tube(knee, ankle, 0.06, 0.043, m.legs || m.pants, 14));
      g.add(ball(1, m.shoe, s * 0.1, -0.325, 0.355, 0.043, 0.032, 0.105));
    }
    if (o.female) g.add(ball(1, m.top, 0, 0.088, 0.2, 0.2, 0.086, 0.245)); // kjolen över låren
    if (o.tail) g.add(ball(1, m.top, 0, -0.045, -0.165, 0.168, 0.105, 0.03)); // kavajskört bakom pallen
  } else {
    g.add(ball(1, m.pants, 0, hipY, 0, 0.17, 0.12, 0.135));
    for (const s of [-1, 1]) {
      const knee = [s * 0.095, hipY * 0.55, 0.12];
      g.add(tube([s * 0.09, hipY, 0], knee, 0.083, 0.062, m.pants, 14));
      g.add(ball(0.062, m.pants, ...knee));
      g.add(tube(knee, [s * 0.095, 0.07, 0], 0.06, 0.046, m.pants, 14));
      g.add(ball(1, m.shoe, s * 0.095, 0.035, 0.055, 0.047, 0.035, 0.115));
    }
  }

  // bål
  const torso = new THREE.Group();
  torso.position.set(0, hipY, o.seated ? -0.02 : 0);
  torso.rotation.set(o.lean, o.twist || 0, o.roll || 0, 'YXZ');
  g.add(torso);
  const shape = o.style === 'dress' ? 'dress' : o.style === 'whites' ? 'whites' : 'jacket';
  torso.add(mesh(loft(TORSO[shape], { segs: 36 }), m.top));
  const neckR = o.female ? 0.036 : 0.046;
  const headY = o.female ? 0.6 : 0.655;
  torso.add(tube([0, o.female ? 0.44 : 0.5, 0.012], [0, headY - 0.07, 0.03], neckR + 0.004, neckR, m.skin, 14));

  const collar = (y0, y1, r0, r1, mat) =>
    torso.add(
      mesh(
        loft(
          [
            { y: y0, rx: r0, rz: r0 * 0.94, z: 0.018 },
            { y: y1, rx: r1, rz: r1 * 0.94, z: 0.021 },
          ],
          { segs: 24, capTop: false, capBottom: false },
        ),
        mat,
      ),
    );

  if (o.style === 'suitFront') {
    // skjortbröst, slips och kavajslag
    const A = [-0.052, 0.498, 0.079];
    const B = [0.052, 0.498, 0.079];
    const Mi = [0, 0.42, 0.127];
    const C = [0, 0.3, 0.137];
    torso.add(
      patch(
        [
          [A, C, Mi],
          [Mi, C, B],
          [A, Mi, B],
        ],
        m.shirt,
      ),
    );
    torso.add(
      patch(
        [
          [
            [-0.015, 0.485, 0.092],
            [0, 0.315, 0.141],
            [0.015, 0.485, 0.092],
          ],
        ],
        m.tie,
      ),
    );
    torso.add(box(0.03, 0.026, 0.02, m.tie, 0, 0.487, 0.087));
    for (const s of [-1, 1]) {
      const top = [s * 0.034, 0.502, 0.09];
      const inner = [s * 0.022, 0.4, 0.137];
      const outer = [s * 0.112, 0.432, 0.117];
      const bottom = [0, 0.283, 0.146];
      torso.add(
        patch(
          [
            [top, inner, outer],
            [inner, bottom, outer],
          ],
          m.lapel,
        ),
      );
    }
    collar(0.5, 0.536, 0.059, 0.055, m.shirt);
  } else if (o.style === 'suitBack' || o.style === 'whites') {
    collar(0.498, 0.536, 0.074, 0.062, m.top);
    collar(0.534, 0.549, 0.056, 0.054, m.shirt);
    if (o.style === 'whites') {
      torso.add(box(0.035, 0.03, 0.02, m.tie, 0, 0.5, 0.079));
      for (let i = 0; i < 4; i++) torso.add(ball(0.008, m.button, 0, 0.42 - i * 0.085, 0.124, 1, 1, 0.5, { cast: false }));
    }
  } else if (o.style === 'dress') {
    // v-ringning och nyckelben
    const A = [-0.058, 0.452, 0.064];
    const B = [0.058, 0.452, 0.064];
    const C = [0, 0.335, 0.118];
    const Mi = [0, 0.41, 0.094];
    torso.add(
      patch(
        [
          [A, C, Mi],
          [Mi, C, B],
          [A, Mi, B],
        ],
        m.skin,
      ),
    );
    torso.add(ball(1, m.skin, 0, 0.452, 0.012, 0.075, 0.016, 0.058));
  }

  // armar – i figurens koordinater
  torso.updateMatrix();
  const sx = o.female ? 0.165 : o.style === 'whites' ? 0.188 : 0.203;
  const sy = o.female ? 0.395 : 0.432;
  for (const s of [-1, 1]) {
    const S = V(s * sx, sy, 0.012).applyMatrix4(torso.matrix);
    const a = s > 0 ? o.L : o.R;
    arm(g, S, a.wrist, a.hint, {
      side: s,
      sleeve: m.top,
      skin: m.skin,
      cuff: m.cuff,
      short: o.style === 'dress',
      flat: a.flat ?? true,
      up: a.up || V(0, 1, 0),
      curl: a.curl,
      l1: o.female ? 0.27 : 0.3,
      l2: o.female ? 0.24 : 0.26,
    });
  }

  // huvud – riktas i figurens egna koordinater så att en framåtböjd figur
  // ändå kan hålla huvudet upprätt
  const hd = buildHead(o, m);
  hd.position.copy(V(0, headY, 0.03).applyMatrix4(torso.matrix));
  hd.rotation.set(o.headPitch || 0, o.turn || 0, o.headRoll || 0, 'YXZ');
  g.add(hd);
  return g;
}

// ---------------------------------------------------------------------------

export function buildFigures(M) {
  const g = new THREE.Group();
  g.name = 'figures';
  const std = (c, r = 0.7) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const eye = std(0x1e1512, 0.4);
  const mouth = std(0x8f5a4a, 0.6);
  const shirtWhite = std(0xe9e9e2, 0.8);
  const lapelNavy = std(0x2e406e, 0.8);
  const bandGrey = std(0x2b2f31, 0.7);
  const browRed = std(0x5c2a16, 0.6);
  const cy = D.cH - D.stoolH; // diskens höjd över sitsen

  // 1 — mannen med ryggen mot oss: kutar lätt, glas i höger hand
  {
    const p = fp(D.stoolsT[1], D.stoolOff);
    const f = figure({
      seated: true,
      style: 'suitBack',
      tail: true,
      face: 'man',
      lean: 0.26,
      twist: -0.06,
      mats: { top: M.suitGrey, pants: M.suitGrey, skin: M.skin, shoe: M.shoe, shirt: shirtWhite, cuff: shirtWhite, eye, mouth },
      hairMat: M.hairDark,
      hat: fedora(M.hatGrey, bandGrey),
      hatTilt: 0.02,
      hatRoll: 0.05,
      headPitch: 0.3,
      turn: -0.28,
      headRoll: 0.06,
      L: { wrist: V(0.1, cy + 0.03, 0.43), hint: V(0.9, -0.3, -0.3) },
      R: { wrist: V(-0.21, cy + 0.075, 0.43), hint: V(-0.9, -0.2, -0.4), flat: false, up: V(-0.7, 0.5, 0.3), curl: 1.0 },
    });
    // glaset han håller
    f.add(tube([-0.215, cy, 0.535], [-0.215, cy + 0.1, 0.535], 0.026, 0.031, M.smallGlass, 14, { cast: false }));
    f.position.set(p[0], D.stoolH, p[1]);
    f.rotation.y = Math.atan2(SA, -CA);
    g.add(f);
  }

  // 2 — mannen i mörkblå kostym: lutad över disken, cigarett mellan fingrarna
  {
    const f = figure({
      seated: true,
      style: 'suitFront',
      tail: true,
      face: 'gaunt',
      lean: 0.38,
      twist: 0.1,
      mats: {
        top: M.suitNavy,
        pants: M.suitNavy,
        skin: M.skin,
        shoe: M.shoe,
        shirt: M.shirtBlue,
        cuff: M.shirtBlue,
        tie: M.hatBand,
        lapel: lapelNavy,
        eye,
        mouth,
      },
      hairMat: M.hairDark,
      hat: fedora(M.hatBlue, M.hatBand),
      hatTilt: 0.16,
      headPitch: 0.12,
      turn: 0.3,
      L: { wrist: V(0.19, cy + 0.03, 0.44), hint: V(1, -0.15, -0.5) },
      R: { wrist: V(-0.03, cy + 0.03, 0.46), hint: V(-1, -0.15, -0.3) },
    });
    f.add(tube([-0.02, cy + 0.035, 0.57], [-0.05, cy + 0.04, 0.635], 0.0038, 0.0038, M.white, 6, { cast: false }));
    f.position.set(D.farStoolsX[3], D.stoolH, D.stoolOff);
    g.add(f);
  }

  // 3 — kvinnan i rött: blicken sänkt mot det hon håller i höger hand
  {
    const f = figure({
      seated: true,
      female: true,
      style: 'dress',
      face: 'woman',
      lean: 0.3,
      twist: -0.12,
      mats: { top: M.dressRed, pants: M.dressRed, legs: M.skinPale, skin: M.skinPale, shoe: M.shoe, eye, mouth, lips: M.lips },
      hairMat: M.hairRed,
      browMat: browRed,
      headPitch: 0.36,
      turn: -0.3,
      headRoll: -0.06,
      // vänster underarm vilar tvärs över disken, höger hand lyft mot ansiktet
      L: { wrist: V(0.0, cy + 0.03, 0.42), hint: V(1, -0.2, 0.2) },
      R: { wrist: V(-0.115, cy + 0.165, 0.36), hint: V(-0.5, -1, 0.5), flat: false, up: V(0.1, 0.25, 1), curl: 0.9 },
    });
    f.add(box(0.034, 0.05, 0.007, M.paper, -0.108, cy + 0.272, 0.372, { cast: false }));
    f.position.set(D.farStoolsX[4], D.stoolH, D.stoolOff);
    g.add(f);
  }

  // 4 — servitören: böjd bakom disken, vänd längs disken så att han syns i profil
  {
    const f = figure({
      seated: false,
      style: 'whites',
      face: 'man',
      hipY: 0.72,
      lean: 0.95,
      mats: { top: M.white, pants: M.white, skin: M.skin, shoe: M.shoe, shirt: M.white, tie: M.hatBand, button: shirtWhite, eye, mouth },
      hairMat: M.hairBlond,
      hat: sodaCap(M.white),
      hatTilt: -0.12,
      hatY: 0.012,
      headPitch: 0.06,
      turn: 0.2,
      L: { wrist: V(0.24, 0.5, 0.42), hint: V(0.7, 0.3, -0.6), flat: false, up: V(0, 0.4, -1) },
      R: { wrist: V(-0.1, 0.42, 0.5), hint: V(-0.7, 0.3, -0.6), flat: false, up: V(0, 0.4, -1) },
    });
    f.position.set(5.6, 0, 3.3);
    f.rotation.y = Math.atan2(-0.95, 0.3);
    g.add(f);
  }

  return g;
}
