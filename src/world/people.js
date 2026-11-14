import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { D, CA, SA } from '../config.js';
import { fp, tube, ball, box } from '../util.js';
import { fedora, loft } from './figures.js';

// De fyra nattugglorna som riggade människomodeller ur Microsofts
// Rocketbox-bibliotek (MIT-licens, se tools/rocketbox). Poserna sätts i kod
// via skelettet, och en 48 sekunder lång slinga ger dem liv: paret småpratar,
// mannen tar bloss, servitören arbetar och nickar, den ensamme sitter stilla.

export const LOOP = 48;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0);
const Y = V(0, 1, 0);
const Z = V(0, 0, 1);
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** 0 → 1 mellan a och b, 1 → 0 mellan c och d (mjukt). */
const bump = (t, a, b, c, d) => ease((t - a) / (b - a)) * (1 - ease((t - c) / (d - c)));
/** Sinus med en period som går jämnt upp i slingan. */
const wave = (t, cycles, phase = 0) => Math.sin(TAU * ((t * cycles) / LOOP + phase));

function basis(F, U) {
  const f = F.clone().normalize();
  const r = new THREE.Vector3().crossVectors(U, f).normalize();
  const u = new THREE.Vector3().crossVectors(f, r);
  return new THREE.Matrix4().makeBasis(r, u, f);
}

class Person {
  /**
   * gltf: inläst modell. hip: bäckenets läge i figurens koordinater
   * (+Z framåt, +X figurens vänstra sida, origo = sitsen eller golvet).
   */
  constructor(gltf, { hip }) {
    this.root = new THREE.Group();
    const model = gltf.scene;
    this.model = model;
    this.root.add(model);
    this.meshes = [];
    model.traverse((c) => {
      if (c.isSkinnedMesh) {
        this.meshes.push(c);
        c.castShadow = true;
        c.receiveShadow = true;
        c.frustumCulled = false;
        const m = c.material;
        if (m.name === 'hair') {
          // hårkort och ögonfransar: skarp alfa, utjämnad av kantutjämningen
          m.transparent = false;
          m.alphaTest = 0.35;
          m.alphaToCoverage = true;
          m.side = THREE.DoubleSide;
          m.depthWrite = true;
        }
        m.envMapIntensity = 0.6;
      }
    });
    this.b = {};
    for (const bone of this.meshes[0].skeleton.bones) this.b[bone.name.replace(/^Bip01_?/, '')] = bone;

    // vrid modellen så att den tittar längs +Z och sätt bäckenet på plats
    this.root.updateMatrixWorld(true);
    const wp = (n) => this.b[n].getWorldPosition(new THREE.Vector3());
    const fwd = wp('L_Toe0').sub(wp('L_Foot')).add(wp('R_Toe0').sub(wp('R_Foot')));
    model.rotation.y = -Math.atan2(fwd.x, fwd.z);
    this.root.updateMatrixWorld(true);
    model.position.add(hip.clone().sub(wp('Pelvis')));
    this.root.updateMatrixWorld(true);

    // viloläget (T-pose) i figurens koordinater
    this.rest = {};
    for (const [name, bone] of Object.entries(this.b)) {
      this.rest[name] = {
        q: bone.quaternion.clone(),
        p: bone.position.clone(),
        wq: bone.getWorldQuaternion(new THREE.Quaternion()),
        wp: bone.getWorldPosition(new THREE.Vector3()),
      };
    }
    this.len = {};
    for (const s of ['L', 'R']) {
      this.len[`${s}_arm1`] = this.rest[`${s}_UpperArm`].wp.distanceTo(this.rest[`${s}_Forearm`].wp);
      this.len[`${s}_arm2`] = this.rest[`${s}_Forearm`].wp.distanceTo(this.rest[`${s}_Hand`].wp);
      this.len[`${s}_leg1`] = this.rest[`${s}_Thigh`].wp.distanceTo(this.rest[`${s}_Calf`].wp);
      this.len[`${s}_leg2`] = this.rest[`${s}_Calf`].wp.distanceTo(this.rest[`${s}_Foot`].wp);
    }
    // handens riktningar i vila: F = fingrarna, U = handryggen
    this.hand0 = {};
    for (const s of ['L', 'R']) {
      const h = this.rest[`${s}_Hand`].wp;
      const F = this.rest[`${s}_Finger2`].wp.clone().sub(h).normalize();
      const side = this.rest[`${s}_Finger1`].wp.clone().sub(this.rest[`${s}_Finger4`].wp);
      let U = new THREE.Vector3().crossVectors(side, F).normalize();
      if (U.y < 0) U.negate();
      U = new THREE.Vector3().crossVectors(F, new THREE.Vector3().crossVectors(U, F)).normalize();
      this.hand0[s] = { F, U, inv: basis(F, U).transpose(), axis: new THREE.Vector3().crossVectors(U, F).normalize() };
    }
    // skallens mått i viloläget: används för att passa in hattar och hitta munnen
    this.skull = this.measureHead();
    this.mouth0 = V(this.skull.band(0.16, 0.21).cx, this.skull.top - 0.19, this.skull.band(0.16, 0.21).z1 - 0.004).sub(this.rest.Head.wp);
    this.rInv = new THREE.Matrix4();
    this.rQinv = new THREE.Quaternion();
    this.morph = {};
  }

