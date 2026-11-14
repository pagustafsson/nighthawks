import * as THREE from 'three';
import { D, CA, SA, DEG, ALPHA } from '../config.js';
import {
  fp,
  FRONT_ROT,
  pathFar,
  pathArc,
  pathFront,
  joinPaths,
  wedgePath,
  ribbon,
  flatXZ,
  flatXZDown,
  box,
  mesh,
  tube,
} from '../util.js';
import { glassTint, glassReflect, blockerMaterial } from '../materials.js';

/**
 * Phillies: sockel, bröstning, glas, takfot, skylt samt rummets väggar och tak.
 * Returnerar även glasets reflexmaterial (får sina kubkartor senare) och de
 * osynliga skuggflaggorna som formar ljuset utanför.
 */
export function buildDiner(M, placeholderCube) {
  const g = new THREE.Group();
  g.name = 'diner';
  const glass = new THREE.Group();
  glass.name = 'glass';
  g.add(glass);

  const { sill, head, farHead, ceil, fasciaTop } = D;
  const tK = D.xK / CA;
  const full = wedgePath(D.xK, tK, 64);
  const add = (geo, mat, o) => {
    const m = mesh(geo, mat, o);
    g.add(m);
    return m;
  };

  // ------------------------------------------------------------- sockel ----
  // delas vid entrédörren så att man kan gå in
  const shellA = joinPaths(pathFar(D.xK, D.tanOff), pathArc(64), pathFront(D.tanOff, D.tDoor[0]));
  const shellB = joinPaths(pathFront(D.tDoor[1], tK));
  for (const p of [shellA, shellB]) {
    add(
      ribbon(p, [
        [0.11, -0.12],
        [0.11, 0.09],
        [0.08, 0.105],
      ]),
      M.dinerBase,
    );
    add(
      ribbon(
        p,
        [
          [0.08, 0.105],
          [0.08, 0.4],
        ],
        { vUnit: true },
      ),
      M.dinerPanel,
    );
    add(
      ribbon(p, [
        [0.08, 0.4],
        [0.12, 0.415],
        [0.12, 0.445],
      ]),
      M.dinerBase,
    );
    add(
      ribbon(p, [
        [0.12, 0.445],
        [0.12, 0.48],
        [0.012, 0.48],
      ]),
      M.sillRim,
    );
    // den jadegröna fönsterbänken på insidan
    add(
      ribbon(p, [
        [0.012, 0.48],
        [-0.26, 0.48],
        [-0.26, 0.44],
        [-0.15, 0.44],
      ]),
      M.sillJade,
    );
    add(
      ribbon(p, [
        [-0.15, 0.44],
        [-0.15, -0.05],
      ]),
      M.sillJade,
    );
  }

  // ------------------------------------------------------------ takfot ----
  add(
    ribbon(full, [
      [0.0, head],
      [0.17, head],
    ]),
    M.fasciaDark,
  );
  add(
    ribbon(full, [
      [0.17, head],
      [0.182, head],
      [0.182, head + 0.04],
      [0.17, head + 0.04],
    ]),
    M.brass,
  );
  add(
    ribbon(full, [
      [0.17, head + 0.04],
      [0.17, 2.8],
    ]),
    M.fascia,
  );
  add(
    ribbon(
      full,
      [
        [0.17, 2.8],
        [0.205, 2.815],
        [0.235, 2.85],
        [0.25, 2.9],
        [0.25, 2.955],
        [0.235, 2.985],
        [0.21, fasciaTop],
      ],
      { smooth: true },
    ),
    M.fascia,
  );
  add(
    ribbon(full, [
      [0.21, fasciaTop],
      [-0.28, fasciaTop],
      [-0.28, 2.9],
    ]),
    M.fasciaDark,
  );
  // takfotens baksida syns genom bakre glaset (som går upp till 2,57)
  add(
    ribbon(joinPaths(pathFar(D.xWinEnd, D.tanOff)), [
      [0.014, head],
      [0.014, 2.66],
    ]),
    M.fasciaDark,
  );

  // tak
  const roofPts = full.map((p) => [p.x - 0.28 * p.nx, p.z - 0.28 * p.nz]);
  add(flatXZ(roofPts, 2.9), M.tar);

  // ------------------------------------------------------------- rummet ----
  const room = joinPaths(pathFar(D.xC, D.tanOff), pathArc(64), pathFront(D.tanOff, D.tR));
  const roomPts = room.map((p) => [p.x - 0.15 * p.nx, p.z - 0.15 * p.nz]);
  const ceiling = add(flatXZDown(roomPts, ceil), M.ceiling, { receive: false });
  ceiling.material.shadowSide = THREE.DoubleSide;
  add(flatXZ(roomPts, 0.004), M.floor, { cast: false });

  // innerbalkar ovanför glaset
  add(
    ribbon(joinPaths(pathArc(64), pathFront(D.tanOff, D.tR)), [
      [0.0, head],
      [-0.15, head],
      [-0.15, ceil],
    ]),
    M.wallInner,
  );
  add(
    ribbon(joinPaths(pathFar(D.xWinEnd, D.tanOff)), [
      [0.0, farHead],
      [-0.15, farHead],
      [-0.15, ceil],
    ]),
    M.wallInner,
  );

  // murpelaren i bakre hörnet
  {
    const w = D.xC + 0.12 - D.xWinEnd;
    add(new THREE.BoxGeometry(w, ceil, D.pierT - 0.03), [M.wall, M.wallShade, M.wall, M.wall, M.wall, M.wall]).position.set(
      D.xWinEnd + w / 2,
      ceil / 2,
      0.03 + (D.pierT - 0.03) / 2,
    );
  }

  // gavelväggen med köksdörren
  {
    const th = 0.12;
    const x = D.xC + th / 2;
    const zR = D.xC - 0.02;
    const [d0, d1] = D.doorZ;
    add(new THREE.BoxGeometry(th, ceil, d0 - D.pierT), M.wall).position.set(x, ceil / 2, (D.pierT + d0) / 2);
    add(new THREE.BoxGeometry(th, ceil, zR - d1), M.wall).position.set(x, ceil / 2, (d1 + zR) / 2);
    add(new THREE.BoxGeometry(th, ceil - D.doorH, d1 - d0), M.wall).position.set(
      x,
      (ceil + D.doorH) / 2,
      (d0 + d1) / 2,
    );
    // dörren
    const dw = d1 - d0;
    add(new THREE.BoxGeometry(0.05, D.doorH, dw), M.door).position.set(D.xC + 0.045, D.doorH / 2, (d0 + d1) / 2);
    add(new THREE.BoxGeometry(0.02, 0.16, 0.12), M.room).position.set(D.xC + 0.014, 1.43, (d0 + d1) / 2 - 0.02);
    const knob = add(new THREE.SphereGeometry(0.022, 12, 8), M.brass);
    knob.position.set(D.xC - 0.005, 1.0, d1 - 0.07);
    // mörkt kök bakom
    add(new THREE.BoxGeometry(1.2, D.doorH, dw + 0.4), M.shopDark, { cast: false }).position.set(
      D.xC + 0.75,
      D.doorH / 2,
      (d0 + d1) / 2,
    );
  }

  // köksdelens ytterväggar (emaljerade plåtar mellan bröstning och takfot)
  const panelProfile = [
    [0.05, sill],
    [0.05, head],
  ];
  add(ribbon(joinPaths(pathFar(D.xK, D.xWinEnd)), panelProfile, { vUnit: true }), M.dinerPanel);
  add(ribbon(joinPaths(pathFront(D.tR, tK)), panelProfile, { vUnit: true }), M.dinerPanel);
  // personaldörr mot bakgatan
  g.add(box(0.9, 2.0, 0.07, M.fasciaDark, 8.85, 1.0, -0.085));
  g.add(box(1.0, 2.08, 0.04, M.dinerBase, 8.85, 1.04, -0.06));
  g.add(box(0.03, 0.12, 0.03, M.brass, 9.2, 1.02, -0.13));

  // ---------------------------------------------------------------- glas ----
  const mats = {
    front: glassReflect(placeholderCube, { strength: 1.0, rim: 0x06110f, rimPow: 4 }),
    far: glassReflect(placeholderCube, { strength: 1.0, rim: 0x06110f, rimPow: 4 }),
    tip: glassReflect(placeholderCube, { strength: 1.1, rim: 0x143a36, rimPow: 3.2 }),
    inside: glassReflect(placeholderCube, { strength: 0.75, rim: 0x050b0a, rimPow: 4, f0: 0.06 }),
  };
  const tintFlat = glassTint(new THREE.Color(0.9, 0.965, 0.94));
  const tintTip = glassTint(new THREE.Color(0.8, 0.94, 0.9));

  const flatPane = (a, b, y0, y1, n, outMat) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const geo = new THREE.BoxGeometry(len, y1 - y0, 0.014);
    const rot = Math.atan2(n[0], n[1]);
    const pos = [(a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2];
    const t = new THREE.Mesh(geo, tintFlat);
    t.position.set(...pos);
    t.rotation.y = rot;
    t.renderOrder = 10;
    const r = new THREE.Mesh(geo, [outMat, outMat, outMat, outMat, outMat, mats.inside]);
    r.position.set(...pos);
    r.rotation.y = rot;
    r.renderOrder = 11;
    glass.add(t, r);
  };

  // bakre rutan – en enda stor skiva
  flatPane([D.xWinEnd, 0], [D.tanOff + 0.03, 0], sill, farHead, [0, -1], mats.far);
  // främre rutorna mellan stolparna
  const nF = [-SA, CA];
  const fr = (t0, t1, y0 = sill, y1 = head) => flatPane(fp(t0), fp(t1), y0, y1, nF, mats.front);
  fr(D.tP1 + 0.035, D.tP2 - 0.028);
  fr(D.tP2 + 0.028, D.tPost - 0.032);
  fr(D.tPost + 0.032, D.tDoor[0] - 0.035);
  fr(D.tDoor[0] + 0.075, D.tDoor[1] - 0.075, 0.2, 2.06); // dörrblad
  fr(D.tDoor[0] + 0.035, D.tDoor[1] - 0.035, 2.16, head); // överljus
  fr(D.tDoor[1] + 0.035, D.tR - 0.02);

  // den böjda rutan i spetsen
  {
    const seg = 56;
    const th = 0.007;
    const a0 = -90 - 1.2;
    const a1 = -90 - (180 - ALPHA / DEG) + 1.6;
    const pos = [];
    const nor = [];
    const idx = [];
    const shell = (rad, sign) => {
      const base = pos.length / 3;
      for (let i = 0; i <= seg; i++) {
        const phi = (a0 + ((a1 - a0) * i) / seg) * DEG;
        const nx = Math.cos(phi);
        const nz = Math.sin(phi);
        for (const y of [sill, head]) {
          pos.push(D.tanOff + rad * nx, y, D.r + rad * nz);
          nor.push(nx * sign, 0, nz * sign);
        }
      }
      const start = idx.length;
      for (let i = 0; i < seg; i++) {
        const a = base + i * 2;
        // vrid trianglarna så att framsidan pekar längs normalen
        if (sign > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      return [start, idx.length - start];
    };
    const outer = shell(D.r + th, 1);
    const inner = shell(D.r - th, -1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setIndex(idx);
    geo.addGroup(outer[0], outer[1], 0);
    geo.addGroup(inner[0], inner[1], 1);
    // kontrollera lindningen mot normalen och vänd vid behov
    fixWinding(geo);
    const t = new THREE.Mesh(geo, [tintTip, tintTip]);
    t.renderOrder = 10;
    const r = new THREE.Mesh(geo, [mats.tip, mats.inside]);
    r.renderOrder = 11;
    glass.add(t, r);
  }

  // ------------------------------------------------------------ stolpar ----
  const frontPost = (t, w, d, mat, y0 = sill, y1 = head, o = 0) => {
    const p = fp(t, o);
    const m = box(w, y1 - y0, d, mat, p[0], (y0 + y1) / 2, p[1]);
    m.rotation.y = FRONT_ROT;
    g.add(m);
    return m;
  };
  frontPost(D.tP1, 0.07, 0.085, M.postDark).castShadow = false;
  frontPost(D.tP2, 0.055, 0.1, M.postMint).castShadow = false;
  frontPost(D.tPost, 0.065, 0.09, M.postDark);
  frontPost(D.tDoor[0], 0.07, 0.13, M.alu, 0, head);
  frontPost(D.tDoor[1], 0.07, 0.13, M.alu, 0, head);
  frontPost(D.tR, 0.07, 0.1, M.postDark);
  g.add(box(0.06, farHead - sill, 0.1, M.postMint, D.tanOff, (sill + farHead) / 2, 0, { cast: false }));
  g.add(box(0.045, farHead - sill, 0.08, M.alu, D.xWinEnd + 0.01, (sill + farHead) / 2, 0));

  // entrédörren: aluminiumram, handtag, tröskel
  {
    const [t0, t1] = D.tDoor;
    const tm = (t0 + t1) / 2;
    const w = t1 - t0 - 0.07;
    frontPost(tm, w, 0.06, M.alu, 2.06, 2.16);
    frontPost(tm, w, 0.05, M.alu, 0.03, 0.2);
    frontPost(t0 + 0.055, 0.04, 0.05, M.alu, 0.2, 2.06);
    frontPost(t1 - 0.055, 0.04, 0.05, M.alu, 0.2, 2.06);
    frontPost(tm, w, 0.16, M.stone, 0, 0.03);
    const a = fp(t0 + 0.14, -0.05);
    const b = fp(t1 - 0.14, -0.05);
    g.add(tube([a[0], 1.05, a[1]], [b[0], 1.05, b[1]], 0.014, 0.014, M.alu, 10));
    const c = fp(t0 + 0.14, 0.05);
    const d = fp(t1 - 0.14, 0.05);
    g.add(tube([c[0], 1.05, c[1]], [d[0], 1.05, d[1]], 0.014, 0.014, M.alu, 10));
  }

  // --------------------------------------------------------------- skylt ----
  {
    const t0 = 2.31;
    const t1 = 7.25;
    const len = t1 - t0;
    const p = fp((t0 + t1) / 2, -0.13);
    const back = M.signBack;
    const m = mesh(new THREE.BoxGeometry(len, D.signH, 0.05), [back, back, back, back, M.signBoard, back]);
    m.position.set(p[0], fasciaTop + D.signH / 2, p[1]);
    m.rotation.y = FRONT_ROT;
    g.add(m);
    // stag bakom skylten
    for (let i = 0; i < 5; i++) {
      const t = t0 + 0.4 + (i * (len - 0.8)) / 4;
      const a = fp(t, -0.1);
      const b = fp(t, 0.45);
      g.add(tube([a[0], fasciaTop + D.signH * 0.8, a[1]], [b[0], 2.92, b[1]], 0.014, 0.014, M.iron, 6));
    }
  }

  // ---------------------------------------------------------- takdetaljer ----
  g.add(box(0.9, 0.42, 0.9, M.aluDull, 8.9, 3.11, 3.4));
  g.add(box(1.0, 0.05, 1.0, M.aluDull, 8.9, 3.34, 3.4));
  const vent = (x, z, h) => {
    g.add(tube([x, 2.9, z], [x, 2.9 + h, z], 0.09, 0.09, M.aluDull, 14));
    const cap = mesh(new THREE.ConeGeometry(0.16, 0.1, 16), M.aluDull);
    cap.position.set(x, 2.9 + h + 0.07, z);
    g.add(cap);
  };
  vent(6.0, 2.2, 0.45);
  vent(8.2, 6.4, 0.6);
  g.add(box(1.3, 0.2, 0.8, M.fasciaDark, 5.0, 3.0, 2.6)); // lanternin

  // ------------------------------------------------------- skuggflaggor ----
  const blockers = {};
  const bm = blockerMaterial();
  const flag = (name, geo) => {
    const m = new THREE.Mesh(geo, bm);
    m.name = name;
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false;
    g.add(m);
    blockers[name] = m;
  };
  {
    // Framför den stora rutan: allt till höger om en sned linje från stolpe P1
    // är avskärmat, i glasets hela höjd. Det ger målningens mörka förgrund och
    // den diagonala ljuskanten – och inget ljus hamnar längre ut i skuggan.
    const pts = [
      [D.tP1 + 0.02, 0.3],
      [D.tP1 + 0.02 + (2.62 - 0.3) / 1.1035, 2.62],
      [tK, 2.62],
      [tK, 0.3],
    ];
    const pos = [];
    for (const [t, y] of pts) {
      const p = fp(t, -0.035);
      pos.push(p[0], y, p[1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    flag('front', geo);
    // hela främre glaset (för ljus som bara ska stanna inomhus)
    const all = [
      [D.tP1, 0.3],
      [D.tP1, 2.6],
      [tK, 2.6],
      [tK, 0.3],
    ];
    const pos2 = [];
    for (const [t, y] of all) {
      const p = fp(t, -0.04);
      pos2.push(p[0], y, p[1]);
    }
    const geo2 = new THREE.BufferGeometry();
    geo2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
    geo2.setIndex([0, 1, 2, 0, 2, 3]);
    flag('frontFull', geo2);
  }
  flag(
    'tip',
    ribbon(joinPaths(pathArc(32)), [
      [0.04, 0.3],
      [0.04, 2.6],
    ]),
  );
  flag(
    'far',
    ribbon(joinPaths(pathFar(D.xWinEnd, D.tanOff)), [
      [0.04, 0.3],
      [0.04, 2.7],
    ]),
  );

  return { group: g, glass, glassMats: mats, blockers };
}

/** Ser till att varje triangel är lindad så att dess yta pekar längs hörnnormalen. */
function fixWinding(geo) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const idx = geo.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const nn = new THREE.Vector3();
  for (let i = 0; i < idx.count; i += 3) {
    const ia = idx.getX(i);
    const ib = idx.getX(i + 1);
    const ic = idx.getX(i + 2);
    a.fromBufferAttribute(p, ia);
    b.fromBufferAttribute(p, ib);
    c.fromBufferAttribute(p, ic);
    b.sub(a);
    c.sub(a);
    b.cross(c);
    nn.fromBufferAttribute(n, ia);
    if (b.dot(nn) < 0) {
      idx.setX(i + 1, ic);
      idx.setX(i + 2, ib);
    }
  }
  idx.needsUpdate = true;
}
