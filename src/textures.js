import * as THREE from 'three';
import { rng } from './util.js';

// Procedurella texturer – allt ritas vid start, inga bildfiler.

let MAX_ANISO = 8;
export function setAnisotropy(n) {
  MAX_ANISO = n;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Periodiskt värdebrus, cx × cy celler. */
function valueNoise(w, h, cx, cy, rand) {
  const g = new Float32Array(cx * cy);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * cy;
    const y0 = Math.floor(fy);
    const ty = smooth(fy - y0);
    const ya = (y0 % cy) * cx;
    const yb = ((y0 + 1) % cy) * cx;
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * cx;
      const x0 = Math.floor(fx);
      const tx = smooth(fx - x0);
      const xa = x0 % cx;
      const xb = (x0 + 1) % cx;
      const a = g[ya + xa] + (g[ya + xb] - g[ya + xa]) * tx;
      const b = g[yb + xa] + (g[yb + xb] - g[yb + xa]) * tx;
      out[y * w + x] = a + (b - a) * ty;
    }
  }
  return out;
}

function fbm(w, h, cx, cy, oct, rand, gain = 0.5) {
  const out = new Float32Array(w * h);
  let amp = 1;
  let sum = 0;
  for (let o = 0; o < oct; o++) {
    const n = valueNoise(w, h, cx << o, cy << o, rand);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    sum += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

function grayCanvas(w, h, fn) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = fn(i);
    if (typeof v === 'number') {
      const b = Math.max(0, Math.min(255, v * 255));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = b;
    } else {
      img.data[i * 4] = Math.max(0, Math.min(255, v[0] * 255));
      img.data[i * 4 + 1] = Math.max(0, Math.min(255, v[1] * 255));
      img.data[i * 4 + 2] = Math.max(0, Math.min(255, v[2] * 255));
    }
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tex(c, { rx = 1, ry = 1, srgb = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = MAX_ANISO;
  return t;
}

// ---------------------------------------------------------------------------

function asphalt() {
  const S = 1024;
  const r = rng(11);
  const big = fbm(S, S, 5, 5, 5, r, 0.55);
  const fine = fbm(S, S, 96, 96, 2, r, 0.6);
  const c = grayCanvas(S, S, (i) => {
    let v = 0.66 + (big[i] - 0.5) * 0.34 + (fine[i] - 0.5) * 0.3 + (r() - 0.5) * 0.16;
    if (r() > 0.992) v += 0.22; // ljusa stenkorn
    return v;
  });
  const bump = grayCanvas(S, S, (i) => 0.5 + (fine[i] - 0.5) * 1.2 + (r() - 0.5) * 0.5);
  return {
    map: tex(c, { rx: 1 / 5, ry: 1 / 5 }),
    bump: tex(bump, { rx: 1 / 5, ry: 1 / 5, srgb: false }),
  };
}

function concrete() {
  const S = 1024;
  const r = rng(23);
  const big = fbm(S, S, 4, 4, 5, r, 0.55);
  const fine = fbm(S, S, 128, 128, 2, r, 0.5);
  const c = grayCanvas(S, S, (i) => 0.8 + (big[i] - 0.5) * 0.26 + (fine[i] - 0.5) * 0.12 + (r() - 0.5) * 0.06);
  const bump = grayCanvas(S, S, (i) => 0.5 + (fine[i] - 0.5) * 0.9 + (big[i] - 0.5) * 0.3);
  return {
    map: tex(c, { rx: 1 / 6, ry: 1 / 6 }),
    bump: tex(bump, { rx: 1 / 6, ry: 1 / 6, srgb: false }),
  };
}

/** Trottoarplattor med fogar (rutnät 1,5 m). */
function pavers() {
  const S = 1024;
  const r = rng(29);
  const big = fbm(S, S, 4, 4, 5, r, 0.55);
  const fine = fbm(S, S, 128, 128, 2, r, 0.5);
  const cells = 2;
  const tone = [];
  for (let i = 0; i < cells * cells; i++) tone.push((r() - 0.5) * 0.07);
  const c = grayCanvas(S, S, (i) => {
    const x = i % S;
    const y = (i / S) | 0;
    const cxl = Math.floor((x / S) * cells);
    const cyl = Math.floor((y / S) * cells);
    const fx = ((x / S) * cells) % 1;
    const fy = ((y / S) * cells) % 1;
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
    let v = 0.8 + tone[cyl * cells + cxl] + (big[i] - 0.5) * 0.22 + (fine[i] - 0.5) * 0.1;
    if (edge < 0.008) v *= 0.55;
    return v;
  });
  return { map: tex(c, { rx: 1 / 3, ry: 1 / 3 }) };
}

function brick(seed, base, mortar, spread) {
  const W = 1024;
  const H = 768;
  const cols = 8;
  const rows = 16;
  const bw = W / cols;
  const bh = H / rows;
  const r = rng(seed);
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const b = makeCanvas(W, H);
  const btx = b.getContext('2d');
  ctx.fillStyle = `rgb(${mortar[0]},${mortar[1]},${mortar[2]})`;
  ctx.fillRect(0, 0, W, H);
  btx.fillStyle = '#404040';
  btx.fillRect(0, 0, W, H);
  const m = 5;
  for (let y = 0; y < rows; y++) {
    const off = y % 2 ? bw / 2 : 0;
    for (let x = -1; x < cols; x++) {
      const k = (r() - 0.5) * 2;
      const k2 = (r() - 0.5) * 2;
      const col = [base[0] + k * spread[0], base[1] + k * spread[1] + k2 * 6, base[2] + k * spread[2] + k2 * 5];
      ctx.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
      const g = 150 + r() * 60;
      btx.fillStyle = `rgb(${g | 0},${g | 0},${g | 0})`;
      // tegel som korsar en kant ritas på båda sidor så mönstret går att upprepa
      for (const dx of [0, -W, W]) {
        const bx = x * bw + off + m / 2 + dx;
        if (bx > W || bx + bw < 0) continue;
        ctx.fillRect(bx, y * bh + m / 2, bw - m, bh - m);
        btx.fillRect(bx, y * bh + m / 2, bw - m, bh - m);
      }
    }
  }
  // sot och ojämnheter
  const n = fbm(256, 256, 6, 6, 4, r, 0.55);
  const img = ctx.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const nn = n[(((y / H) * 256) | 0) * 256 + (((x / W) * 256) | 0)];
      const f = 0.82 + nn * 0.36 + (r() - 0.5) * 0.08;
      img.data[i] *= f;
      img.data[i + 1] *= f;
      img.data[i + 2] *= f;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tw = cols * 0.22;
  const th = rows * 0.075;
  return {
    map: tex(c, { rx: 1 / tw, ry: 1 / th }),
    bump: tex(b, { rx: 1 / tw, ry: 1 / th, srgb: false }),
  };
}

function wood(seed, base) {
  const S = 512;
  const r = rng(seed);
  const grain = fbm(S, S, 3, 48, 4, r, 0.6);
  const wave = fbm(S, S, 2, 6, 3, r, 0.5);
  const c = grayCanvas(S, S, (i) => {
    const g = grain[i] * 0.75 + wave[i] * 0.25;
    const f = 0.62 + g * 0.76;
    return [(base[0] / 255) * f, (base[1] / 255) * f * (0.92 + g * 0.16), (base[2] / 255) * f];
  });
  return { map: tex(c, { rx: 1 / 1.6, ry: 1 / 0.8 }) };
}

function plaster() {
  const S = 512;
  const r = rng(51);
  const big = fbm(S, S, 3, 3, 5, r, 0.55);
  const c = grayCanvas(S, S, (i) => 0.93 + (big[i] - 0.5) * 0.12 + (r() - 0.5) * 0.02);
  return { map: tex(c, { rx: 1 / 4, ry: 1 / 4 }) };
}

/** Emaljerade sockelpaneler med nedsänkt spegel. En modul = 1,3 m. */
function panels() {
  const W = 512;
  const H = 128;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const b = makeCanvas(W, H);
  const btx = b.getContext('2d');
  ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(0, 0, W, H);
  btx.fillStyle = '#b0b0b0';
  btx.fillRect(0, 0, W, H);
  const px = 26;
  const py = 22;
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(px, py, W - px * 2, H - py * 2);
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 3;
  ctx.strokeRect(px, py, W - px * 2, H - py * 2);
  btx.fillStyle = '#505050';
  btx.fillRect(px, py, W - px * 2, H - py * 2);
  const g = btx.createLinearGradient(0, py, 0, py + 10);
  g.addColorStop(0, '#b0b0b0');
  g.addColorStop(1, '#505050');
  btx.fillStyle = g;
  btx.fillRect(px, py, W - px * 2, 10);
  return {
    map: tex(c, { rx: 1 / 1.3, ry: 1 }),
    bump: tex(b, { rx: 1 / 1.3, ry: 1, srgb: false }),
  };
}

function sign() {
  const W = 4096;
  const H = 300;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const r = rng(77);
  ctx.fillStyle = '#3a1c10';
  ctx.fillRect(0, 0, W, H);
  // penseldrag i bottenfärgen
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${90 + r() * 50},${35 + r() * 25},${18 + r() * 14},${0.05 + r() * 0.08})`;
    ctx.fillRect(r() * W, r() * H, 60 + r() * 260, 2 + r() * 5);
  }
  ctx.strokeStyle = 'rgba(20,8,4,0.8)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, H - 10);

  const gold = '#d2a43a';
  const serif = '"Rockwell","Clarendon","American Typewriter","Georgia",serif';
  ctx.textBaseline = 'middle';

  // cigarr
  const cx = 0.154 * W;
  ctx.save();
  ctx.translate(cx, H * 0.3);
  ctx.fillStyle = '#7b4a25';
  ctx.beginPath();
  ctx.ellipse(0, 0, 250, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9b6532';
  ctx.beginPath();
  ctx.ellipse(-20, -6, 200, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9a04a';
  ctx.fillRect(40, -27, 34, 54);
  ctx.fillStyle = '#7a2418';
  ctx.fillRect(48, -27, 18, 54);
  ctx.restore();

  ctx.fillStyle = gold;
  ctx.textAlign = 'center';
  ctx.font = `italic 700 96px "Snell Roundhand","Brush Script MT","Georgia",serif`;
  ctx.fillText('Only 5¢', cx, H * 0.7);

  // PHILLIES
  ctx.font = `700 178px ${serif}`;
  ctx.textAlign = 'left';
  const word = 'PHILLIES';
  const x0 = 0.254 * W;
  const x1 = 0.589 * W;
  let total = 0;
  for (const ch of word) total += ctx.measureText(ch).width;
  const gap = (x1 - x0 - total) / (word.length - 1);
  let x = x0;
  for (const ch of word) {
    ctx.fillStyle = 'rgba(20,8,4,0.55)';
    ctx.fillText(ch, x + 5, H * 0.53 + 5);
    ctx.fillStyle = gold;
    ctx.fillText(ch, x, H * 0.53);
    x += ctx.measureText(ch).width + gap;
  }

  // America's No 1 Cigar – i målningen tunna, handmålade antikvabokstäver som
  // lutar åt höger: ett högt smalt A, "merica's" som klättrar snett uppåt,
  // "No 1" instucket under och "Cigar" med mörk skuggkant. Varje bokstav sätts
  // för sig, lite ojämnt som med pensel.
  {
    const roman = '"Baskerville","Hoefler Text","Garamond","Times New Roman",Georgia,serif';
    const pale = '#b3a04c';
    ctx.textBaseline = 'alphabetic';
    /** En rad på en baslinje som stiger åt höger; parts = [text, storlek] i följd. */
    const line = (parts, x, y, { rise = 0, lean = 0.2, squeeze = 0.8, track = 1.12, shadow = 0, wobble = 1 } = {}) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-rise);
      let cx = 0;
      for (const [text, size] of parts) {
        ctx.font = `400 ${size}px ${roman}`;
        for (const ch of text) {
          const w = ctx.measureText(ch).width * squeeze;
          if (ch !== ' ') {
            ctx.save();
            ctx.translate(cx, (r() - 0.5) * size * 0.05 * wobble);
            ctx.rotate((r() - 0.5) * 0.05 * wobble);
            ctx.transform(squeeze, 0, -lean, 1, 0, 0); // smalare och lutad åt höger
            if (shadow) {
              ctx.fillStyle = 'rgba(22,10,6,0.8)';
              ctx.fillText(ch, shadow, shadow);
            }
            ctx.fillStyle = pale;
            ctx.globalAlpha = 0.78 + r() * 0.2; // färgen tar olika bra
            ctx.fillText(ch, 0, 0);
            ctx.restore();
          }
          cx += w * track;
        }
      }
      ctx.restore();
    };
    const xa = 0.619 * W;
    line([['A', 270]], xa, 247, { lean: 0.07, squeeze: 0.58, wobble: 0.4 });
    line([["merica's", 64]], xa + 124, 178, { rise: 0.25, lean: 0.22, squeeze: 0.86, track: 1.16 });
    line(
      [
        ['N', 112],
        ['o', 74],
        [' ', 40],
        ['1', 112],
      ],
      xa + 236,
      264,
      { rise: 0.1, lean: 0.24, squeeze: 0.74 },
    );
    line(
      [
        ['C', 118],
        ['igar', 80],
      ],
      xa + 492,
      206,
      { rise: 0.08, lean: 0.22, squeeze: 0.82, track: 1.18, shadow: 4 },
    );
    ctx.textBaseline = 'middle';
  }

  // patina
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(30,14,8,${0.04 + r() * 0.1})`;
    ctx.fillRect(r() * W, r() * H, 3 + r() * 30, 1 + r() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  return { map: t };
}

/** Mörk natthimmel som miljö (svaga reflexer + grundljus). */
function nightEnv() {
  const W = 512;
  const H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0d1820');
  g.addColorStop(0.42, '#1a2a30');
  g.addColorStop(0.5, '#243436');
  g.addColorStop(0.54, '#0d1412');
  g.addColorStop(1, '#070b0a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Ljusmask ("gobo") för strålkastaren mot tegelfasaden. Formen följer
 * målningen: skarp lodrät vänsterkant och en sned överkant.
 * dim = området som får grundnivån, lit = den fullt upplysta formen (uv 0..1).
 */
export function cookie(dim, lit, base = 0.3, blur = 3) {
  const S = 1024;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  const fill = (poly, style) => {
    ctx.fillStyle = style;
    ctx.beginPath();
    poly.forEach((p, i) => (i ? ctx.lineTo(p[0] * S, (1 - p[1]) * S) : ctx.moveTo(p[0] * S, (1 - p[1]) * S)));
    ctx.closePath();
    ctx.fill();
  };
  ctx.filter = `blur(${blur}px)`;
  const g = Math.round(base * 255);
  fill(dim, `rgb(${g},${g},${g})`);
  fill(lit, '#fff');
  ctx.filter = 'none';
  // mjuk kant mot konens rand
  const v = ctx.createRadialGradient(S / 2, S / 2, S * 0.38, S / 2, S / 2, S * 0.5);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Mörk bakgrund med en svag ljusning bakom blocket. */
export function backdrop() {
  const c = makeCanvas(1024, 512);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(512, 300, 40, 512, 300, 620);
  g.addColorStop(0, '#0e1a22');
  g.addColorStop(0.55, '#081017');
  g.addColorStop(1, '#03060a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTextures() {
  return {
    asphalt: asphalt(),
    concrete: concrete(),
    pavers: pavers(),
    brickRed: brick(101, [188, 74, 40], [124, 62, 42], [18, 10, 7]),
    brickBrown: brick(202, [104, 74, 62], [52, 44, 40], [18, 12, 10]),
    brickDark: brick(303, [88, 60, 54], [44, 36, 34], [16, 10, 8]),
    cherry: wood(41, [134, 46, 24]),
    walnut: wood(42, [96, 58, 34]),
    plaster: plaster(),
    panels: panels(),
    sign: sign(),
    env: nightEnv(),
  };
}