  /** Mäter huvudets form ur de hörn som följer huvudbenet. */
  measureHead(names = ['head']) {
    const sk = this.meshes[0].skeleton;
    const set = new Set();
    const add = (bone) => {
      set.add(sk.bones.indexOf(bone));
      for (const c of bone.children) if (c.isBone) add(c);
    };
    add(this.b.Head);
    this.root.updateMatrixWorld(true);
    sk.update();
    const pts = [];
    for (const m of this.meshes) {
      if (!names.includes(m.material.name)) continue;
      const P = m.geometry.attributes.position;
      const I = m.geometry.attributes.skinIndex;
      const W = m.geometry.attributes.skinWeight;
      for (let i = 0; i < P.count; i++) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (set.has(I.getComponent(i, k))) w += W.getComponent(i, k);
        // (hörnens läge måste räknas via skelettet – nätets egen placering gäller inte för skinnade nät)
        if (w > 0.6) pts.push(m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld));
      }
    }
    let top = -Infinity;
    for (const q of pts) top = Math.max(top, q.y);
    /** Huvudets utbredning mellan d0 och d1 meter under hjässan. */
    const band = (d0, d1) => {
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (const q of pts) {
        const d = top - q.y;
        if (d < d0 || d > d1) continue;
        x0 = Math.min(x0, q.x);
        x1 = Math.max(x1, q.x);
        z0 = Math.min(z0, q.z);
        z1 = Math.max(z1, q.z);
      }
      return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2, z1 };
    };
    return { top, band };
  }

  /** Anropas när figuren har ställts på plats i scenen. */
  place() {
    this.root.updateMatrixWorld(true);
    this.rInv.copy(this.root.matrixWorld).invert();
    this.root.getWorldQuaternion(this.rQinv).invert();
  }

  // --- läsa och sätta ben i figurens koordinater ---------------------------
  pos(name) {
    return this.b[name].getWorldPosition(new THREE.Vector3()).applyMatrix4(this.rInv);
  }
  quat(bone) {
    return bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(this.rQinv);
  }
  setQuat(name, q) {
    const bone = this.b[name];
    bone.quaternion.copy(this.quat(bone.parent).invert().multiply(q));
  }
  turn(name, axis, angle) {
    if (!angle) return;
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    this.setQuat(name, q.multiply(this.quat(this.b[name])));
  }
  aim(name, child, dir) {
    const d0 = this.pos(child).sub(this.pos(name)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(d0, dir.clone().normalize());
    this.setQuat(name, q.multiply(this.quat(this.b[name])));
  }

  reset() {
    for (const [name, bone] of Object.entries(this.b)) {
      bone.quaternion.copy(this.rest[name].q);
      bone.position.copy(this.rest[name].p);
    }
  }

  /** Bål: framåtlutning, vridning och sidolutning fördelas över ryggraden. */
  spine(lean, twist = 0, roll = 0) {
    this.turn('Pelvis', X, lean * 0.18);
    for (const [name, w] of [
      ['Spine', 0.3],
      ['Spine1', 0.27],
      ['Spine2', 0.25],
    ]) {
      this.turn(name, X, lean * w);
      this.turn(name, Y, twist * 0.33);
      this.turn(name, Z, roll * 0.33);
    }
  }

  /** Tvåledad kedja (arm eller ben) mot ett mål, med armbågen/knät åt pole. */
  ik(upper, lower, end, l1, l2, target, pole) {
    const S = this.pos(upper);
    const d = target.clone().sub(S);
    const dist = Math.min(d.length(), l1 + l2 - 0.003);
    d.normalize();
    const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const perp = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
    const E = S.clone().addScaledVector(d, a).addScaledVector(perp, h);
    this.aim(upper, lower, E.clone().sub(S));
    this.aim(lower, end, S.clone().addScaledVector(d, dist).sub(this.pos(lower)));
  }

  leg(s, ankle, pole) {
    this.ik(`${s}_Thigh`, `${s}_Calf`, `${s}_Foot`, this.len[`${s}_leg1`], this.len[`${s}_leg2`], ankle, pole);
    this.setQuat(`${s}_Foot`, this.rest[`${s}_Foot`].wq.clone());
  }

  /** Arm mot en handled, med handens riktning (F = fingrar, U = handrygg) och fingrarnas krökning. */
  arm(s, wrist, pole, F, U, curl = 0.25) {
    this.ik(`${s}_UpperArm`, `${s}_Forearm`, `${s}_Hand`, this.len[`${s}_arm1`], this.len[`${s}_arm2`], wrist, pole);
    const h0 = this.hand0[s];
    const R = new THREE.Quaternion().setFromRotationMatrix(basis(F, U).multiply(h0.inv));
    this.setQuat(`${s}_Hand`, R.clone().multiply(this.rest[`${s}_Hand`].wq));
    const axis = h0.axis.clone().applyQuaternion(R);
    (this.curlAxis ||= {})[s] = axis;
    // curl: ett tal för hela handen, eller [pek, lång, ring, lill]
    const c = Array.isArray(curl) ? curl : [1, 2, 3, 4].map((f) => curl * (1 + 0.12 * f));
    for (let f = 1; f <= 4; f++) {
      for (const [seg, k] of [
        ['', 0.8],
        ['1', 1.0],
        ['2', 0.7],
      ]) {
        this.turn(`${s}_Finger${f}${seg}`, axis, c[f - 1] * k);
      }
    }
  }

  fingerTip(s, f, len = 0.022) {
    const a = this.pos(`${s}_Finger${f}1`);
    const b = this.pos(`${s}_Finger${f}2`);
    return b.clone().add(b.clone().sub(a).normalize().multiplyScalar(len));
  }

  /** Tummen mot pekfingertoppen – ett pincettgrepp. */
  pinch(s) {
    for (let i = 0; i < 5; i++) {
      const tip = this.fingerTip(s, 1);
      this.aim(`${s}_Finger0`, `${s}_Finger02`, tip.clone().sub(this.pos(`${s}_Finger0`)));
      if (this.fingerTip(s, 0, 0.026).distanceTo(tip) < 0.014) break;
      this.turn(`${s}_Finger1`, this.curlAxis[s], 0.16); // böj pekfingret lite till mot tummen
    }
    return this.fingerTip(s, 1).lerp(this.fingerTip(s, 0, 0.026), 0.5);
  }

  /** Huvud och nacke i figurens koordinater: yaw mot figurens vänster, pitch = nick framåt. */
  head(yaw, pitch, roll = 0, steadyShoulders = false) {
    const R = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
    const neck0 = this.quat(this.b.Neck);
    // I den här riggen sitter nyckelbenen på halsbenet: vrider man på huvudet
    // svänger axlarna med. Med steadyShoulders hålls de kvar där de skulle ha
    // suttit utan huvudets sidovridning.
    let keep = null;
    if (steadyShoulders) {
      const R0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, 0, roll, 'YXZ'));
      this.setQuat('Neck', neck0.clone().slerp(R0.multiply(this.rest.Neck.wq), 0.5));
      keep = ['L_Clavicle', 'R_Clavicle'].map((n) => [n, this.pos(n), this.quat(this.b[n])]);
    }
    this.setQuat('Neck', neck0.clone().slerp(R.clone().multiply(this.rest.Neck.wq), 0.5));
    if (keep) {
      const inv = new THREE.Matrix4();
      for (const [n, pos, q] of keep) {
        const bone = this.b[n];
        bone.parent.updateWorldMatrix(true, false);
        inv.copy(bone.parent.matrixWorld).invert();
        bone.position.copy(pos).applyMatrix4(this.root.matrixWorld).applyMatrix4(inv);
        this.setQuat(n, q);
      }
    }
    this.setQuat('Head', R.multiply(this.rest.Head.wq));
  }

  /** Munnens ungefärliga läge i figurens koordinater (för bloss och rök). */
  mouth() {
    const q = this.quat(this.b.Head).multiply(this.rest.Head.wq.clone().invert());
    return this.pos('Head').add(this.mouth0.clone().applyQuaternion(q));
  }
  headDir() {
    return Z.clone().applyQuaternion(this.quat(this.b.Head).multiply(this.rest.Head.wq.clone().invert()));
  }

  setMorph(name, v) {
    for (const m of this.meshes) {
      const i = m.morphTargetDictionary?.[name];
      if (i !== undefined) m.morphTargetInfluences[i] = v;
    }
  }

  /** Fäster ett föremål vid ett ben; läget anges i figurens vilokoordinater. */
  attach(name, obj) {
    this.root.add(obj);
    obj.updateMatrixWorld(true);
    this.b[name].attach(obj);
  }
}

// ---------------------------------------------------------------------------
// rök
// ---------------------------------------------------------------------------

class Smoke {
  constructor(max = 420) {
    this.max = max;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.age = new Float32Array(max).fill(1e9);
    this.life = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.seed = new Float32Array(max);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0.86, 0.92, 0.9) }, uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        uniform float uScale;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.05, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.0, d);
          gl_FragColor = vec4(uColor, a * a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.mat = mat;
  }

  emit(pos, vel, life, s0, s1, alpha) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.p.set([pos.x, pos.y, pos.z], i * 3);
    this.v.set([vel.x, vel.y, vel.z], i * 3);
    this.age[i] = 0;
    this.life[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.a0[i] = alpha;
    this.seed[i] = Math.random() * 100;
  }

  update(dt, time) {
    for (let i = 0; i < this.max; i++) {
      const age = (this.age[i] += dt);
      const k = age / this.life[i];
      if (k >= 1) {
        this.alpha[i] = 0;
        continue;
      }
      const j = i * 3;
      const sd = this.seed[i];
      // lätt virvlande uppåtdrag, bromsas av luften
      this.v[j] += (Math.sin(time * 0.9 + sd + this.p[j + 1] * 5.0) * 0.022 - this.v[j] * 0.6) * dt;
      this.v[j + 2] += (Math.cos(time * 0.7 + sd * 1.7 + this.p[j + 1] * 4.0) * 0.022 - this.v[j + 2] * 0.6) * dt;
      this.v[j + 1] += (0.075 - this.v[j + 1]) * 0.5 * dt;
      this.p[j] += this.v[j] * dt;
      this.p[j + 1] += this.v[j + 1] * dt;
      this.p[j + 2] += this.v[j + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(k);
      this.alpha[i] = this.a0[i] * Math.min(1, k * 8) * (1 - k) * (1 - k);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------

function cigarette(M) {
  const g = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.8 });
  const ember = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.5, 0.12) });
  g.add(tube([0, 0, 0], [0, 0, 0.062], 0.0036, 0.0036, paper, 8, { cast: false }));
  const tip = tube([0, 0, 0.062], [0, 0, 0.068], 0.0036, 0.003, ember, 8, { cast: false });
  g.add(tip);
  const end = new THREE.Object3D();
  end.position.set(0, 0, 0.07);
  g.add(end);
  g.userData = { ember, end };
  return g;
}

/** Blinkningar vid givna tider i slingan. */
function blink(t, times) {
  let v = 0;
  for (const b of times) v = Math.max(v, bump(t, b, b + 0.07, b + 0.1, b + 0.22));
  return v;
}

/** Munrörelser medan någon talar. */
function speak(p, t, amount) {
  const a = amount * Math.max(0, 0.3 + 0.35 * wave(t, 144) + 0.25 * wave(t, 216, 0.3) + 0.2 * wave(t, 96, 0.1));
  p.setMorph('aa', a * 0.55);
  p.setMorph('oh', amount * Math.max(0, 0.25 * wave(t, 120, 0.4)));
  p.setMorph('ee', amount * Math.max(0, 0.22 * wave(t, 168, 0.7)));
}

/** Byter en av materialets texturer mot en omritad, med samma inställningar. */
function replaceMap(mat, key, canvas) {
  const old = mat[key];
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = old.flipY;
  t.colorSpace = old.colorSpace;
  t.wrapS = old.wrapS;
  t.wrapT = old.wrapT;
  t.channel = old.channel;
  t.anisotropy = old.anisotropy;
  mat[key] = t;
  old.dispose();
  mat.needsUpdate = true;
}

/**
 * Färgar skjortan direkt i kroppens textur: det vita tyget (krage, bröst och
 * manschetter) tonas om, medan texturens egna veck och skuggor ligger kvar.
 * Ingen ny geometri – det är samma skjorta, bara i en annan färg.
 */
