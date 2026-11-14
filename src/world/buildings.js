import * as THREE from 'three';
import { BLOCK, STREET, D, CA, SA } from '../config.js';
import { box, mesh, tube, extrudeXZ, flatXZ, rng } from '../util.js';
import { glassTint, glassReflect } from '../materials.js';

// ---------------------------------------------------------------------------
// hjälpare
// ---------------------------------------------------------------------------

/** Låda med UV i meter (så att tegelmönstret får rätt skala på alla sidor). */
function worldBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
    }
  }
  return g;
}
function wbox(w, h, d, mat, x, y, z, opts) {
  const m = mesh(worldBox(w, h, d), mat, opts);
  m.position.set(x, y, z);
  return m;
}

/** Tegelskiva med riktiga fönsterhål. Lokalt: x längs fasaden, framsida i z = 0 mot +Z. */
function facadeGeo(w, y0, y1, holes, thick = 0.25) {
  const s = new THREE.Shape();
  s.moveTo(0, y0);
  s.lineTo(w, y0);
  s.lineTo(w, y1);
  s.lineTo(0, y1);
  s.closePath();
  for (const h of holes) {
    const p = new THREE.Path();
    p.moveTo(h.x, h.y);
    p.lineTo(h.x + h.w, h.y);
    p.lineTo(h.x + h.w, h.y + h.h);
    p.lineTo(h.x, h.y + h.h);
    p.closePath();
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick);
  return g;
}

function windowUnit(M, w, h, { blind = 0.5, blindMat, stone } = {}) {
  const g = new THREE.Group();
  g.add(box(w + 0.02, h + 0.02, 0.02, M.room, w / 2, h / 2, -0.235, { cast: false }));
  const bh = h * blind;
  if (bh > 0.03) g.add(box(w - 0.05, bh, 0.012, blindMat || M.blind, w / 2, h - bh / 2 - 0.02, -0.17, { cast: false }));
  const f = 0.035;
  const z = -0.125;
  g.add(box(w, f, 0.05, M.sash, w / 2, f / 2, z));
  g.add(box(w, f, 0.05, M.sash, w / 2, h - f / 2, z));
  g.add(box(f, h, 0.05, M.sash, f / 2, h / 2, z));
  g.add(box(f, h, 0.05, M.sash, w - f / 2, h / 2, z));
  g.add(box(w, 0.04, 0.055, M.sash, w / 2, h * 0.5, z + 0.01));
  g.add(box(w + 0.2, 0.11, 0.17, stone || M.stone, w / 2, -0.055, 0.025));
  g.add(box(w + 0.2, 0.13, 0.07, stone || M.stone, w / 2, h + 0.065, 0.012));
  return g;
}

