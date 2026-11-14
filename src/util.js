import * as THREE from 'three';
import { ALPHA, CA, SA, D, DEG } from './config.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Punkt på främre glasväggen. t = längs väggen från spetsen, o = inåt i rummet. */
export function fp(t, o = 0) {
  return [t * CA + o * SA, t * SA - o * CA];
}
/** Rotation kring Y som lägger lokala X längs främre väggen. */
export const FRONT_ROT = -ALPHA;

// ---------------------------------------------------------------------------
// Banor längs kilens ytterkontur. Varje punkt har en utåtriktad normal så att
// profiler kan svepas längs konturen (sockel, bröstning, takfot ...).
// ---------------------------------------------------------------------------

export function pathFar(xA, xB) {
  return [
    { x: xA, z: 0, nx: 0, nz: -1 },
    { x: xB, z: 0, nx: 0, nz: -1 },
  ];
}

export function pathArc(seg = 48, rad = D.r, cx = D.tanOff, cz = D.r) {
  const out = [];
  for (let i = 0; i <= seg; i++) {
    const phi = (-90 - (i / seg) * (180 - ALPHA / DEG)) * DEG;
    const nx = Math.cos(phi);
    const nz = Math.sin(phi);
    out.push({ x: cx + rad * nx, z: cz + rad * nz, nx, nz });
  }
  return out;
}

export function pathFront(tA, tB) {
  const a = fp(tA);
  const b = fp(tB);
  return [
    { x: a[0], z: a[1], nx: -SA, nz: CA },
    { x: b[0], z: b[1], nx: -SA, nz: CA },
  ];
}

export function joinPaths(...paths) {
  const out = [];
  for (const p of paths) {
    for (const q of p) {
      const last = out[out.length - 1];
      if (last && Math.hypot(last.x - q.x, last.z - q.z) < 1e-4) continue;
      out.push({ ...q });
    }
  }
  let s = 0;
  out[0].s = 0;
  for (let i = 1; i < out.length; i++) {
    s += Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z);
    out[i].s = s;
  }
  return out;
}

/** Hela konturen: bakre änden → spetsbåge → främre änden. */
export function wedgePath(xEnd, tEnd, seg = 48) {
  return joinPaths(pathFar(xEnd, D.tanOff), pathArc(seg), pathFront(D.tanOff, tEnd));
}

/** Godtycklig polylinje → bana med vänsternormaler (för trottoarkanter m.m.). */
export function polyPath(pts, flip = false) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const s = flip ? -1 : 1;
    out.push({ x: pts[i][0], z: pts[i][1], nx: -dz * s, nz: dx * s });
  }
  return joinPaths(out);
}

/**
 * Sveper en 2D-profil [utåt, höjd] längs en bana.
 * smooth = delade hörn över profilen (rundade former), annars skarpa kanter.
 */
export function ribbon(path, profile, { smooth = false, vUnit = false } = {}) {
  const pos = [];
  const uv = [];
  const idx = [];
  const n = path.length;
  const plen = [0];
  for (let i = 1; i < profile.length; i++) {
    plen.push(plen[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  }
  const total = plen[plen.length - 1] || 1;
  const vOf = (k) => (vUnit ? plen[k] / total : plen[k]);

  if (smooth) {
    const m = profile.length;
    for (let i = 0; i < n; i++) {
      const p = path[i];
      for (let k = 0; k < m; k++) {
        pos.push(p.x + profile[k][0] * p.nx, profile[k][1], p.z + profile[k][0] * p.nz);
        uv.push(p.s, vOf(k));
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < m - 1; k++) {
        const a = i * m + k;
        const b = a + 1;
        const c = a + m;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
  } else {
    for (let k = 0; k < profile.length - 1; k++) {
      const base = pos.length / 3;
      const A = profile[k];
      const B = profile[k + 1];
      for (let i = 0; i < n; i++) {
        const p = path[i];
        pos.push(p.x + A[0] * p.nx, A[1], p.z + A[0] * p.nz);
        uv.push(p.s, vOf(k));
        pos.push(p.x + B[0] * p.nx, B[1], p.z + B[0] * p.nz);
        uv.push(p.s, vOf(k + 1));
      }
      for (let i = 0; i < n - 1; i++) {
        const a = base + i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Lodrät vägg mellan två punkter i planet. */
export function wallGeo(x1, z1, x2, z2, y0, y1) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const l = Math.hypot(dx, dz);
  const path = joinPaths([
    { x: x1, z: z1, nx: -dz / l, nz: dx / l },
    { x: x2, z: z2, nx: -dz / l, nz: dx / l },
  ]);
  return ribbon(path, [
    [0, y0],
    [0, y1],
  ]);
}

function shapeOf(pts, holes) {
  const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], -p[1])));
  if (holes) for (const h of holes) s.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], -p[1]))));
  return s;
}