function tintShirt(p, rgb) {
  const mat = p.meshes.find((m) => m.material.name === 'body')?.material;
  const img = mat?.map?.image;
  if (!img || !img.width) return;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    // skjortan är det enda som är både ljust och ofärgat (kostymen är mörk, händerna har hudton)
    const m = ease((hi - 125) / 45) * (1 - ease(((hi - lo) / Math.max(hi, 1) - 0.12) / 0.14));
    if (m <= 0) continue;
    const k = (r + g + b) / 3 / 205; // texturens ljushet följer med
    d[i] = r + (Math.min(255, rgb[0] * k) - r) * m;
    d[i + 1] = g + (Math.min(255, rgb[1] * k) - g) * m;
    d[i + 2] = b + (Math.min(255, rgb[2] * k) - b) * m;
  }
  ctx.putImageData(px, 0, 0);
  replaceMap(mat, 'map', canvas);
}

/**
 * Färgar om kostymen direkt i kroppens textur (kavaj och byxor), med vävens
 * mönster kvar som en svag struktur. Händerna skyddas med en mask i texturens
 * UV-rymd, och skjortans röda tyg lämnas som det är.
 */
function tintSuit(p, rgb) {
  const mesh = p.meshes.find((m) => m.material.name === 'body');
  const mat = mesh?.material;
  const img = mat?.map?.image;
  if (!img || !img.width) return;
  const w = img.width;
  const h = img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  // händerna: de trianglar som följer handens och fingrarnas ben
  const geo = mesh.geometry;
  const sk = mesh.skeleton;
  const UV = geo.attributes.uv;
  const SI = geo.attributes.skinIndex;
  const SW = geo.attributes.skinWeight;
  const hand = new Set();
  for (const [name, bone] of Object.entries(p.b)) if (/^[LR]_(Hand|Finger)/.test(name)) hand.add(sk.bones.indexOf(bone));
  const skinV = new Uint8Array(UV.count);
  for (let i = 0; i < UV.count; i++) {
    let wh = 0;
    for (let k = 0; k < 4; k++) if (hand.has(SI.getComponent(i, k))) wh += SW.getComponent(i, k);
    if (wh >= 0.5) skinV[i] = 1;
  }
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const mx = mask.getContext('2d', { willReadFrequently: true });
  mx.fillStyle = '#fff';
  mx.strokeStyle = '#fff';
  mx.lineWidth = 4;
  mx.lineJoin = 'round';
  mx.beginPath();
  const idx = geo.index;
  for (let f = 0; f < idx.count; f += 3) {
    const a = idx.getX(f);
    const b = idx.getX(f + 1);
    const c = idx.getX(f + 2);
    if (!(skinV[a] && skinV[b] && skinV[c])) continue;
    mx.moveTo(UV.getX(a) * w, UV.getY(a) * h);
    mx.lineTo(UV.getX(b) * w, UV.getY(b) * h);
    mx.lineTo(UV.getX(c) * w, UV.getY(c) * h);
    mx.closePath();
  }
  mx.fill();
  mx.stroke();
  const keep = mx.getImageData(0, 0, w, h).data;
  const px = ctx.getImageData(0, 0, w, h);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    if (keep[i] > 127) continue; // hud
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    if (r > 1.45 * g && r > 1.45 * b) continue; // den röda skjortan
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    if (r > g && g > b && (hi - lo) / Math.max(hi, 1) > 0.36) continue; // hudton vid handleden
    // mönstrets kontrast dämpas kraftigt, så att rutorna bara anas i det mörka tyget
    const k = Math.max(0.04, (r + g + b) / 3 / 140) ** 0.4;
    d[i] = Math.min(255, rgb[0] * k);
    d[i + 1] = Math.min(255, rgb[1] * k);
    d[i + 2] = Math.min(255, rgb[2] * k);
  }
  ctx.putImageData(px, 0, 0);
  replaceMap(mat, 'map', canvas);
}

/**
 * Kortärmat: tygets färg byts mot bar hud på armarna, direkt i kroppens textur.
 *
 * Ärmens trianglar ritas som en mask i texturens UV-rymd. Inom masken byts
 * bara de bildpunkter som har tygets röda färg – händerna, som redan är hud,
 * lämnas orörda – och normalkartans stickmönster plattas ut på samma yta.
 * `cut` är var på överarmen ärmen slutar (0 = axeln, 1 = armbågen).
 */
