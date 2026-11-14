import * as THREE from 'three';

/**
 * Friflygande kamera.
 *   vänsterdrag  – titta runt
 *   W A S D      – flyg (pilar fungerar också), Q/E ner/upp, Shift snabbare
 *   högerdrag    – vrid kameran runt kvarteret
 *   scroll       – framåt/bakåt längs blicken
 *   Z / X        – snävare/vidare lins
 */
export class FlyControls {
  constructor(camera, dom, { pivot = new THREE.Vector3(), bounds = 70, minY = 0.25 } = {}) {
    this.camera = camera;
    this.dom = dom;
    this.pivot = pivot;
    this.bounds = bounds;
    this.minY = minY;
    this.yaw = 0;
    this.pitch = 0;
    this.fov = camera.fov;
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.speed = 3.2;
    this.anim = null;
    this.onUser = null; // anropas när användaren själv styr
    this.onFov = null;
    this._drag = null;
    this._wheel = 0;
    camera.rotation.order = 'YXZ';
    this._bind();
  }

  setPose(pos, yaw, pitch) {
    this.camera.position.copy(pos);
    this.yaw = yaw;
    this.pitch = pitch;
    this.vel.set(0, 0, 0);
    this._apply();
  }

  /** Mjuk kameraåkning till en ny position. */
  flyTo(pos, yaw, pitch, fov, seconds = 1.8) {
    let dy = yaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.anim = null;
    this.keys.clear();
    this.anim = {
      t: 0,
      dur: seconds,
      p0: this.camera.position.clone(),
      p1: pos.clone(),
      y0: this.yaw,
      y1: this.yaw + dy,
      x0: this.pitch,
      x1: pitch,
      f0: this.fov,
      f1: fov ?? this.fov,
    };
    this.vel.set(0, 0, 0);
  }

  _user() {
    this.anim = null;
    if (this.onUser) this.onUser();
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('pointerdown', (e) => {
      if (this._drag) return; // ett finger i taget
      try {
        d.setPointerCapture(e.pointerId);
      } catch {
        /* pekaren går inte att fånga */
      }
      const orbit = e.button === 2 || e.ctrlKey || e.altKey || e.metaKey;
      this._drag = { id: e.pointerId, x: e.clientX, y: e.clientY, orbit };
      d.classList.add('dragging');
      this._user();
    });
    d.addEventListener('pointermove', (e) => {
      if (!this._drag || e.pointerId !== this._drag.id) return;
      const dx = e.clientX - this._drag.x;
      const dy = e.clientY - this._drag.y;
      this._drag.x = e.clientX;
      this._drag.y = e.clientY;
      if (this._drag.orbit) this._orbit(dx, dy);
      else {
        // Man drar i själva bilden: den följer muspekaren eller fingret, likadant
        // på dator och pekskärm. En skärmhöjd motsvarar linsens bildvinkel.
        const s = (this.camera.fov * Math.PI) / 180 / Math.max(1, d.clientHeight);
        this.yaw += dx * s;
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * s, -1.5, 1.5);
      }
    });
    const end = (e) => {
      if (this._drag && e.pointerId !== this._drag.id) return;
      this._drag = null;
      d.classList.remove('dragging');
      try {
        d.releasePointerCapture(e.pointerId);
      } catch {
        /* redan släppt */
      }
    };
    d.addEventListener('pointerup', end);
    d.addEventListener('pointercancel', end);
    d.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this._wheel += -e.deltaY * (e.deltaMode === 1 ? 16 : 1);
        this._user();
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.code;
      if (MOVE.has(k)) {
        this.keys.add(k);
        this._user();
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _orbit(dx, dy) {
    const cam = this.camera;
    const s = 0.005;
    const off = cam.position.clone().sub(this.pivot);
    const fwd = this._forward();
    const qy = new THREE.Quaternion().setFromAxisAngle(UP, -dx * s);
    off.applyQuaternion(qy);
    fwd.applyQuaternion(qy);
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    // begränsa höjdvinkeln så att kameran inte slår runt
    const elev = Math.asin(THREE.MathUtils.clamp(off.y / off.length(), -1, 1));
    let a = dy * s;
    a = THREE.MathUtils.clamp(elev + a, -0.05, 1.45) - elev;
    const qx = new THREE.Quaternion().setFromAxisAngle(right, -a);
    off.applyQuaternion(qx);
    fwd.applyQuaternion(qx);
    cam.position.copy(this.pivot).add(off);
    this.yaw = Math.atan2(-fwd.x, -fwd.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
  }

  _forward() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  _apply() {
    const cam = this.camera;
    if (cam.position.y < this.minY) cam.position.y = this.minY;
    const r = Math.hypot(cam.position.x - this.pivot.x, cam.position.z - this.pivot.z);
    if (r > this.bounds) {
      const k = this.bounds / r;
      cam.position.x = this.pivot.x + (cam.position.x - this.pivot.x) * k;
      cam.position.z = this.pivot.z + (cam.position.z - this.pivot.z) * k;
    }
    if (cam.position.y > this.bounds) cam.position.y = this.bounds;
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  /** dt = begränsat tidssteg för flygningen, real = verklig tid (för kameraåkningar). */
  update(dt, real = dt) {
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + real / a.dur);
      const e = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(a.p0, a.p1, e);
      this.yaw = a.y0 + (a.y1 - a.y0) * e;
      this.pitch = a.x0 + (a.x1 - a.x0) * e;
      if (a.f1 !== a.f0) {
        this.fov = a.f0 + (a.f1 - a.f0) * e;
        if (this.onFov) this.onFov(this.fov);
      }
      if (a.t >= 1) this.anim = null;
      this._apply();
      return;
    }
    const k = this.keys;
    const fwd = this._forward();
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    const want = new THREE.Vector3();
    if (k.has('KeyW') || k.has('ArrowUp')) want.add(fwd);
    if (k.has('KeyS') || k.has('ArrowDown')) want.sub(fwd);
    if (k.has('KeyD') || k.has('ArrowRight')) want.add(right);
    if (k.has('KeyA') || k.has('ArrowLeft')) want.sub(right);
    if (k.has('KeyE') || k.has('Space')) want.y += 1;
    if (k.has('KeyQ') || k.has('KeyC')) want.y -= 1;
    if (want.lengthSq() > 0) want.normalize();
    const fast = k.has('ShiftLeft') || k.has('ShiftRight');
    // farten växer lite med avståndet så att överblicksvyn inte känns trög
    const far = THREE.MathUtils.clamp(this.camera.position.distanceTo(this.pivot) / 12, 0.6, 3);
    want.multiplyScalar(this.speed * far * (fast ? 3 : 1));
    this.vel.lerp(want, 1 - Math.exp(-dt * 9));
    this.camera.position.addScaledVector(this.vel, dt);

    if (Math.abs(this._wheel) > 0.01) {
      const stepW = this._wheel * (1 - Math.exp(-dt * 14));
      this._wheel -= stepW;
      this.camera.position.addScaledVector(fwd, stepW * 0.006 * far);
    }
    if (k.has('KeyZ') || k.has('KeyX')) {
      this.fov = THREE.MathUtils.clamp(this.fov * Math.exp((k.has('KeyX') ? 1 : -1) * dt * 0.9), 12, 85);
      if (this.onFov) this.onFov(this.fov);
    }
    this._apply();
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const MOVE = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyC',
  'KeyZ',
  'KeyX',
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
]);
