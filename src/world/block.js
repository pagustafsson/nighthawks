import * as THREE from 'three';
import { BLOCK, STREET } from '../config.js';
import { box, mesh, flatXZ, extrudeXZ, roundPoly, polyPath, ribbon } from '../util.js';

/** Blocket som kvarteret står på: platta, asfalt, trottoarer och kantsten. */
export function buildBlock(M) {
  const g = new THREE.Group();
  g.name = 'block';
  const { x0, x1, z0, z1, roadY, thick } = BLOCK;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;

  // själva plattan, med en ljusare överkant som läser som ett snitt
  g.add(box(w, thick, d, M.slab, cx, roadY - thick / 2 - 0.02, cz));
  g.add(box(w + 0.012, 0.16, d + 0.012, M.slabLip, cx, roadY - 0.085, cz));

  // asfalt över hela ytan
  g.add(
    mesh(
      flatXZ(
        [
          [x0, z0],
          [x1, z0],
          [x1, z1],
          [x0, z1],
        ],
        roadY,
      ),
      M.asphalt,
      { cast: false },
    ),
  );

  // bortre trottoaren (framför tegelhusen)
  g.add(
    mesh(
      extrudeXZ(
        [
          [x0, z0],
          [x1, z0],
          [x1, STREET.farCurbZ],
          [x0, STREET.farCurbZ],
        ],
        roadY,
        0,
      ),
      M.sidewalkFar,
    ),
  );
  g.add(box(w, -roadY + 0.006, 0.17, M.curb, cx, roadY / 2 + 0.003, STREET.farCurbZ - 0.08));

  // trottoaren runt Phillies: följer kilen, med avfasat hörn framför spetsen
  const nearEnd = [z1 - (STREET.chamferB[1] - STREET.chamferB[0]), z1]; // z = x + 5,09
  const raw = [[x1, STREET.dinerFarCurbZ], STREET.chamferA, STREET.chamferB, nearEnd, [x1, z1]];
  const poly = roundPoly(raw, [0, 1.6, 1.1, 0, 0], 14);
  g.add(mesh(extrudeXZ(poly, roadY, 0), M.sidewalk));

  // kantsten längs den fria kanten
  const edge = polyPath(poly.slice(0, poly.length - 1));
  g.add(
    mesh(
      ribbon(edge, [
        [0.006, roadY],
        [0.006, 0.006],
        [-0.17, 0.006],
      ]),
      M.curb,
    ),
  );

  // brunnslock och rännstensgaller
  const lid = new THREE.CylinderGeometry(0.34, 0.34, 0.012, 28);
  for (const [x, z] of [
    [-4.6, 6.4],
    [3.4, -3.1],
  ]) {
    const m = mesh(lid, M.iron, { cast: false });
    m.position.set(x, roadY + 0.006, z);
    g.add(m);
  }
  g.add(box(0.55, 0.012, 0.3, M.iron, -2.2, roadY + 0.006, STREET.farCurbZ + 0.17, { cast: false }));

  return g;
}