function bareArms(p, cut = 0.36) {
  const mesh = p.meshes.find((m) => m.material.name === 'body');
  const mat = mesh.material;
  const img = mat.map?.image;
  if (!img || !img.width) return;
  const geo = mesh.geometry;
  const sk = mesh.skeleton;
  p.root.updateMatrixWorld(true);
  sk.update();
  const P = geo.attributes.position;
  const UV = geo.attributes.uv;
  const SI = geo.attributes.skinIndex;
  const SW = geo.attributes.skinWeight;
  const arm = new Set();
  const fore = new Set(); // över- och underarm
  const hand = new Set();
  for (const [name, bone] of Object.entries(p.b)) {
    if (/^[LR]_(UpperArm|Forearm|Hand|Finger)/.test(name)) arm.add(sk.bones.indexOf(bone));
    if (/^[LR]_(UpperArm|Forearm)$/.test(name)) fore.add(sk.bones.indexOf(bone));
    if (/^[LR]_Hand$/.test(name)) hand.add(sk.bones.indexOf(bone));
  }
  const toFigure = new THREE.Matrix4().copy(p.root.matrixWorld).invert();
  const along = (a, b, q) => {
    const ab = b.clone().sub(a);
    const t = q.clone().sub(a).dot(ab) / ab.lengthSq();
    return [t, q.distanceTo(a.clone().addScaledVector(ab, t))];
  };
  const w = img.width;
  const h = img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h);
  const d = px.data;
  const isCloth = (i) => d[i] > 1.75 * d[i + 1] && d[i] > 1.75 * d[i + 2];
  // är texturen tyg just där hörnet sitter? (skiljer muddens kant från själva handen)
  const clothAt = (i) => isCloth(4 * (Math.min(h - 1, Math.max(0, Math.floor(UV.getY(i) * h))) * w + Math.min(w - 1, Math.max(0, Math.floor(UV.getX(i) * w)))));
  // Vilka hörn hör till armen nedanför ärmslutet? `below` är hela armen med handen.
  const below = new Uint8Array(P.count);
  const g = new Float32Array(P.count).fill(-1); // > 0: nedanför ärmslutet
  const handy = new Uint8Array(P.count); // hörn som hör till handen
  const onArm = new Uint8Array(P.count); // hörn som följer armens ben
  const fig = new Float32Array(P.count * 3); // läget i figurens koordinater
  const run = new Float32Array(P.count); // läget längs armen: 0 axel, 1 armbåge, 2 handled
  const hub = new Float32Array(P.count * 3); // närmaste punkt på armens mittlinje
  const handUV = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    let wa = 0;
    let wh = 0;
    let wf = 0; // hand och fingrar
    for (let k = 0; k < 4; k++) {
      const b = SI.getComponent(i, k);
      const w = SW.getComponent(i, k);
      if (arm.has(b)) wa += w;
      if (hand.has(b)) wh += w;
      if (arm.has(b) && !fore.has(b)) wf += w;
    }
    if (wh > 0.9) handUV.push([UV.getX(i), UV.getY(i)]);
    if (wa < 0.5) continue;
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).applyMatrix4(toFigure);
    const s = v.x < 0 ? 'R' : 'L';
    const S = p.rest[`${s}_UpperArm`].wp;
    const E = p.rest[`${s}_Forearm`].wp;
    const W = p.rest[`${s}_Hand`].wp;
    const [t1, d1] = along(S, E, v);
    const [t2, d2] = along(E, W, v);
    if (wf >= 0.5 && !clothAt(i)) handy[i] = 1; // hand – men inte mudden, som också följer handens ben
    if (t2 > -0.05 && d2 < 0.1) g[i] = 1;
    else if (t1 < 1.15 && d1 < 0.1) g[i] = t1 - cut;
    if ((t1 > cut && t1 < 1.15 && d1 < 0.1) || (t2 > -0.15 && d2 < 0.1)) below[i] = 1;
    onArm[i] = 1;
    v.toArray(fig, i * 3);
    // mittlinjen: överarmen fram till armbågen, sedan underarmen
    const upper = t2 < 0 || (t1 <= 1 && d1 <= d2);
    const tt = upper ? Math.min(1, Math.max(0, t1)) : Math.min(1.12, Math.max(0, t2));
    run[i] = upper ? tt : 1 + tt;
    (upper ? S.clone().lerp(E, tt) : E.clone().lerp(W, tt)).toArray(hub, i * 3);
  }

  // ---- Formen: ärmens tjocka tyg krymps till en smal arm ----------------
  // Varje hörn nedanför ärmslutet dras in mot armens mittlinje, så att armen
  // får en kvinnoarms mått och muddens kant vid handleden försvinner.
  {
    // samma avbildning som skinningen ger i viloläget: nätets egna koordinater → figurens
    const A = new THREE.Matrix4().copy(toFigure).multiply(sk.bones[0].matrixWorld).multiply(sk.boneInverses[0]).multiply(mesh.bindMatrix);
    const Ainv = A.clone().invert();
    const probe = (i) => v.fromBufferAttribute(P, i).applyMatrix4(A).distanceTo(new THREE.Vector3().fromArray(fig, i * 3));
    const first = onArm.indexOf(1);
    if (first >= 0 && probe(first) < 0.002) {
      const dist = (i) => Math.hypot(fig[i * 3] - hub[i * 3], fig[i * 3 + 1] - hub[i * 3 + 1], fig[i * 3 + 2] - hub[i * 3 + 2]);
      // handens egen tjocklek vid handleden: dit ska armen smalna
      let wr = 0;
      let wn = 0;
      for (let i = 0; i < P.count; i++) {
        if (onArm[i] && handy[i] && run[i] > 1.9 && run[i] < 2.06) {
          wr += dist(i);
          wn++;
        }
      }
      const wrist = wn ? wr / wn + 0.001 : 0.026;
      // armens radie längs vägen (m): överarm, armbåge, underarmens bredaste del, handled
      const profile = [
        [cut, 0.043],
        [0.7, 0.04],
        [1.0, 0.036],
        [1.25, 0.037],
        [1.6, 0.031],
        [1.9, wrist + 0.003],
        // ärmens sista ringar dras in strax under handens yta, så att handen
        // tar över utan kant där mudden slutade
        [1.98, wrist - 0.001],
        [2.06, wrist - 0.006],
        [2.2, wrist - 0.006],
      ];
      const want = (x) => {
        for (let k = 1; k < profile.length; k++) {
          if (x <= profile[k][0]) {
            const [x0, r0] = profile[k - 1];
            const [x1, r1] = profile[k];
            return r0 + ((r1 - r0) * Math.max(0, x - x0)) / (x1 - x0);
          }
        }
        return wrist;
      };
      // ärmens nuvarande medelradie, skiva för skiva längs armen
      const step = 0.06;
      const n = Math.ceil((2.2 - cut) / step) + 1;
      const sum = new Float32Array(n);
      const cnt = new Float32Array(n);
      for (let i = 0; i < P.count; i++) {
        if (!onArm[i] || handy[i] || g[i] <= 0) continue;
        const k = Math.min(n - 1, Math.max(0, Math.round((run[i] - cut) / step)));
        sum[k] += dist(i);
        cnt[k]++;
      }
      const shrink = new Float32Array(n).fill(1);
      for (let k = 0; k < n; k++) if (cnt[k]) shrink[k] = Math.min(1, want(cut + k * step) / (sum[k] / cnt[k]));
      const at = (x) => {
        const f = Math.min(n - 1, Math.max(0, (x - cut) / step));
        const k = Math.floor(f);
        return shrink[k] + (shrink[Math.min(n - 1, k + 1)] - shrink[k]) * (f - k);
      };
      for (let i = 0; i < P.count; i++) {
        if (!onArm[i] || handy[i] || g[i] <= 0) continue;
        // ärmens kant behåller sin vidd; därifrån smalnar det snabbt av till armen
        const k = 1 + (at(run[i]) - 1) * ease(g[i] / 0.1);
        v.set(hub[i * 3] + (fig[i * 3] - hub[i * 3]) * k, hub[i * 3 + 1] + (fig[i * 3 + 1] - hub[i * 3 + 1]) * k, hub[i * 3 + 2] + (fig[i * 3 + 2] - hub[i * 3 + 2]) * k);
        v.applyMatrix4(Ainv);
        P.setXYZ(i, v.x, v.y, v.z);
      }
      P.needsUpdate = true;
    }
  }

  // masken: rött = hela armen med handen, grönt = bara ärmen
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const mx = mask.getContext('2d', { willReadFrequently: true });
  mx.globalCompositeOperation = 'lighter';
  mx.lineWidth = 3; // täcker skarvarna mellan trianglarna
  mx.lineJoin = 'round';
  const idx = geo.index;
  // allt som följer armen, också ärmen ovanför fållen
  mx.fillStyle = '#00f';
  mx.strokeStyle = '#00f';
  mx.beginPath();
  for (let f = 0; f < idx.count; f += 3) {
    const a = idx.getX(f);
    const b = idx.getX(f + 1);
    const c = idx.getX(f + 2);
    if (!(onArm[a] && onArm[b] && onArm[c])) continue;
    mx.moveTo(UV.getX(a) * w, UV.getY(a) * h);
    mx.lineTo(UV.getX(b) * w, UV.getY(b) * h);
    mx.lineTo(UV.getX(c) * w, UV.getY(c) * h);
    mx.closePath();
  }
  mx.fill();
  mx.stroke();
  // hela armen med handen
  mx.fillStyle = '#f00';
  mx.strokeStyle = '#f00';
  mx.beginPath();
  for (let f = 0; f < idx.count; f += 3) {
    const a = idx.getX(f);
    const b = idx.getX(f + 1);
    const c = idx.getX(f + 2);
    if (!(below[a] && below[b] && below[c])) continue;
    mx.moveTo(UV.getX(a) * w, UV.getY(a) * h);
    mx.lineTo(UV.getX(b) * w, UV.getY(b) * h);
    mx.lineTo(UV.getX(c) * w, UV.getY(c) * h);
    mx.closePath();
  }
  mx.fill();
  mx.stroke();
  // Ärmen: trianglarna klipps längs ärmslutet (där g = 0), så att fållen blir
  // en rak kant runt armen i stället för att följa trianglarnas sicksack.
  mx.fillStyle = '#0f0';
  mx.strokeStyle = '#0f0';
  mx.beginPath();
  for (let f = 0; f < idx.count; f += 3) {
    const tri = [idx.getX(f), idx.getX(f + 1), idx.getX(f + 2)];
    if (tri.every((i) => handy[i]) || !tri.some((i) => g[i] > 0)) continue;
    const poly = [];
    for (let k = 0; k < 3; k++) {
      const i = tri[k];
      const j = tri[(k + 1) % 3];
      if (g[i] > 0) poly.push([UV.getX(i) * w, UV.getY(i) * h]);
      if (g[i] > 0 !== g[j] > 0) {
        const t = g[i] / (g[i] - g[j]);
        poly.push([(UV.getX(i) + (UV.getX(j) - UV.getX(i)) * t) * w, (UV.getY(i) + (UV.getY(j) - UV.getY(i)) * t) * h]);
      }
    }
    if (poly.length < 3) continue;
    mx.moveTo(poly[0][0], poly[0][1]);
    for (let k = 1; k < poly.length; k++) mx.lineTo(poly[k][0], poly[k][1]);
    mx.closePath();
  }
  mx.fill();
  mx.stroke();
  const mk = mx.getImageData(0, 0, w, h).data;
  // hudtonen hämtas från hennes egna händer
  const skin = [0, 0, 0];
  let n = 0;
  for (const [u, t] of handUV) {
    const i = 4 * (Math.min(h - 1, Math.floor(t * h)) * w + Math.min(w - 1, Math.floor(u * w)));
    if (isCloth(i)) continue;
    skin[0] += d[i];
    skin[1] += d[i + 1];
    skin[2] += d[i + 2];
    n++;
  }
  if (!n) return;
  for (let k = 0; k < 3; k++) skin[k] /= n;
  // tygets medelfärg på ärmen, till lappen nedan
  const cloth = [0, 0, 0];
  let cn = 0;
  for (let q = 0, i = 0; q < w * h; q += 7, i += 28) {
    if (mk[i + 2] < 128 || mk[i + 1] > 127 || !isCloth(i)) continue;
    cloth[0] += d[i];
    cloth[1] += d[i + 1];
    cloth[2] += d[i + 2];
    cn++;
  }
  // mjukt brus i två skalor: hud är aldrig en helt jämn färg
  const hash = (x, y) => {
    const t = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return t - Math.floor(t);
  };
  const noise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = ease(x - xi);
    const fy = ease(y - yi);
    const a = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * fx;
    const b = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * fx;
    return a + (b - a) * fy - 0.5;
  };
  const changed = new Uint8Array(w * h);
  for (let q = 0, i = 0; q < w * h; q++, i += 4) {
    // På armen byts allt (även veckens mörka skuggor). På handen, som redan
    // är hud, byts bara det som har tygets färg – muddens kant.
    if (mk[i + 1] > 127 || (mk[i] > 127 && isCloth(i))) {
      const x = q % w;
      const y = (q - x) / w;
      const k = 1 + 0.07 * noise(x / 46, y / 46) + 0.035 * noise(x / 7, y / 7);
      const warm = 0.03 * noise(x / 90 + 40, y / 90); // lite rödare och blekare fläckvis
      d[i] = Math.min(255, skin[0] * (k + warm));
      d[i + 1] = Math.min(255, skin[1] * k);
      d[i + 2] = Math.min(255, skin[2] * (k - warm));
      changed[q] = 1;
    } else if (cn && mk[i + 2] > 127 && mk[i] < 128 && !isCloth(i) && d[i] + d[i + 1] + d[i + 2] < 300) {
      // en mörk lapp i originaltexturen mitt på ärmen: måla över den med tyget
      d[i] = cloth[0] / cn;
      d[i + 1] = cloth[1] / cn;
      d[i + 2] = cloth[2] / cn;
    }
  }
  ctx.putImageData(px, 0, 0);
  replaceMap(mat, 'map', canvas);
  // stickningen i normalkartan plattas ut där det nu är hud
  const nimg = mat.normalMap?.image;
  if (nimg && nimg.width) {
    const nw = nimg.width;
    const nh = nimg.height;
    const nc = document.createElement('canvas');
    nc.width = nw;
    nc.height = nh;
    const nx = nc.getContext('2d', { willReadFrequently: true });
    nx.drawImage(nimg, 0, 0, nw, nh);
    const np = nx.getImageData(0, 0, nw, nh);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        if (!changed[Math.floor((y * h) / nh) * w + Math.floor((x * w) / nw)]) continue;
        const i = 4 * (y * nw + x);
        np.data[i] = 128;
        np.data[i + 1] = 128;
        np.data[i + 2] = 255;
      }
    }
    nx.putImageData(np, 0, 0);
    replaceMap(mat, 'normalMap', nc);
  }
  mat.needsUpdate = true;
}

