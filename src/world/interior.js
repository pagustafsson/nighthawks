import * as THREE from 'three';
import { D, CA, ALPHA } from '../config.js';
import { fp, pathArc, extrudeXZ, box, mesh, tube, PolyCurve } from '../util.js';

/** Diskens kontur på ett visst avstånd från glasväggarna (sluten triangel med rundad spets). */
function counterOutline(off, tipR, xT, seg = 28) {
  const d = (off + tipR) / Math.sin(ALPHA / 2);
  const cx = d * Math.cos(ALPHA / 2);
  const cz = d * Math.sin(ALPHA / 2);
  const arc = pathArc(seg, tipR, cx, cz).map((p) => [p.x, p.z]);
  return [[xT, off], ...arc, [xT, xT * Math.tan(ALPHA) - off / CA]];
}

export function buildInterior(M) {
  const g = new THREE.Group();
  g.name = 'interior';
  const { cOff, cW, cTipR, cH, thirdX, stoolOff, stoolH } = D;

  // ------------------------------------------------------------- disken ----
  const bodyOuter = counterOutline(cOff, cTipR, thirdX);
  const bodyInner = counterOutline(cOff + cW, 0.1, thirdX - cW);
  g.add(mesh(extrudeXZ(bodyOuter, 0, cH - 0.05, [bodyInner]), M.cherry));
  const topOuter = counterOutline(cOff - 0.04, cTipR + 0.04, thirdX + 0.04);
  const topInner = counterOutline(cOff + cW + 0.035, 0.08, thirdX - cW - 0.035);
  g.add(mesh(extrudeXZ(topOuter, cH - 0.05, cH, [topInner]), M.cherryTop));
  // sparksockel
  const kick = counterOutline(cOff - 0.012, cTipR + 0.012, thirdX + 0.012);
  g.add(mesh(extrudeXZ(kick, 0, 0.1, [counterOutline(cOff + 0.02, cTipR - 0.02, thirdX - 0.02)]), M.shopBlack));

  // fotstöd i mässing längs kundsidan
  {
    const rail = counterOutline(cOff - 0.13, cTipR + 0.13, thirdX - 0.05).map((p) => [p[0], 0.17, p[1]]);
    g.add(mesh(new THREE.TubeGeometry(new PolyCurve(rail), 220, 0.017, 8, false), M.brass));
    const inner = counterOutline(cOff, cTipR, thirdX - 0.05).map((p) => [p[0], 0.17, p[1]]);
    const cA = new PolyCurve(rail);
    const cB = new PolyCurve(inner);
    for (let i = 0; i <= 14; i++) {
      const a = cA.getPoint(i / 14);
      const b = cB.getPoint(i / 14);
      g.add(tube([a.x, a.y, a.z], [b.x, b.y, b.z], 0.01, 0.01, M.brass, 6));
    }
  }

  // arbetshylla i rostfritt på insidan
  {
    const a = counterOutline(cOff + cW - 0.01, 0.1, thirdX - cW + 0.01);
    const b = counterOutline(cOff + cW + 0.22, 0.05, thirdX - cW - 0.22);
    g.add(mesh(extrudeXZ(a, 0.5, 0.52, [b]), M.steel));
  }

  // -------------------------------------------------------------- pallar ----
  const seatGeo = new THREE.CylinderGeometry(0.165, 0.155, 0.05, 28);
  const cushGeo = new THREE.SphereGeometry(0.16, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const postGeo = new THREE.CylinderGeometry(0.022, 0.022, stoolH - 0.07, 12);
  const footGeo = new THREE.CylinderGeometry(0.035, 0.15, 0.045, 24);
  const ringGeo = new THREE.TorusGeometry(0.166, 0.008, 6, 28);
  const stool = (x, z) => {
    const s = new THREE.Group();
    const seat = mesh(seatGeo, M.seat);
    seat.position.y = stoolH - 0.03;
    const cush = mesh(cushGeo, M.seat);
    cush.scale.y = 0.12;
    cush.position.y = stoolH - 0.006;
    const ring = mesh(ringGeo, M.steel);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = stoolH - 0.045;
    const post = mesh(postGeo, M.steel);
    post.position.y = (stoolH - 0.07) / 2 + 0.02;
    const foot = mesh(footGeo, M.steel);
    foot.position.y = 0.024;
    s.add(seat, cush, ring, post, foot);
    s.position.set(x, 0, z);
    g.add(s);
  };
  for (const t of D.stoolsT) stool(...fp(t, stoolOff));
  for (const x of D.farStoolsX) stool(x, stoolOff);

  // ---------------------------------------------------------- kaffeurnor ----
  const urnGeo = new THREE.LatheGeometry(
    [
      [0.0, 0.06],
      [0.15, 0.06],
      [0.166, 0.08],
      [0.17, 0.12],
      [0.17, 0.46],
      [0.162, 0.5],
      [0.135, 0.555],
      [0.085, 0.605],
      [0.032, 0.632],
      [0.03, 0.655],
      [0.046, 0.668],
      [0.046, 0.682],
      [0.0, 0.69],
    ].map((p) => new THREE.Vector2(p[0], p[1])),
    40,
  );
  const urn = (x, z) => {
    const u = new THREE.Group();
    u.add(mesh(urnGeo, M.chrome));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      u.add(tube([Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13], [Math.cos(a) * 0.12, 0.08, Math.sin(a) * 0.12], 0.02, 0.014, M.chrome, 8));
    }
    for (const y of [0.125, 0.455]) {
      const band = mesh(new THREE.TorusGeometry(0.171, 0.007, 6, 36), M.chrome);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      u.add(band);
    }
    // nivåglas och tappkran mot serveringen
    u.add(tube([-0.183, 0.2, 0.03], [-0.183, 0.44, 0.03], 0.011, 0.011, M.gaugeGlass, 8));
    u.add(tube([-0.16, 0.14, -0.04], [-0.26, 0.13, -0.04], 0.014, 0.012, M.chrome, 8));
    u.add(tube([-0.255, 0.13, -0.04], [-0.255, 0.08, -0.04], 0.012, 0.01, M.chrome, 8));
    u.add(tube([-0.24, 0.15, -0.04], [-0.24, 0.2, -0.04], 0.007, 0.012, M.hatBand, 8));
    // sidohandtag
    for (const s of [-1, 1]) u.add(box(0.03, 0.05, 0.03, M.hatBand, 0, 0.36, s * 0.19));
    // inga slagskuggor på väggen bakom – Hoppers gula vägg är ren
    u.traverse((c) => (c.castShadow = false));
    u.position.set(x, cH, z);
    g.add(u);
  };
  urn(6.58, 1.72);
  urn(6.62, 2.22);

  // ------------------------------------------------------------ småsaker ----
  const y0 = cH;
  const mug = (x, z, rot = 0) => {
    const m = new THREE.Group();
    const cup = mesh(new THREE.CylinderGeometry(0.041, 0.034, 0.075, 20), M.ceramic);
    cup.position.y = 0.0375;
    const coffee = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.004, 16), M.hatBand, { cast: false });
    coffee.position.y = 0.07;
    const handle = mesh(new THREE.TorusGeometry(0.021, 0.007, 6, 14), M.ceramic);
    handle.position.set(0.045, 0.04, 0);
    m.add(cup, coffee, handle);
    m.position.set(x, y0, z);
    m.rotation.y = rot;
    g.add(m);
  };
  const napkins = (x, z, rot = 0) => {
    const n = new THREE.Group();
    n.add(box(0.1, 0.15, 0.085, M.steel, 0, 0.075, 0));
    n.add(box(0.075, 0.02, 0.06, M.white, 0, 0.155, 0));
    n.position.set(x, y0, z);
    n.rotation.y = rot;
    g.add(n);
  };
  const shaker = (x, z) => {
    g.add(tube([x, y0, z], [x, y0 + 0.05, z], 0.016, 0.013, M.smallGlass, 10));
    g.add(tube([x, y0 + 0.05, z], [x, y0 + 0.066, z], 0.014, 0.01, M.chrome, 10));
  };
  const tumbler = (x, z) => g.add(tube([x, y0, z], [x, y0 + 0.1, z], 0.026, 0.032, M.smallGlass, 14));
  const jar = (x, z) => {
    g.add(tube([x, y0, z], [x, y0 + 0.1, z], 0.03, 0.03, M.smallGlass, 14));
    g.add(tube([x, y0 + 0.1, z], [x, y0 + 0.125, z], 0.031, 0.012, M.chrome, 14));
  };
  const plate = (x, z) => g.add(tube([x, y0, z], [x, y0 + 0.01, z], 0.05, 0.075, M.ceramic, 20));

  // vid mannen med ryggen mot oss
  mug(...fp(4.46, 1.02), 2.2);
  shaker(...fp(4.62, 0.98));
  plate(3.02, 1.3);
  // bortre disken: sockerströare, servetthållare, ketchup
  jar(4.2, 1.02);
  shaker(4.31, 1.0);
  napkins(4.43, 1.05, 0.2);
  g.add(tube([4.54, y0, 1.08], [4.54, y0 + 0.09, 1.08], 0.02, 0.014, M.ketchup, 10));
  // parets koppar
  mug(5.4, 1.06, -0.6);
  mug(6.3, 1.08, 0.5);
  // närmast servitören
  tumbler(...fp(5.74, 1.02));
  napkins(...fp(5.95, 1.04), -ALPHA);
  shaker(...fp(6.1, 1.0));
  shaker(...fp(6.17, 1.03));
  // koppar staplade vid urnorna
  for (let i = 0; i < 3; i++) mug(6.62, 2.75 + i * 0.11, 1.57);

  return g;
}