/** Plan polygon i XZ, normal uppåt. UV = meter. */
export function flatXZ(pts, y, holes) {
  const g = new THREE.ShapeGeometry(shapeOf(pts, holes), 12);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

/** Plan polygon i XZ, normal nedåt (innertak). */
export function flatXZDown(pts, y) {
  const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ShapeGeometry(s, 12);
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

/** Polygon i XZ extruderad mellan y0 och y1. */
export function extrudeXZ(pts, y0, y1, holes) {
  const g = new THREE.ExtrudeGeometry(shapeOf(pts, holes), { depth: y1 - y0, bevelEnabled: false, curveSegments: 12 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

/** Rundar hörnen på en polygon. radii[i] = radie för hörn i (0 = skarpt). */
export function roundPoly(pts, radii, seg = 10) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const rad = radii[i] || 0;
    if (!rad) {
      out.push(p);
      continue;
    }
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const v1 = [a[0] - p[0], a[1] - p[1]];
    const v2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...v1);
    const l2 = Math.hypot(...v2);
    v1[0] /= l1; v1[1] /= l1; v2[0] /= l2; v2[1] /= l2;
    const ang = Math.acos(Math.max(-1, Math.min(1, v1[0] * v2[0] + v1[1] * v2[1])));
    const d = Math.min(rad / Math.tan(ang / 2), l1 * 0.48, l2 * 0.48);
    const rr = d * Math.tan(ang / 2);
    const p1 = [p[0] + v1[0] * d, p[1] + v1[1] * d];
    const p2 = [p[0] + v2[0] * d, p[1] + v2[1] * d];
    const bis = [v1[0] + v2[0], v1[1] + v2[1]];
    const bl = Math.hypot(...bis);
    const cd = rr / Math.sin(ang / 2);
    const c = [p[0] + (bis[0] / bl) * cd, p[1] + (bis[1] / bl) * cd];
    const a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
    let a2 = Math.atan2(p2[1] - c[1], p2[0] - c[0]);
    let da = a2 - a1;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    for (let k = 0; k <= seg; k++) {
      const t = a1 + (da * k) / seg;
      out.push([c[0] + rr * Math.cos(t), c[1] + rr * Math.sin(t)]);
    }
  }
  return out;
}

export function mesh(geo, mat, { cast = true, receive = true, name } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (name) m.name = name;
  return m;
}

export function box(w, h, d, mat, x, y, z, opts) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), mat, opts);
  m.position.set(x, y, z);
  return m;
}

/** Cylinder/kona mellan två punkter. */
export function tube(a, b, ra, rb, mat, seg = 14, opts) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const m = mesh(new THREE.CylinderGeometry(rb, ra, len, seg, 1), mat, opts);
  m.position.copy(va).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

export function ball(rad, mat, x, y, z, sx = 1, sy = 1, sz = 1, opts) {
  const m = mesh(new THREE.SphereGeometry(rad, 20, 14), mat, opts);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}

/** Polylinje som THREE.Curve (för rör längs en kontur). */
export class PolyCurve extends THREE.Curve {
  constructor(pts) {
    super();
    this.pts = pts.map((p) => new THREE.Vector3(...p));
    this.len = [0];
    for (let i = 1; i < this.pts.length; i++) this.len.push(this.len[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
  }
  getPoint(t, target = new THREE.Vector3()) {
    const L = this.len[this.len.length - 1];
    const d = Math.max(0, Math.min(1, t)) * L;
    let i = 1;
    while (i < this.len.length - 1 && this.len[i] < d) i++;
    const seg = this.len[i] - this.len[i - 1] || 1;
    return target.lerpVectors(this.pts[i - 1], this.pts[i], (d - this.len[i - 1]) / seg);
  }
}