/** Hårstrån som ränder: ger hårets yta lyster och riktning. */
function strandTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let b = 0.75;
  for (let x = 0; x < 256; x++) {
    b = Math.min(1, Math.max(0.56, b + (rnd() - 0.5) * 0.18));
    const g = Math.round(255 * b);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(x, 0, 1, 256);
  }
  // enstaka ljusare och mörkare slingor som inte går hela vägen
  for (let i = 0; i < 90; i++) {
    const g = rnd() > 0.5 ? 255 : 70;
    ctx.fillStyle = `rgba(${g},${g},${g},${0.12 + rnd() * 0.2})`;
    ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 30 + rnd() * 120);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Axellångt, vågigt hår som ett skal runt huvudet (i stället för modellens
 * uppsatta knut). Skalet byggs i skivor uppifrån och ner: över hårfästet
 * omsluter det hela hjässan, längre ner drar sig framkanten bakåt så att
 * ansiktet är fritt och håret faller över öronen ner mot axlarna.
 * Måtten utgår från skallens uppmätta hjässa.
 */
function hairBob(p, color = 0xb04a22) {
  // d: djup under hjässan · x: halva bredden · zf/zb: fram- och bakkant · pf: hur kantig framkanten är
  // Upptill ligger håret tätt mot skallen och är struket bakåt från pannan;
  // nedåt vidgas det och faller i vågor mot axlarna.
  const rings = [
    { d: -0.009, x: 0.016, zf: -0.02, zb: -0.07, pf: 2 },
    { d: -0.005, x: 0.042, zf: 0.018, zb: -0.105, pf: 2 },
    { d: 0.008, x: 0.061, zf: 0.052, zb: -0.13, pf: 2 },
    { d: 0.024, x: 0.071, zf: 0.074, zb: -0.152, pf: 2.1 },
    { d: 0.038, x: 0.078, zf: 0.084, zb: -0.166, pf: 2.2 },
    { d: 0.05, x: 0.084, zf: 0.09, zb: -0.176, pf: 2.4 },
    { d: 0.062, x: 0.089, zf: 0.095, zb: -0.182, pf: 2.5 }, // ner till modellens eget hårfäste
    { d: 0.076, x: 0.094, zf: 0.08, zb: -0.186, pf: 3 },
    { d: 0.095, x: 0.1, zf: 0.058, zb: -0.189, pf: 3.3 }, // härifrån faller håret över tinningar och öron
    { d: 0.12, x: 0.106, zf: 0.055, zb: -0.19, pf: 3.4 },
    { d: 0.155, x: 0.114, zf: 0.052, zb: -0.19, pf: 3.4 },
    { d: 0.19, x: 0.121, zf: 0.05, zb: -0.187, pf: 3.3 },
    { d: 0.22, x: 0.125, zf: 0.05, zb: -0.18, pf: 3.1 },
    { d: 0.243, x: 0.12, zf: 0.044, zb: -0.168, pf: 2.8 },
    { d: 0.256, x: 0.102, zf: 0.014, zb: -0.148, pf: 2.5 },
  ];
  const segs = 64;
  const pos = [];
  const uv = [];
  const idx = [];
  rings.forEach((r, j) => {
    const zc = (r.zf + r.zb) / 2;
    const rz = (r.zf - r.zb) / 2;
    // mjuka vågor som löper nedåt genom håret, starkast mot topparna
    const low = ease((r.d - 0.055) / 0.09);
    const amp = 0.008 * low;
    // topparna är olika långa, lock för lock
    const ends = ease((r.d - 0.19) / 0.05);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const e = 2 / (s > 0 ? r.pf : 2.3);
      const wave = 1 + (amp * Math.sin(TAU * (r.d / 0.07) + 1.6 * Math.sin(2 * a) + 0.6)) / r.x;
      const drop = ends * (0.012 * Math.sin(3 * a + 1) + 0.007 * Math.sin(7 * a + 2));
      pos.push(Math.sign(c) * Math.abs(c) ** e * r.x * wave, -r.d - drop, zc + Math.sign(s) * Math.abs(s) ** e * rz * wave);
      uv.push((i / segs) * 5, j / (rings.length - 1));
    }
  });
  const row = segs + 1;
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * row + i;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  // lock upptill och under
  for (const [j, flip] of [
    [0, false],
    [rings.length - 1, true],
  ]) {
    const r = rings[j];
    const k = pos.length / 3;
    pos.push(0, -r.d, (r.zf + r.zb) / 2);
    uv.push(0.5, j ? 1 : 0);
    for (let i = 0; i < segs; i++) {
      const a = j * row + i;
      if (flip) idx.push(k, a, a + 1);
      else idx.push(k, a + 1, a);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const strands = strandTexture();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.58, map: strands, bumpMap: strands, bumpScale: 0.9 });
  mat.envMapIntensity = 0.6;
  const hair = new THREE.Mesh(geo, mat);
  hair.castShadow = true;
  hair.receiveShadow = true;
  hair.position.set(0, p.skull.top, 0);
  for (const m of p.meshes) if (m.material.name === 'hair') m.visible = false; // knuten (och hårkorten) bort
  p.attach('Head', hair);
  return hair;
}

/**
 * Skuggan under hattbrättet.
 *
 * Rummets skuggkartor är statiska, och det mesta ljuset på ansiktena kommer
 * dessutom lågt in under brättet – den "riktiga" skuggan blir bara någon
 * centimeter. Hoppers män har ögonen i skugga av ljuset från taket, så den
 * skuggan räknas ut direkt i ansiktets material: från varje punkt dras en
 * stråle mot takljuset, och går den genom brättet blir punkten mörkare.
 * Skuggan följer huvudet i varje bildruta.
 */
