import * as THREE from 'three';
import { HERO, DEG } from './config.js';
import { buildTextures, setAnisotropy, backdrop } from './textures.js';
import { buildMaterials } from './materials.js';
import { buildBlock } from './world/block.js';
import { buildDiner } from './world/diner.js';
import { buildInterior } from './world/interior.js';
import { buildFigures } from './world/figures.js';
import { loadPeople } from './world/people.js';
import { buildBuildings } from './world/buildings.js';
import { buildLighting, bakeShadows, captureEnvironments, nightEnvironment } from './lighting.js';
import { buildPost } from './post.js';
import { FlyControls } from './controls.js';
import { layoutFrame, drawGuides } from './overlay.js';

const canvas = document.getElementById('scene');
const guides = document.getElementById('guides');
const frameEl = document.getElementById('frame');
const ASPECT = HERO.imgW / HERO.imgH;
const HERO_FOV = 2 * Math.atan(HERO.imgH / 2 / HERO.focalPx) / DEG; // 27,85°

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
setAnisotropy(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
scene.background = backdrop();
const camera = new THREE.PerspectiveCamera(HERO_FOV, window.innerWidth / window.innerHeight, 0.05, 400);

/** Linsen anges som bildvinkel vid målningens format; smalare fönster får behålla bredden. */
function applyFov(ref) {
  const a = window.innerWidth / window.innerHeight;
  const t = Math.tan((ref * DEG) / 2) * (a >= ASPECT ? 1 : ASPECT / a);
  camera.fov = (2 * Math.atan(t)) / DEG;
  camera.aspect = a;
  camera.updateProjectionMatrix();
}

function pose(pos, target) {
  const d = new THREE.Vector3(...target).sub(new THREE.Vector3(...pos)).normalize();
  return { pos: new THREE.Vector3(...pos), yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(d.y) };
}

const STRANGER_FOV = 32;
const VIEWS = {
  hero: {
    pos: new THREE.Vector3(...HERO.pos),
    yaw: Math.atan2(-HERO.fwd[0], -HERO.fwd[1]),
    pitch: -HERO.pitch,
    fov: HERO_FOV,
  },
  block: { ...pose([-19, 19, 30], [2.4, 0.2, 0.2]), fov: 32 },
  // den ensamme mannens blick mot paret (räknas om från figurerna när de har lästs in)
  stranger: { ...pose([3.55, 1.3, 2.34], [5.82, 1.24, 0.7]), fov: STRANGER_FOV },
  street: { ...pose([-5.6, 1.6, 6.2], [3.2, 1.9, 0.8]), fov: 44 },
};

const controls = new FlyControls(camera, canvas, { pivot: new THREE.Vector3(4.2, 1.2, 2.2) });
controls.fov = HERO_FOV;
controls.onFov = applyFov;
controls.setPose(VIEWS.hero.pos, VIEWS.hero.yaw, VIEWS.hero.pitch);
applyFov(HERO_FOV);

// ---------------------------------------------------------------------------

let post = null;
let people = null; // de animerade figurerna
const state = { frame: false, guides: false, paused: false, time: 0 };

async function build() {
  const T = buildTextures();
  const M = buildMaterials(T);
  const placeholder = new THREE.WebGLCubeRenderTarget(4).texture;

  scene.environment = nightEnvironment(renderer, T.env);
  scene.environmentIntensity = 2.2;

  const block = buildBlock(M);
  const diner = buildDiner(M, placeholder);
  const interior = buildInterior(M);
  // Riggade människomodeller; går de inte att läsa in används de enkla
  // figurerna som byggs i kod.
  let figures;
  try {
    people = await loadPeople(M);
    figures = people.group;
    const v = people.strangerView();
    VIEWS.stranger = { ...pose(v.pos.toArray(), v.target.toArray()), fov: STRANGER_FOV };
  } catch (err) {
    console.warn('Kunde inte läsa in figurmodellerna – använder de inbyggda.', err);
    figures = buildFigures(M);
  }
  const buildings = buildBuildings(M, placeholder);
  scene.add(block, diner.group, interior, figures, buildings.group);

  const L = buildLighting(scene);
  bakeShadows(renderer, scene, camera, L, diner.blockers, [figures]);

  // speglingar
  const shopPanes = [];
  buildings.group.traverse((o) => {
    if (o.isMesh && (o.material === buildings.paneMats.tint || o.material === buildings.paneMats.reflect)) shopPanes.push(o);
  });
  const env = captureEnvironments(renderer, scene, [diner.glass, ...shopPanes]);
  diner.glassMats.front.uniforms.envMap.value = env.front.texture;
  diner.glassMats.far.uniforms.envMap.value = env.far.texture;
  diner.glassMats.tip.uniforms.envMap.value = env.tip.texture;
  diner.glassMats.inside.uniforms.envMap.value = env.inside.texture;
  buildings.paneMats.reflect.uniforms.envMap.value = env.shop.texture;
  for (const m of [M.chrome, M.steel, M.cherry, M.cherryTop, M.ceramic, M.seat]) {
    m.envMap = env.insidePMREM;
    m.envMapIntensity = m === M.cherry || m === M.cherryTop ? 0.45 : 1.0;
    m.needsUpdate = true;
  }

  post = buildPost(renderer, scene, camera);
  resize();
  window.__nh = { scene, camera, renderer, controls, L, M, post, VIEWS, diner, state, people };
  // förstoring av en del av målningens bildyta (för jämförelser)
  window.__nh.snap = (name) => {
    const v = VIEWS[name];
    controls.setPose(v.pos, v.yaw, v.pitch);
    controls.fov = v.fov;
    applyFov(v.fov);
  };
  window.__nh.zoom = (x0, y0, x1, y1) => {
    if (x0 === undefined) camera.clearViewOffset();
    else camera.setViewOffset(HERO.imgW, HERO.imgH, x0, y0, x1 - x0, y1 - y0);
    camera.updateProjectionMatrix();
  };
}

// ---------------------------------------------------------------------------

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  applyFov(controls.fov);
  if (post) {
    post.composer.setPixelRatio(pixelRatio);
    post.composer.setSize(w, h);
    post.grade.uniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
  }
  layoutFrame(frameEl, w, h);
  if (state.guides) drawGuides(guides, w, h);
}
window.addEventListener('resize', resize);