/** Butiksfasad i målat trä: pilastrar, gesims, skyltfönster och indragen dörr. */
function shopfront(M, W, o, paneMats) {
  const g = new THREE.Group();
  const P = o.paint;
  const L = o.paintLt || P;
  const glassTop = 2.94;
  const tr = [2.49, 2.64];
  const sillY = 0.39;

  g.add(box(W, 0.29, 0.3, P, W / 2, 3.145, 0.03));
  g.add(box(W, 0.07, 0.44, L, W / 2, 3.315, 0.06));
  g.add(box(W, 0.06, 0.12, P, W / 2, 2.97, 0.0));
  g.add(box(W, 0.06, 0.2, M.stoneDark, W / 2, 0.03, 0.04));

  const pil = (x, w) => {
    g.add(box(w, 3.0, 0.16, P, x, 1.5, 0.02));
    g.add(box(w + 0.06, 0.2, 0.2, P, x, 0.1, 0.03));
    g.add(box(w + 0.05, 0.1, 0.19, L, x, 2.9, 0.03));
  };

  const pane = (cx, y0, y1, w, z = -0.02) => {
    const geo = new THREE.PlaneGeometry(w, y1 - y0);
    const t = new THREE.Mesh(geo, paneMats.tint);
    t.position.set(cx, (y0 + y1) / 2, z);
    t.renderOrder = 8;
    const r = new THREE.Mesh(geo, paneMats.reflect);
    r.position.copy(t.position);
    r.renderOrder = 9;
    g.add(t, r);
  };

  const bay = (xa, xb) => {
    const w = xb - xa;
    const cx = (xa + xb) / 2;
    g.add(box(w, sillY - 0.04, 0.1, P, cx, (sillY + 0.04) / 2 + 0.01, 0.0));
    if (w > 0.6) g.add(box(w - 0.24, sillY - 0.17, 0.014, L, cx, sillY / 2 + 0.02, 0.052));
    g.add(box(w, 0.045, 0.15, P, cx, sillY, 0.0));
    g.add(box(w, tr[1] - tr[0], 0.09, P, cx, (tr[0] + tr[1]) / 2, 0.0));
    pane(cx, sillY + 0.02, tr[0], w);
    pane(cx, tr[1], glassTop, w);
    if (o.interior === 'blinds') {
      g.add(box(w, glassTop - sillY, 0.02, o.shade || M.shopDark, cx, (glassTop + sillY) / 2, -0.1, { cast: false }));
    } else {
      // skyltfönstrets podium
      g.add(box(w, 0.45, 0.8, M.shopDisplay, cx, sillY + 0.225, -0.46));
    }
  };

  pil(0, 0.2);
  pil(W, 0.2);
  if (o.doorW) {
    const d0 = o.doorAt - o.doorW / 2;
    const d1 = o.doorAt + o.doorW / 2;
    pil(d0 - 0.07, 0.14);
    pil(d1 + 0.07, 0.14);
    bay(0.1, d0 - 0.14);
    bay(d1 + 0.14, W - 0.1);
    // indragen dörr
    const rz = -0.6;
    const dw = o.doorW;
    g.add(box(dw, 2.34, 0.05, P, o.doorAt, 1.27, rz));
    g.add(box(dw - 0.22, 1.05, 0.02, M.room, o.doorAt, 1.7, rz + 0.03, { cast: false }));
    g.add(box(dw - 0.22, 0.6, 0.014, L, o.doorAt, 0.55, rz + 0.03));
    g.add(box(0.03, 0.14, 0.04, M.brass, o.doorAt + dw / 2 - 0.1, 1.08, rz + 0.05));
    g.add(box(dw, 0.1, 0.09, P, o.doorAt, 2.44, rz));
    g.add(box(dw, glassTop - 2.49, 0.02, M.room, o.doorAt, (glassTop + 2.49) / 2, rz, { cast: false }));
    g.add(box(0.04, glassTop, -rz, P, d0, glassTop / 2, rz / 2));
    g.add(box(0.04, glassTop, -rz, P, d1, glassTop / 2, rz / 2));
    g.add(box(dw, 0.1, -rz, M.stone, o.doorAt, 0.05, rz / 2));
    g.add(box(dw, 0.06, -rz, P, o.doorAt, 2.97, rz / 2));
    g.add(box(dw + 0.12, 0.07, 0.3, M.stone, o.doorAt, 0.035, 0.13));
  } else {
    bay(0.1, W - 0.1);
  }

  if (o.interior === 'open') {
    const dep = 3.4;
    g.add(box(W - 0.2, 0.1, dep, M.shopFloor, W / 2, 0.15, -dep / 2 - 0.05));
    g.add(box(W - 0.2, 3.0, 0.1, M.shopWall, W / 2, 1.5, -dep));
    g.add(box(0.1, 3.0, dep, M.shopWall, 0.15, 1.5, -dep / 2 - 0.05));
    g.add(box(0.1, 3.0, dep, M.shopWall, W - 0.15, 1.5, -dep / 2 - 0.05));
    g.add(box(W - 0.2, 0.1, dep, M.shopDark, W / 2, 3.02, -dep / 2 - 0.05));
    // butiksdisk och hyllor längst in
    g.add(box(Math.min(2.2, W - 1), 0.95, 0.5, o.paint, W / 2 + 0.4, 0.675, -2.3));
    g.add(box(W - 0.6, 0.04, 0.3, M.shopFloor, W / 2, 1.5, -dep + 0.2));
    g.add(box(W - 0.6, 0.04, 0.3, M.shopFloor, W / 2, 2.0, -dep + 0.2));
  }
  if (o.extras) o.extras(g, sillY);
  return g;
}