function brimShadow(material, u) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHatInv = u.inv;
    shader.uniforms.uHatLight = u.light;
    shader.uniforms.uBrim = u.shape;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uHatInv;\nvarying vec3 vHatPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvHatPos = (uHatInv * modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHatLight;\nuniform vec3 uBrim;\nvarying vec3 vHatPos;')
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `#include <opaque_fragment>
        {
          float d = -vHatPos.y; // djup under brättet (hattens egna mått)
          vec2 q = vHatPos.xz + uHatLight.xz * (d / max(uHatLight.y, 0.25)); // där strålen mot ljuset når brättets plan
          float f = length(q / uBrim.xy); // < 1: innanför brättets kant
          float w = 0.05 + 0.5 * d; // halvskuggan breddas med avståndet
          float s = 1.0 - smoothstep(1.0 - w, 1.0 + w, f);
          // längre ner tar rummets övriga ljus över (hals, nacke)
          s *= smoothstep(-0.04, -0.02, d) * (1.0 - smoothstep(0.1, 0.24, d));
          gl_FragColor.rgb *= 1.0 - uBrim.z * s;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'nh-brim-shadow';
  material.needsUpdate = true;
}

export async function loadPeople(M) {
  const loader = new GLTFLoader();
  // Texturerna i filerna läses som vanliga bilder. (Standardvägen hämtar dem
  // med fetch från en blob-adress, vilket inbäddade sidor inte alltid tillåter.)
  loader.register((parser) => {
    parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
    return { name: 'NH_image_textures' };
  });
  const load = async (name) => {
    const url = `${import.meta.env.BASE_URL}models/${name}.glb`;
    if (import.meta.env.VITE_MODEL_FORMAT !== 'b64') return loader.loadAsync(url);
    // Värdar som bara serverar textfiler (t.ex. en publicerad artefakt) får
    // modellen base64-kodad i en textfil bredvid sidan.
    const res = await fetch(`${url}.txt`);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    const bin = atob((await res.text()).trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return loader.parseAsync(bytes.buffer, '');
  };
  const [gSmoker, gWoman, gWaiter, gLoner] = await Promise.all([load('smoker'), load('woman'), load('waiter'), load('loner')]);

  const group = new THREE.Group();
  group.name = 'people';
  const smoke = new Smoke();
  group.add(smoke.points);
  const cy = D.cH - D.stoolH; // diskens höjd över sitsen
  const floor = -D.stoolH;
  const seatHip = V(0, 0.1, -0.03);
  const std = (c, r = 0.7) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const tmp = new THREE.Vector3();

  // gemensamt: sittande ben, knäna isär så att de går fria från disken
  const sitLegs = (p, spread = 0.75, tuck = 0.2) => {
    p.leg('L', V(0.19, floor + 0.1, tuck), V(spread, 0.15, 0.65));
    p.leg('R', V(-0.19, floor + 0.1, tuck), V(-spread, 0.15, 0.65));
  };

  /** Sätter en hatt efter skallens uppmätta form, så att inget sticker igenom. */
  const hideHair = (p) => {
    for (const m of p.meshes) if (m.material.name === 'hair') m.visible = false;
  };
  const wearHat = (p, hat, drop = 0.072, tilt = 0.03) => {
    const b = p.skull.band(0, drop + 0.012);
    hat.scale.setScalar(Math.max((b.rx + 0.008) / 0.094, (b.rz + 0.008) / 0.109));
    hat.position.set(b.cx, p.skull.top - drop, b.cz);
    hat.rotation.x = tilt;
    hideHair(p); // hårkorten skulle annars sticka upp genom kullen
    p.attach('Head', hat);
    // Brättets skugga över ansiktet. Ljuset kommer från taket en bit framför
    // figuren (30° över horisonten): skuggkanten hamnar då strax under ögonen.
    p.brim = {
      hat,
      dir: V(0, 0.5, 0.866),
      inv: { value: new THREE.Matrix4() },
      light: { value: new THREE.Vector3(0, 1, 0) },
      shape: { value: new THREE.Vector3(0.158, 0.184, 0.86) }, // brättets halvaxlar och skuggans styrka
    };
    for (const m of p.meshes) if (m.material.name === 'head') brimShadow(m.material, p.brim);
  };
  /** Cigarett mellan pek- och långfinger, filtret mot handflatan. */
  const holdCigarette = (p, s) => {
    const cig = cigarette(M);
    const h0 = p.hand0[s];
    const g = p.rest[`${s}_Finger11`].wp.clone().add(p.rest[`${s}_Finger21`].wp).multiplyScalar(0.5);
    const a = h0.U.clone().multiplyScalar(0.92).addScaledVector(h0.F, 0.38).normalize();
    const filter = g.clone().addScaledVector(a, -0.026);
    cig.position.copy(filter);
    cig.quaternion.setFromUnitVectors(Z, a);
    p.attach(`${s}_Finger1`, cig);
    p.cig = cig.userData;
    // filtrets läge i handens egna axlar (fingrar, handrygg, sida)
    const rel = filter.sub(p.rest[`${s}_Hand`].wp);
    p.grip = { f: rel.dot(h0.F), u: rel.dot(h0.U), l: rel.dot(h0.axis) };
  };
  /** Handledens läge när filtret ska ligga mot en given punkt. */
  const wristFor = (p, F, U, target) => {
    const f = F.clone().normalize();
    const r = new THREE.Vector3().crossVectors(U, f).normalize();
    const u = new THREE.Vector3().crossVectors(f, r);
    return target.clone().addScaledVector(f, -p.grip.f).addScaledVector(u, -p.grip.u).addScaledVector(r, -p.grip.l);
  };

  // ------------------------------------------------- mannen i blå kostym ----
  const smoker = new Person(gSmoker, { hip: seatHip });
  {
    tintShirt(smoker, [78, 126, 176]); // blå skjorta, som i målningen
    wearHat(smoker, fedora(M.hatBlue, M.hatBand), 0.07, 0.05);
    holdCigarette(smoker, 'R');
    smoker.root.position.set(D.farStoolsX[3], D.stoolH, D.stoolOff);
  }
  // -------------------------------------------------------- kvinnan i rött ----
  const woman = new Person(gWoman, { hip: V(0, 0.1, 0.05) }); // sitter långt fram på pallen
  {
    // det lilla hon håller mellan tumme och pekfinger (placeras i greppet varje bildruta)
    // som i målningen: kortärmad klänning och håret utslaget till axlarna
    bareArms(woman);
    woman.hair = hairBob(woman);
    woman.note = box(0.03, 0.046, 0.003, std(0xb7cc98, 0.8), 0, 0, 0, { cast: false });
    woman.root.add(woman.note);
    woman.root.position.set(D.farStoolsX[4], D.stoolH, D.stoolOff);
  }
  // ----------------------------------------------- mannen med ryggen mot oss ----
  const loner = new Person(gLoner, { hip: seatHip });
  {
    tintSuit(loner, [30, 43, 68]); // mörkblå kostym, som i målningen
    wearHat(loner, fedora(M.hatGrey, std(0x2b2f31)), 0.07, 0.02);
    holdCigarette(loner, 'L');
    const p = fp(D.stoolsT[1], D.stoolOff);
    loner.root.position.set(p[0], D.stoolH, p[1]);
    loner.root.rotation.y = Math.atan2(SA, -CA);
    // glaset han har framför sig
    const gl = tube([-0.2, cy, 0.55], [-0.2, cy + 0.1, 0.55], 0.026, 0.031, M.smallGlass, 14, { cast: false });
    loner.root.add(gl);
  }
  // ---------------------------------------------------------------- servitören ----
  // Han står inne i diskens "brunn" och arbetar vid hyllan på insidan.
  const WORK_T = 6.0; // arbetsplatsens läge längs disken
  const waiter = new Person(gWaiter, { hip: V(0, 0.71, 0) });
  {
    // Vikt båtmössa i papper. Den sitter ovanpå håret (som i målningen, där
    // det ljusa håret syns under kanten) och formas efter det uppmätta håret
    // så att inget sticker igenom.
    const hair = waiter.measureHead(['head', 'hair']);
    const drop = 0.05; // kantens läge under hjässan
    const b = hair.band(0, drop + 0.008);
    const rx = b.rx + 0.004;
    const rz = b.rz + 0.004;
    // så bred måste mössan minst vara på höjden y över kanten
    const need = (y) => {
      const q = hair.band(0, Math.max(drop - y, 0) + 0.006);
      return Math.abs(q.cx - b.cx) + q.rx + 0.005;
    };
    const paper = std(0xdedbd0, 0.88);
    const cap = new THREE.Group();
    cap.add(
      new THREE.Mesh(
        loft(
          [
            { y: 0, rx, rz },
            { y: 0.02, rx: Math.max(need(0.02), rx * 0.9), rz },
            { y: 0.038, rx: Math.max(need(0.038), rx * 0.62), rz: rz * 0.99 },
            { y: drop + 0.004, rx: Math.max(need(drop + 0.004), rx * 0.36), rz: rz * 0.97, p: 2.2 },
            { y: drop + 0.03, rx: rx * 0.07, rz: rz * 0.93, p: 2.5 },
          ],
          { segs: 32 },
        ),
        paper,
      ),
      // den uppvikta kanten
      new THREE.Mesh(
        loft(
          [
            { y: -0.003, rx: rx + 0.004, rz: rz + 0.004 },
            { y: 0.034, rx: Math.max(need(0.034), rx * 0.74) + 0.004, rz: rz + 0.005 },
          ],
          { segs: 32, capTop: false, capBottom: false },
        ),
        paper,
      ),
    );
    cap.traverse((c) => (c.castShadow = true));
    cap.position.set(b.cx, hair.top - drop, b.cz);
    waiter.attach('Head', cap);
    // Han står rakt under taklampan: dämpa det vita något så att rocken och
    // håret behåller sina skuggor i stället för att bränna ut.
    for (const m of waiter.meshes) {
      if (m.material.name === 'body') m.material.color.multiplyScalar(0.86);
      if (m.material.name === 'hair') m.material.color.multiplyScalar(0.8);
    }
    const at = fp(6.4, 1.9);
    const to = fp(WORK_T, D.cOff + D.cW + 0.14);
    waiter.root.position.set(at[0], 0, at[1]);
    waiter.root.rotation.y = Math.atan2(to[0] - at[0], to[1] - at[1]);
  }

  const people = [smoker, woman, loner, waiter];
  for (const p of people) {
    group.add(p.root);
  }
  group.updateMatrixWorld(true);
  for (const p of people) p.place();

  // --- slingan --------------------------------------------------------------
  // Tiderna är sekunder i en 48 s lång slinga.
  const DRAG = [
    [6.0, 8.2, 9.6, 11.8], // lyfter, håller, sänker
    [31.0, 33.0, 34.2, 36.2],
  ];
  const TALK_HE = (t) => Math.max(bump(t, 16, 16.8, 22.4, 23.2), bump(t, 39, 39.7, 42.4, 43.2));
  const TALK_SHE = (t) => bump(t, 23.6, 24.4, 29.2, 30);
  const TOGETHER = (t) => Math.max(bump(t, 14.5, 16.5, 29.5, 32), bump(t, 38.2, 39.6, 42.8, 44.5));
  const GLANCE = (t) => Math.max(bump(t, 17.4, 18.6, 21.8, 23.0), bump(t, 39.6, 40.6, 42.4, 43.4));
  const LONE_DRAG = [25.0, 27.0, 28.0, 30.0];

  /** Riktning som lägger armbågen vid en given punkt (t.ex. på disken). */
  const elbowAt = (p, s, e) => e.clone().sub(p.pos(`${s}_UpperArm`));
  /** Armbågen på disken vid sidled x och höjden y: så långt fram som överarmen räcker från axeln. */
  const elbowOn = (p, s, x, y) => {
    const S = p.pos(`${s}_UpperArm`);
    const L = p.len[`${s}_arm1`];
    return V(x, y, S.z + Math.sqrt(Math.max(L * L - (x - S.x) ** 2 - (y - S.y) ** 2, 0.0004)));
  };
  const world = (p, v) => v.clone().applyMatrix4(p.root.matrixWorld);
  const dirWorld = (p, v) => v.clone().transformDirection(p.root.matrixWorld);

  function poseSmoker(t) {
    const p = smoker;
    const raise = Math.max(...DRAG.map((d) => bump(t, ...d)));
    const hold = Math.max(...DRAG.map((d) => bump(t, d[1] - 0.2, d[1] + 0.15, d[2] - 0.15, d[2] + 0.2)));
    const exhale = Math.max(...DRAG.map((d) => bump(t, d[3] + 0.4, d[3] + 0.8, d[3] + 2.0, d[3] + 2.8)));
    const talk = TALK_HE(t);
    const tog = TOGETHER(t);
    const breath = wave(t, 12);
    p.reset();
    p.spine(0.56 + 0.012 * breath - 0.07 * raise, 0.06 + 0.14 * tog, 0);
    sitLegs(p);
    // huvudet: ner mot disken i vila, mot kvinnan när de talar
    const nod = talk * 0.035 * wave(t, 40) + 0.05 * bump(t, 26.6, 27.0, 27.2, 27.8);
    p.head(0.26 + 0.4 * tog + 0.02 * wave(t, 5), 0.24 - 0.14 * tog - 0.2 * raise + nod, 0.02 * wave(t, 3, 0.2));
    // vänster hand vilar på disken
    // underarmarna vilar på disken, armbågarna på kanten
    p.arm('L', V(0.15, cy + 0.04, 0.52), elbowAt(p, 'L', V(0.34, cy + 0.06, 0.31)), V(-0.55, 0, 0.85), Y, 0.3);
    // höger hand: vilar med cigaretten, förs mot munnen vid bloss
    // Vid blosset ligger fingrarna tvärs framför munnen med handflatan mot
    // ansiktet; cigaretten pekar rakt ut, väl under hattbrättet.
    const restW = V(-0.03, cy + 0.045, 0.53);
    const F = V(0.55, 0, 0.85).lerp(V(0.86, 0.48, -0.14), raise);
    const U = V(0, 1, 0.05).lerp(V(0.05, 0.12, 1), raise);
    const upW = wristFor(p, V(0.86, 0.48, -0.14), V(0.05, 0.12, 1), p.mouth().add(p.headDir().multiplyScalar(0.012)));
    const w = restW.clone().lerp(upW, raise).add(V(-0.02, 0.02, 0.06).multiplyScalar(Math.sin(Math.PI * raise)));
    const k = raise;
    p.arm('R', w, elbowAt(p, 'R', V(-0.34, cy + 0.06 + 0.06 * raise, 0.31)), F, U, [0.3 - 0.16 * k, 0.32 - 0.16 * k, 0.36 + 0.4 * k, 0.4 + 0.42 * k]);
    p.setMorph('pucker', hold * 0.9);
    p.setMorph('jaw', exhale * 0.25);
    p.setMorph('oh', exhale * 0.5);
    if (talk > 0.02) speak(p, t, talk * (1 - exhale));
    else if (exhale < 0.02) {
      p.setMorph('aa', 0);
      p.setMorph('ee', 0);
    }
    const bl = blink(t, [2.1, 7.0, 13.4, 18.3, 22.9, 27.5, 30.2, 37.4, 41.0, 45.6]);
    p.setMorph('blinkL', bl);
    p.setMorph('blinkR', bl);
    p.cig.ember.color.setRGB(1.2 + 3.0 * hold, 0.34 + 0.9 * hold, 0.08 + 0.1 * hold);
    p.state = { hold, exhale };
  }

  function poseWoman(t) {
    const p = woman;
    const tog = TOGETHER(t);
    const talk = TALK_SHE(t);
    const breath = wave(t, 12, 0.3);
    p.reset();
    // Hållningen i målningen: hon fäller fram från höften med rak rygg och
    // stöder båda armbågarna på disken. Vänster underarm ligger tvärs över
    // disken framför henne, med handen invid höger armbåge; höger underarm
    // står upp och handen håller lappen strax under hakan.
    p.turn('Pelvis', X, 0.45);
    p.spine(0.3 + 0.012 * breath, 0, 0);
    p.leg('L', V(-0.02, floor + 0.1, 0.24), V(-0.55, 0.15, 0.8));
    p.leg('R', V(-0.2, floor + 0.1, 0.2), V(-0.7, 0.15, 0.7));
    // blicken: på det hon håller i handen, eller mot mannen
    const nod = 0.05 * (bump(t, 18.8, 19.1, 19.3, 19.8) + bump(t, 21.2, 21.5, 21.7, 22.2)) + talk * 0.03 * wave(t, 36, 0.2);
    // (huvudet vrids ordentligt åt hans håll, annars ser hon ut att tala rakt mot betraktaren;
    // axlarna hålls stilla – nyckelbenen sitter på halsbenet i den här riggen)
    p.head(-0.04 - 0.94 * tog + 0.012 * wave(t, 7), 0.42 - 0.32 * tog + nod, -0.03 + 0.05 * tog + talk * 0.03 * wave(t, 16), true);

    // När hon ser upp mot mannen (rest → 1) sjunker höger underarm ner och
    // vilar på disken, och vänster underarm vrids framåt så att den ligger fri.
    const rest = tog;
    const fid = 0.02 * wave(t, 16) * (1 - rest);
    const twirl = 0.1 * wave(t, 16, 0.25) * (1 - rest);
    const yE = cy + 0.045; // armbågens led när armen vilar på skivan

    const eL = elbowOn(p, 'L', 0.2, yE);
    const dL = V(-0.95, 0, 0.3).normalize().lerp(V(-0.62, 0, 0.78).normalize(), rest).normalize();
    const wL = eL.clone().addScaledVector(dL, p.len.L_arm2);
    wL.y += 0.012; // fingrarna ska ligga på skivan, inte i den
    p.arm('L', wL, elbowAt(p, 'L', eL), dL, Y, 0.3);

    const eR = elbowOn(p, 'R', -0.1, yE);
    // (upprätt läge: underarmen lutar fram mot betraktaren, så att handen hamnar framför hakan och inte mot den)
    const dR = V(0.42 + fid, 0.58, 0.7).normalize().lerp(V(-0.45, 0.06, 0.89).normalize(), rest).normalize();
    const w = eR.clone().addScaledVector(dR, p.len.R_arm2);
    w.y += 0.08 * rest * (1 - rest); // en liten båge på vägen ner, så att fingrarna inte skrapar i disken
    const F = V(0.12 + twirl, 0.95, 0.2).lerp(V(-0.42, 0.1, 0.9), rest).normalize(); // fingrarna: uppåt → framåt längs disken
    const U = V(-0.5, 0.05, 0.86).lerp(V(-0.85, 0.38, -0.35), rest).normalize(); // handryggen: mot betraktaren → utåt, tummen överst
    p.arm('R', w, elbowAt(p, 'R', eR), F, U, [0.5, 1.15, 1.25, 1.3]);
    {
      // lappen står i greppet, vänd mot hennes ansikte
      const grip = p.pinch('R');
      const upN = V(0.1 + twirl, 0.95, 0.12).lerp(V(-0.05, 0.8, 0.6), rest).normalize();
      const toFace = p.pos('Head').add(V(0, 0.09, 0.05)).sub(grip);
      const z = toFace.addScaledVector(upN, -toFace.dot(upN)).normalize();
      const x = new THREE.Vector3().crossVectors(upN, z);
      p.note.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, upN, z));
      p.note.position.copy(grip).addScaledVector(upN, 0.014);
    }
    if (talk > 0.02) speak(p, t, talk);
    else {
      p.setMorph('aa', 0);
      p.setMorph('oh', 0);
      p.setMorph('ee', 0);
    }
    const smile = 0.25 * tog;
    p.setMorph('smileL', smile);
    p.setMorph('smileR', smile);
    const down = 0.7 * (1 - tog);
    p.setMorph('lookDownL', down);
    p.setMorph('lookDownR', down);
    const bl = blink(t, [1.2, 5.6, 9.9, 15.2, 20.4, 25.1, 28.7, 33.3, 38.0, 43.9]);
    p.setMorph('blinkL', bl);
    p.setMorph('blinkR', bl);
  }

  function poseLoner(t) {
    const p = loner;
    const raise = bump(t, ...LONE_DRAG);
    const hold = bump(t, LONE_DRAG[1] - 0.2, LONE_DRAG[1] + 0.15, LONE_DRAG[2] - 0.15, LONE_DRAG[2] + 0.2);
    const exhale = bump(t, LONE_DRAG[3] + 0.4, LONE_DRAG[3] + 0.8, LONE_DRAG[3] + 2.0, LONE_DRAG[3] + 2.8);
    const breath = wave(t, 12, 0.6);
    p.reset();
    p.spine(0.42 + 0.01 * breath - 0.05 * raise, -0.05, 0.02);
    sitLegs(p, 0.7, 0.18);
    p.head(-0.26 + 0.02 * wave(t, 2, 0.3), 0.3 - 0.14 * raise + 0.012 * wave(t, 4), 0.05);
    // höger hand om glaset
    p.arm('R', V(-0.2, cy + 0.07, 0.46), elbowAt(p, 'R', V(-0.36, cy + 0.06, 0.3)), V(0.1, 0.05, 1), V(-0.75, 0.6, 0.1), 0.75);
    // vänster hand med cigaretten
    const restW = V(0.08, cy + 0.045, 0.5);
    const F = V(-0.3, 0, 1).lerp(V(-0.86, 0.48, -0.14), raise);
    const U = V(0, 1, 0.05).lerp(V(-0.05, 0.12, 1), raise);
    const upW = wristFor(p, V(-0.86, 0.48, -0.14), V(-0.05, 0.12, 1), p.mouth().add(p.headDir().multiplyScalar(0.012)));
    const w = restW.clone().lerp(upW, raise).add(V(0.02, 0.02, 0.06).multiplyScalar(Math.sin(Math.PI * raise)));
    const k = raise;
    p.arm('L', w, elbowAt(p, 'L', V(0.34, cy + 0.06 + 0.06 * raise, 0.3)), F, U, [0.3 - 0.16 * k, 0.32 - 0.16 * k, 0.36 + 0.4 * k, 0.4 + 0.42 * k]);
    p.setMorph('pucker', hold * 0.9);
    p.setMorph('oh', exhale * 0.5);
    const bl = blink(t, [3.3, 9.1, 14.8, 21.0, 26.2, 32.6, 38.8, 44.4]);
    p.setMorph('blinkL', bl);
    p.setMorph('blinkR', bl);
    p.cig.ember.color.setRGB(1.2 + 3.0 * hold, 0.34 + 0.9 * hold, 0.08 + 0.1 * hold);
    p.state = { hold, exhale };
  }

  function poseWaiter(t) {
    const p = waiter;
    const gl = GLANCE(t);
    const work = 1 - 0.75 * gl;
    const nods = 0.085 * (bump(t, 19.0, 19.25, 19.35, 19.7) + bump(t, 19.9, 20.15, 20.25, 20.6) + bump(t, 20.8, 21.05, 21.15, 21.5) + bump(t, 40.9, 41.15, 41.25, 41.6) + bump(t, 41.7, 41.95, 42.05, 42.4));
    const c = wave(t, 20);
    const s = wave(t, 20, 0.25);
    p.reset();
    p.spine(1.2 + 0.02 * c * work - 0.14 * gl, -0.4 * gl, 0);
    // står med lätt böjda knän
    p.leg('L', V(0.14, 0.09, -0.04), V(0.2, 0, 1));
    p.leg('R', V(-0.14, 0.09, -0.1), V(-0.2, 0, 1));
    // blicken snett ner på det han gör – eller över axeln mot paret
    p.head(0.05 - 1.12 * gl, 0.72 - 0.62 * gl + nods + 0.03 * (1 - gl) * wave(t, 4), 0);
    // Händerna arbetar vid hyllan innanför diskkanten: små cirklar, som när
    // man diskar glas. Målen anges längs disken så att armarna aldrig går in i den.
    // Handlederna hålls så högt att fingrarna går fria från arbetshyllan (y 0,52).
    const r = 0.03 * work;
    const inside = D.cOff + D.cW + 0.15;
    const hand = (tt, off, y) => {
      const q = fp(tt, off);
      return V(q[0], y, q[1]).applyMatrix4(p.rInv);
    };
    const back = V(0, 0.45, -1); // armbågarna bakåt-uppåt, bort från disken
    p.arm('L', hand(WORK_T + 0.1 + r * c, inside + 0.4 * r * s, 0.71 + 0.5 * r * s), back, V(0, -0.75, 0.65), V(0, 0.65, 0.75), 0.5);
    p.arm('R', hand(WORK_T - 0.1 - r * s, inside + 0.03 - 0.4 * r * c, 0.68 + 0.6 * r * c), back, V(0, -0.75, 0.65), V(0, 0.65, 0.75), 0.5);
    const bl = blink(t, [4.0, 10.5, 16.2, 19.6, 24.4, 29.0, 35.5, 41.3, 46.0]);
    p.setMorph('blinkL', bl);
    p.setMorph('blinkR', bl);
    const smile = 0.3 * gl;
    p.setMorph('smileL', smile);
    p.setMorph('smileR', smile);
  }

  let last = -1;
  let clock = 0;

  function update(time, dt = 0) {
    const t = ((time % LOOP) + LOOP) % LOOP;
    poseSmoker(t);
    poseWoman(t);
    poseLoner(t);
    poseWaiter(t);
    // hattarnas läge till skuggan under brättet
    for (const p of [smoker, loner]) {
      p.root.updateMatrixWorld(true);
      const u = p.brim;
      u.inv.value.copy(u.hat.matrixWorld).invert();
      u.light.value.copy(u.dir).applyQuaternion(p.root.quaternion).transformDirection(u.inv.value);
    }
    if (dt > 0) {
      clock += dt;
      // rökstrimmor från glöden, starkare strax efter ett bloss
      for (const p of [smoker, loner]) {
        p.root.updateMatrixWorld(true);
        const tip = p.cig.end.getWorldPosition(tmp).clone();
        const rate = (p === smoker ? 9 : 5) * (1 - 0.8 * p.state.hold);
        p.acc = (p.acc || 0) + rate * dt;
        while (p.acc > 1) {
          p.acc -= 1;
          smoke.emit(tip, V((Math.random() - 0.5) * 0.01, 0.07 + Math.random() * 0.03, (Math.random() - 0.5) * 0.01), 5.5 + Math.random() * 2, 0.012, 0.13, p === smoker ? 0.085 : 0.06);
        }
        // utandningen: ett mjukt moln framför ansiktet
        if (p.state.exhale > 0.05) {
          p.accX = (p.accX || 0) + 26 * p.state.exhale * dt;
          const mouth = world(p, p.mouth());
          const dir = dirWorld(p, p.headDir().add(V(0, -0.15, 0)).normalize());
          while (p.accX > 1) {
            p.accX -= 1;
            const v = dir.clone().multiplyScalar(0.3 + Math.random() * 0.15).add(V((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.06));
            smoke.emit(mouth, v, 4 + Math.random() * 2.5, 0.03, 0.24, 0.075);
          }
        }
      }
      smoke.update(dt, clock);
    }
    last = t;
  }

  update(0, 0);

  /**
   * Den ensamme mannens blick: en punkt strax framför hans ögon (utanför
   * hattbrättet) och det han tittar på – paret på andra sidan disken.
   */
  function strangerView() {
    for (const p of [loner, smoker, woman]) p.root.updateMatrixWorld(true);
    const eyes = world(loner, loner.mouth().add(V(0, 0.07, 0)));
    const target = world(smoker, smoker.pos('Head')).add(world(woman, woman.pos('Head'))).multiplyScalar(0.5);
    target.y += 0.02;
    const pos = eyes.clone().addScaledVector(target.clone().sub(eyes).normalize(), 0.14);
    return { pos, target };
  }

  return { group, update, people: { smoker, woman, loner, waiter }, smoke, strangerView };
}
