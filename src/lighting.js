import * as THREE from 'three';
import { STREET } from './config.js';
import { fp } from './util.js';
import { cookie } from './textures.js';
import { blockerMaterial } from './materials.js';

// Ljuset i målningen har en enda källa: lysrören inne på Phillies. Här byggs
// det upp av skuggkastande punktljus under innertaket. Varje ljus får sin egen
// uppsättning osynliga "flaggor" (se diner.js) så att ljuset faller som hos
// Hopper: en blek solfjäder ut ur glasspetsen, mörk trottoar framför den stora
// rutan och en upplyst tegelyta med sned skuggkant tvärs över gatan.

const FLUOR = 0xf2f5cf; // lysrörens bleka gulgröna ton

export function buildLighting(scene) {
  const L = { points: [] };

  L.hemi = new THREE.HemisphereLight(0x8aa6b4, 0x1b2823, 0.24);
  scene.add(L.hemi);

  // Svagt månljus snett bakifrån: ger taken och husens baksidor form när man
  // flyger runt, men lämnar fasaderna mot betraktaren – och trottoaren framför
  // Phillies, som ligger i husets månskugga – lika mörka som i målningen.
  const moon = new THREE.DirectionalLight(0xa6c2d8, 0.42);
  moon.name = 'moon';
  moon.position.set(15, 27, -22);
  moon.target.position.set(2, 0, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera;
  sc.left = -26;
  sc.right = 26;
  sc.top = 26;
  sc.bottom = -26;
  sc.near = 1;
  sc.far = 90;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.06;
  moon.shadow.radius = 3;
  moon.shadow.autoUpdate = false;
  moon.shadow.needsUpdate = true;
  scene.add(moon, moon.target);
  L.moon = moon;

  const point = (name, color, intensity, pos, { size = 1024, radius = 5, decay = 2 } = {}) => {
    const p = new THREE.PointLight(color, intensity, 70, decay);
    p.name = name;
    p.position.set(...pos);
    p.castShadow = true;
    p.shadow.mapSize.set(size, size);
    // Djupet i en punktljuskarta är inte linjärt: marginalen (bias) anges i
    // normaliserat djup och växer med avståndet i kvadrat. Den måste vara
    // mycket liten, annars börjar skuggan först decimetrar bakom det som
    // skuggar och ljus läcker ut vid sockelns fot.
    p.shadow.camera.near = 0.12;
    p.shadow.camera.far = 70;
    p.shadow.bias = -0.00012;
    p.shadow.normalBias = 0.03;
    p.shadow.radius = radius;
    p.shadow.autoUpdate = false;
    p.shadow.needsUpdate = true;
    scene.add(p);
    L[name] = p;
    L.points.push(p);
    return p;
  };

  // spetsen: ger ljuspölen på trottoaren och den smala skuggan runt sockeln
  // (svag avståndsdämpning: Hoppers ljus ligger jämnt över hela trottoaren)
  point('tip', FLUOR, 7.5, [2.55, 2.5, 1.15], { size: 2048, radius: 7, decay: 0.6 });
  // rummets lysrör
  point('mainA', FLUOR, 22, [4.6, 2.58, 0.95], { radius: 6 });
  point('mainB', FLUOR, 14, [6.0, 2.58, 3.9], { radius: 6 });
  // studsljus från disk, golv och väggar – stannar inomhus
  point('bounce', 0xf7e6a2, 4.5, [4.95, 1.2, 2.75], { radius: 10 });
  // ljus längs fönsterraden: ryggar, pallar, diskens framsida och den gröna bänken
  const fa = fp(4.5, 0.14);
  const fb = fp(6.9, 0.14);
  point('fillA', FLUOR, 3.2, [fa[0], 1.75, fa[1]], { radius: 10 });
  point('fillB', FLUOR, 3.6, [fb[0], 1.75, fb[1]], { radius: 10 });

  // Osynliga lampskärmar: taklamporna lyser nedåt och utåt men bränner inte ut
  // väggbanden närmast taket (de har eget ljus, se materialen).
  const shadeMat = blockerMaterial();
  for (const l of [L.tip, L.mainA, L.mainB]) {
    const h = 2.8 - l.position.y + 0.02;
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, h, 20, 1, true), shadeMat);
    shade.position.set(l.position.x, l.position.y + h / 2, l.position.z);
    shade.castShadow = true;
    shade.frustumCulled = false;
    scene.add(shade);
  }

  // ljuset som faller på tegelhuset tvärs över gatan, format med en mask
  const spot = new THREE.SpotLight(0xf6f1c6, 175, 45, 0.98, 0.3, 2);
  spot.name = 'facade';
  spot.position.set(3.5, 1.75, -0.5);
  spot.target.position.set(3.0, 2.7, STREET.facadeZ);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.camera.near = 0.3;
  spot.shadow.camera.far = 40;
  spot.shadow.bias = -0.0003;
  spot.shadow.normalBias = 0.02;
  spot.shadow.radius = 3;
  spot.shadow.autoUpdate = false;
  spot.shadow.needsUpdate = true;
  scene.add(spot, spot.target);
  L.facade = spot;
  spot.map = facadeCookie(spot);

  return L;
}