function waterTank(M) {
  const g = new THREE.Group();
  for (const [x, z] of [
    [-0.75, -0.75],
    [0.75, -0.75],
    [-0.75, 0.75],
    [0.75, 0.75],
  ]) {
    g.add(tube([x, 0, z], [x * 0.9, 1.5, z * 0.9], 0.05, 0.05, M.iron, 8));
  }
  g.add(tube([-0.75, 0.6, -0.75], [0.75, 1.3, -0.75], 0.025, 0.025, M.iron, 6));
  g.add(tube([0.75, 0.6, 0.75], [-0.75, 1.3, 0.75], 0.025, 0.025, M.iron, 6));
  g.add(tube([-0.75, 0.6, 0.75], [-0.75, 1.3, -0.75], 0.025, 0.025, M.iron, 6));
  g.add(tube([0.75, 0.6, -0.75], [0.75, 1.3, 0.75], 0.025, 0.025, M.iron, 6));
  g.add(box(1.9, 0.1, 1.9, M.signBack, 0, 1.55, 0));
  const tank = mesh(new THREE.CylinderGeometry(1.02, 1.08, 1.9, 28), M.signBack);
  tank.position.y = 2.55;
  g.add(tank);
  for (const y of [1.85, 2.5, 3.2]) {
    const band = mesh(new THREE.TorusGeometry(1.06 - (y - 1.6) * 0.03, 0.022, 6, 36), M.iron);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    g.add(band);
  }
  const roof = mesh(new THREE.ConeGeometry(1.14, 0.7, 28), M.tar);
  roof.position.y = 3.85;
  g.add(roof);
  return g;
}

// ---------------------------------------------------------------------------
// husraden på andra sidan gatan
// ---------------------------------------------------------------------------

function rowHouse(M, o, paneMats) {
  const g = new THREE.Group();
  const { xa, xb, H, brick } = o;
  const zf = STREET.facadeZ;
  const zb = BLOCK.z0;
  const W = xb - xa;
  const front = new THREE.Group();
  front.position.set(xa, 0, zf);
  g.add(front);

  // fönsterhål
  const holes = [];
  const rand = rng(o.seed || 1);
  for (const fl of o.floors) {
    for (const cx of o.winX) {
      holes.push({ x: cx - xa - o.winW / 2, y: fl[0], w: o.winW, h: fl[1] - fl[0], cx });
    }
  }
  front.add(mesh(facadeGeo(W, 3.35, H, holes), brick));
  for (const h of holes) {
    // ett av fönstren har rullgardinen dragen till mitten, som i målningen
    const special = o.halfBlindAt !== undefined && Math.abs(h.cx - o.halfBlindAt) < 0.01 && h.y < 4;
    const u = windowUnit(M, h.w, h.h, {
      blind: special ? 0.55 : 0.32 + rand() * 0.38,
      blindMat: rand() > 0.82 ? M.blindPale : M.blind,
      stone: o.stone,
    });
    u.position.set(h.x, h.y, 0);
    front.add(u);
  }
  // takgesims
  front.add(box(W, 0.3, 0.34, o.stone || M.stone, W / 2, H - 0.55, 0.05));
  front.add(box(W, 0.1, 0.44, o.stone || M.stone, W / 2, H - 0.36, 0.08));

  // butiker
  for (const s of o.shops) {
    const sf = shopfront(M, s.xb - s.xa, s, paneMats);
    sf.position.set(s.xa - xa, 0, 0);
    front.add(sf);
  }

  // stomme: tegel på gavlarna, snittyta mot blockets kanter
  const roofY = H - 0.5;
  const cutW = o.cutWest ? M.cut : brick;
  const cutE = o.cutEast ? M.cut : brick;
  const upper = [cutE, cutW, M.tar, M.cut, M.cut, M.cut];
  const zc = (zf - 0.27 + zb) / 2;
  g.add(wbox(W, roofY - 3.3, zf - 0.27 - zb, upper, (xa + xb) / 2, (roofY + 3.3) / 2, zc));
  const zl = zf - 3.5;
  g.add(wbox(W, 3.3, zl - zb, [cutE, cutW, M.cut, M.cut, M.shopDark, M.cut], (xa + xb) / 2, 1.65, (zl + zb) / 2));
  // Gavlar i bottenvåningen: butikszonen framför stommen är annars öppen åt
  // sidorna, så att man ser rakt in i huset från kvarterets kant.
  const zs = zf - 0.06;
  g.add(wbox(0.2, 3.3, zs - zl, cutW, xa + 0.1, 1.65, (zs + zl) / 2));
  g.add(wbox(0.2, 3.3, zs - zl, cutE, xb - 0.1, 1.65, (zs + zl) / 2));
  // murkrön runt taket
  g.add(wbox(0.26, 0.5, zf - zb - 0.26, cutW === M.cut ? M.cut : brick, xa + 0.13, roofY + 0.25, (zf - 0.26 + zb) / 2));
  g.add(wbox(0.26, 0.5, zf - zb - 0.26, cutE === M.cut ? M.cut : brick, xb - 0.13, roofY + 0.25, (zf - 0.26 + zb) / 2));
  g.add(wbox(W, 0.5, 0.2, M.cut, (xa + xb) / 2, roofY + 0.25, zb + 0.1));
  if (o.roof) o.roof(g, roofY);
  return g;
}