function setView(name) {
  const v = VIEWS[name];
  controls.flyTo(v.pos, v.yaw, v.pitch, v.fov, name === 'hero' ? 2.0 : 2.4);
  document.querySelectorAll('#views [data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
}
controls.onUser = () => document.querySelectorAll('#views [data-view]').forEach((b) => b.classList.remove('on'));

document.querySelectorAll('#views [data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
const frameBtn = document.getElementById('btn-frame');
function toggleFrame() {
  state.frame = !state.frame;
  frameEl.classList.toggle('on', state.frame);
  frameBtn.classList.toggle('on', state.frame);
}
frameBtn.addEventListener('click', toggleFrame);

// Kopiera länken till sidan. Knappen kan bära en uttrycklig adress (data-url),
// annars används sidans egen.
const copyBtn = document.getElementById('btn-copy');
if (copyBtn) {
  const label = copyBtn.querySelector('span');
  const idle = label.textContent;
  let timer = 0;
  copyBtn.addEventListener('click', () => {
    const url = copyBtn.dataset.url || window.location.href;
    const copied = () => {
      label.textContent = 'Copied';
      clearTimeout(timer);
      timer = setTimeout(() => (label.textContent = idle), 1800);
    };
    // nekas urklipp visas länken markerad i stället, så att den går att kopiera för hand
    const showLink = () => {
      if (copyBtn.nextElementSibling?.classList.contains('linkbox')) return;
      const box = document.createElement('input');
      box.className = 'linkbox';
      box.readOnly = true;
      box.value = url;
      box.setAttribute('aria-label', 'Link to this page');
      copyBtn.after(box);
      box.focus();
      box.select();
      box.addEventListener('blur', () => box.remove());
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(copied, showLink);
    else showLink();
  });
}

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Digit1') setView('hero');
  else if (e.code === 'Digit2') setView('block');
  else if (e.code === 'Digit3') setView('stranger');
  else if (e.code === 'Digit4') setView('street');
  else if (e.code === 'KeyF') toggleFrame();
  else if (e.code === 'KeyH') document.body.classList.toggle('quiet');
  else if (e.code === 'KeyP') state.paused = !state.paused;
  else if (e.code === 'KeyG') {
    state.guides = !state.guides;
    guides.style.display = state.guides ? 'block' : 'none';
    if (state.guides) drawGuides(guides, window.innerWidth, window.innerHeight);
  }
});

// ---------------------------------------------------------------------------

const timer = new THREE.Timer();
let acc = 0;
let frames = 0;
function tick(now) {
  timer.update(now);
  const raw = timer.getDelta();
  controls.update(Math.min(raw, 0.05), Math.min(raw, 0.5));
  if (people && !state.paused) {
    const dt = Math.min(raw, 0.1);
    state.time += dt;
    // rökpartiklarnas storlek på skärmen följer linsen
    people.smoke.mat.uniforms.uScale.value = (window.innerHeight * pixelRatio) / (2 * Math.tan((camera.fov * DEG) / 2));
    people.update(state.time, dt);
  }
  if (post) {
    post.grade.uniforms.uTime.value += raw;
    post.composer.render(raw);
  }
  // Sänk upplösningen om datorn inte hänger med. Bildrutor som strypts av
  // webbläsaren (fliken i bakgrunden) räknas inte.
  if (raw < 0.12) {
    acc += raw;
    frames++;
  }
  if (frames >= 120) {
    if (acc / frames > 0.03 && pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio - 0.25);
      resize();
    }
    acc = 0;
    frames = 0;
  }
  requestAnimationFrame(tick);
}

// (setTimeout i stället för requestAnimationFrame: scenen ska byggas även om
// fliken ligger i bakgrunden när sidan laddas)
setTimeout(async () => {
  await build();
  document.getElementById('loading').classList.add('done');
  requestAnimationFrame(tick);
}, 60);