/** Projicerar den upplysta ytan på fasaden (mått ur målningen) till ljusets mask. */
function facadeCookie(spot) {
  const cam = new THREE.PerspectiveCamera(THREE.MathUtils.RAD2DEG * 2 * spot.angle, 1, 0.3, 60);
  cam.position.copy(spot.position);
  cam.lookAt(spot.target.position);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const zf = STREET.facadeZ;
  const zc = STREET.farCurbZ - 0.1;
  const uv = (x, y, z = zf) => {
    const v = new THREE.Vector3(x, y, z).project(cam);
    return [v.x * 0.5 + 0.5, v.y * 0.5 + 0.5];
  };
  // Ljuset når fasaden och trottoaren framför den – inte gatan närmast lampan.
  const g0 = uv(-40, 0, zc);
  const g1 = uv(40, 0, zc);
  const dim = [g0, g1, [2, 2], [-1, 2]];
  // Lodrät vänsterkant vid x = −0,45 och sned överkant som faller åt höger.
  // Kanten fortsätter över trottoaren längs strålen från lampan.
  const k = (zc - spot.position.z) / (zf - spot.position.z);
  const xg = spot.position.x + (-0.45 - spot.position.x) * k;
  const lit = [
    uv(xg, 0, zc),
    uv(-0.45, 0),
    uv(-0.45, 4.78),
    uv(1.9, 4.32),
    uv(6.6, 3.45),
    uv(13, 2.6),
    uv(13, 0),
    uv(13, 0, zc),
  ];
  return cookie(dim, lit, 0.16, 2.5);
}

/**
 * Skuggorna är statiska och ritas en gång, i omgångar – så kan varje ljus få
 * sina egna flaggor.
 */
export function bakeShadows(renderer, scene, camera, L, blockers, softCasters) {
  const flags = Object.values(blockers);
  const run = (lights, active, hide = []) => {
    for (const f of flags) f.castShadow = active.includes(f.name);
    const restore = [];
    for (const o of hide) {
      o.traverse((c) => {
        if (c.isMesh && c.castShadow) {
          c.castShadow = false;
          restore.push(c);
        }
      });
    }
    for (const l of lights) l.shadow.needsUpdate = true;
    renderer.render(scene, camera);
    for (const c of restore) c.castShadow = true;
  };
  const key = [L.tip, L.mainA, L.mainB, L.facade, L.moon];
  const soft = [L.bounce, L.fillA, L.fillB];
  run([...key, ...soft], []);
  run(key, ['front']);
  run(soft, ['frontFull', 'tip', 'far'], softCasters);
  for (const f of flags) f.castShadow = false;
}

/**
 * Fångar omgivningen i kubkartor från några punkter. Glaset speglar dem
 * (gatan utåt, det upplysta rummet inåt) och krom/lack får rummets ljus.
 */
export function captureEnvironments(renderer, scene, hide) {
  const vis = hide.map((o) => o.visible);
  hide.forEach((o) => (o.visible = false));
  const shot = (pos, size = 256) => {
    const rt = new THREE.WebGLCubeRenderTarget(size, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    const cam = new THREE.CubeCamera(0.08, 90, rt);
    cam.position.set(...pos);
    cam.update(renderer, scene);
    return rt;
  };
  const f = fp(5.4, -2.4);
  const env = {
    inside: shot([5.0, 1.45, 2.7]),
    front: shot([f[0], 1.4, f[1]]),
    far: shot([4.4, 1.4, -2.2]),
    tip: shot([0.2, 1.4, 0.4]),
    shop: shot([0.6, 1.5, -5.5]),
  };
  hide.forEach((o, i) => (o.visible = vis[i]));
  const pmrem = new THREE.PMREMGenerator(renderer);
  env.insidePMREM = pmrem.fromCubemap(env.inside.texture).texture;
  pmrem.dispose();
  return env;
}

export function nightEnvironment(renderer, equirect) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const t = pmrem.fromEquirectangular(equirect).texture;
  pmrem.dispose();
  return t;
}