export function buildBuildings(M, placeholderCube) {
  const g = new THREE.Group();
  g.name = 'buildings';
  const paneMats = {
    tint: glassTint(new THREE.Color(0.72, 0.84, 0.8)),
    reflect: glassReflect(placeholderCube, { strength: 0.55, rim: 0x020504, rimPow: 4, f0: 0.05 }),
  };
  paneMats.tint.side = THREE.DoubleSide;

  // --- röda tegelhuset (det i målningen) ---------------------------------
  const step = 1.265;
  const winX = [];
  for (let k = -6; k <= 4; k++) winX.push(0.39 + step * k);
  g.add(
    rowHouse(
      M,
      {
        xa: BLOCK.x0,
        xb: 7.1,
        H: 9.1,
        brick: M.brickRed,
        seed: 7,
        winX,
        winW: 0.55,
        floors: [
          [3.69, 5.03],
          [6.44, 7.78],
        ],
        halfBlindAt: 0.39,
        cutWest: true,
        shops: [
          { xa: BLOCK.x0, xb: -6.4, paint: M.shopOlive, paintLt: M.shopOlive, interior: 'blinds' },
          { xa: -6.4, xb: -1.88, paint: M.shopOlive, paintLt: M.shopGreen, doorAt: 2.26, doorW: 0.89, interior: 'open' },
          {
            xa: -1.88,
            xb: 2.62,
            paint: M.shopGreen,
            paintLt: M.shopGreenLt,
            doorAt: 2.215,
            doorW: 0.89,
            interior: 'open',
            extras: (s, sillY) => {
              // kassaapparaten i högra skyltfönstret och en liten skylt i det vänstra
              s.add(box(0.52, 0.16, 0.42, M.shopDisplay, 3.42, sillY + 0.45 + 0.08, -0.4));
              s.add(box(0.4, 0.2, 0.32, M.iron, 3.42, sillY + 0.71, -0.4));
              s.add(box(0.4, 0.12, 0.14, M.iron, 3.42, sillY + 0.87, -0.47));
              s.add(box(0.3, 0.05, 0.02, M.brass, 3.42, sillY + 0.96, -0.4));
              s.add(box(0.3, 0.16, 0.012, M.paper, 1.24, 2.06, -0.09));
            },
          },
          { xa: 2.62, xb: 7.1, paint: M.shopNavy, paintLt: M.shopNavy, doorAt: 2.24, doorW: 0.89, interior: 'blinds', shade: M.shopShade },
        ],
        roof: (b, y) => {
          b.add(wbox(0.7, 1.3, 0.6, M.brickRed, -5.2, y + 0.65, -9.6));
          b.add(wbox(0.7, 1.1, 0.6, M.brickRed, 3.2, y + 0.55, -10.2));
          b.add(wbox(1.8, 2.1, 2.4, M.brickRed, -1.2, y + 1.05, -9.4));
          b.add(box(2.0, 0.08, 2.6, M.tar, -1.2, y + 2.14, -9.4));
          b.add(box(0.8, 1.7, 0.05, M.shopOlive, -1.2, y + 0.85, -8.18));
          b.add(box(1.6, 0.25, 1.1, M.aluDull, 5.0, y + 0.13, -8.6));
        },
      },
      paneMats,
    ),
  );

  // --- grannhuset (mörkare tegel, en våning högre) -----------------------
  g.add(
    rowHouse(
      M,
      {
        xa: 7.1,
        xb: BLOCK.x1,
        H: 12.0,
        brick: M.brickDark,
        stone: M.stoneDark,
        seed: 19,
        winX: [8.05, 9.4, 10.75, 12.1],
        winW: 0.78,
        floors: [
          [3.95, 5.5],
          [6.7, 8.25],
          [9.45, 11.0],
        ],
        cutEast: true,
        shops: [
          { xa: 7.1, xb: BLOCK.x1, paint: M.shopNavy, paintLt: M.shopNavy, doorAt: 2.95, doorW: 0.95, interior: 'blinds', shade: M.shopShade },
        ],
        roof: (b, y) => {
          const t = waterTank(M);
          t.position.set(10.4, y, -9.1);
          b.add(t);
          b.add(wbox(0.6, 1.0, 0.6, M.brickDark, 8.0, y + 0.5, -10.3));
        },
      },
      paneMats,
    ),
  );

  // --- hörnhuset bakom Phillies -------------------------------------------
  {
    const xK = D.xK;
    const x1 = BLOCK.x1;
    const z1 = BLOCK.z1;
    const H = 10.4;
    const roofY = H - 0.5;
    const ins = 0.26;
    const dg = ins / CA;
    const core = [
      [xK + ins, ins],
      [x1, ins],
      [x1, z1],
      [z1 + dg, z1],
      [xK + ins, xK + ins - dg],
    ];
    g.add(mesh(extrudeXZ(core, 0, roofY), M.cut));
    g.add(mesh(flatXZ(core, roofY + 0.002), M.tar, { cast: false }));

    const face = (origin, rotY, W, y0, wins, floors, extra) => {
      const f = new THREE.Group();
      f.position.set(origin[0], 0, origin[1]);
      f.rotation.y = rotY;
      const holes = [];
      for (const fl of floors) for (const cx of wins) holes.push({ x: cx - 0.36, y: fl[0], w: 0.72, h: fl[1] - fl[0] });
      f.add(mesh(facadeGeo(W, y0, H, holes), M.brickBrown));
      const rand = rng(Math.round(W * 100));
      for (const h of holes) {
        const u = windowUnit(M, h.w, h.h, { blind: 0.25 + rand() * 0.5, stone: M.stoneDark });
        u.position.set(h.x, h.y, 0);
        f.add(u);
      }
      f.add(box(W, 0.26, 0.3, M.stoneDark, W / 2, H - 0.5, 0.04));
      if (extra) extra(f);
      g.add(f);
    };
    const floors = [
      [3.9, 5.35],
      [6.35, 7.8],
      [8.6, 9.75],
    ];
    // mot bakgatan
    face([x1, 0], Math.PI, x1 - xK, 0, [0.85, 1.95], floors, (f) => {
      f.add(box(x1 - xK, 0.9, 0.06, M.stoneDark, (x1 - xK) / 2, 0.45, 0.03));
    });
    // brandgavel ovanför Phillies tak
    face([xK, 0], -Math.PI / 2, xK, 2.9, [2.4, 5.1, 7.8], floors.slice(1));
    // mot gatan framför
    const dl = (z1 - xK) / CA;
    face([xK, xK], -Math.PI / 4, dl, 0, [1.45], floors, (f) => {
      f.add(box(dl, 0.9, 0.06, M.stoneDark, dl / 2, 0.45, 0.03));
      f.add(box(0.95, 2.2, 0.08, M.shopBlack, 1.45, 1.2, 0.02));
      f.add(box(1.15, 0.14, 0.4, M.stone, 1.45, 0.07, 0.2));
      f.add(box(1.15, 0.14, 0.1, M.stoneDark, 1.45, 2.37, 0.04));
    });
    g.add(wbox(0.7, 1.4, 0.7, M.brickBrown, 12.0, roofY + 0.7, 2.0));
    g.add(box(1.4, 0.5, 2.0, M.aluDull, 11.8, roofY + 0.25, 6.5));
  }

  return { group: g, paneMats };
}
