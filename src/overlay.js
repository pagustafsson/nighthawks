import { HERO } from './config.js';

const ASPECT = HERO.imgW / HERO.imgH;

/** Rektangeln i fönstret som motsvarar målningens beskärning. */
export function frameRect(w, h) {
  if (w / h >= ASPECT) {
    const fw = h * ASPECT;
    return { x: (w - fw) / 2, y: 0, w: fw, h };
  }
  const fh = w / ASPECT;
  return { x: 0, y: (h - fh) / 2, w, h: fh };
}

export function layoutFrame(el, w, h) {
  const r = frameRect(w, h);
  const [top, bottom, left, right] = el.children;
  top.style.cssText = `left:0;top:0;width:100%;height:${r.y}px`;
  bottom.style.cssText = `left:0;top:${r.y + r.h}px;width:100%;height:${h - r.y - r.h}px`;
  left.style.cssText = `left:0;top:${r.y}px;width:${r.x}px;height:${r.h}px`;
  right.style.cssText = `left:${r.x + r.w}px;top:${r.y}px;width:${w - r.x - r.w}px;height:${r.h}px`;
}

// Mätlinjer från målningen (i målningens pixlar). Används för att passa in
// kamera och geometri mot originalet – visas med tangent G.
const LINES = [
  ['#ff4', [[0, 482], [2000, 482]]], // horisont
  ['#f0f', [[760, 286], [2000, 218]]], // takfotens underkant
  ['#f0f', [[665, 162], [1600, 42]]],
  ['#f0f', [[1000, 790], [1980, 872]]], // bröstning
  ['#f0f', [[730, 286], [730, 760]]],
  ['#f0f', [[770, 286], [770, 748]]],
  ['#f0f', [[1818, 225], [1818, 850]]],
  ['#f0f', [[632, 300], [632, 735]]],
  ['#f0f', [[608, 700], [608, 760]]],
  ['#0ff', [[790, 300], [1522, 313], [1522, 660]]], // bakre fönstret
  ['#0ff', [[1603, 313], [1603, 660]]],
  ['#0ff', [[1500, 262], [1787, 262], [2000, 220]]],
  ['#0ff', [[1787, 262], [1787, 660]]],
  ['#fa0', [[1885, 690], [1885, 405], [1967, 405], [1967, 690]]], // dörren
  ['#f44', [[1300, 707], [2000, 755]]], // disken
  ['#f44', [[1000, 668], [1500, 665]]],
  ['#f44', [[880, 660], [880, 700]]],
  ['#f44', [[1750, 668], [2000, 700]]],
  ['#4f4', [[0, 255], [600, 262]]], // röda huset
  ['#4f4', [[0, 300], [600, 300]]],
  ['#4f4', [[0, 702], [600, 702]]],
  ['#4f4', [[168, 30], [247, 30], [247, 205], [168, 205], [168, 30]]],
  ['#4f4', [[350, 35], [423, 35], [423, 215], [350, 215], [350, 35]]],
  ['#4f4', [[520, 40], [592, 40], [592, 220], [520, 220], [520, 40]]],
  ['#4f4', [[50, 310], [50, 700]]],
  ['#4f4', [[80, 310], [80, 700]]],
  ['#4f4', [[300, 310], [300, 700]]],
  ['#4f4', [[318, 310], [318, 700]]],
  ['#4f4', [[440, 310], [440, 700]]],
  ['#4f4', [[460, 310], [460, 700]]],
  ['#4f4', [[270, 68], [270, 250]]], // ljusets vänsterkant på teglet
  ['#4f4', [[270, 68], [600, 135]]],
  ['#fff', [[0, 868], [600, 790]]], // trottoarkant
  ['#fff', [[100, 728], [500, 722]]],
  ['#fff', [[640, 880], [1000, 978], [1230, 1091]]], // skuggans diagonal
  ['#f88', [[663, 85], [663, 165]]],
  ['#f88', [[663, 85], [1000, 28]]],
];
const DOTS = [
  [1088, 572, 26], // mannen med ryggen mot oss
  [1395, 578, 24],
  [1508, 578, 24],
  [1622, 615, 26],
  [1717, 590, 38],
  [1807, 590, 38],
  [935, 748, 20],
  [1240, 768, 22],
  [1385, 787, 24],
  [1548, 813, 26],
  [1712, 848, 28],
  [1895, 880, 30],
];

export function drawGuides(canvas, w, h) {
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const r = frameRect(w, h);
  const s = r.w / HERO.imgW;
  const X = (x) => r.x + x * s;
  const Y = (y) => r.y + y * s;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.85;
  for (const [color, pts] of LINES) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
    ctx.stroke();
  }
  ctx.strokeStyle = '#fff';
  for (const [x, y, rad] of DOTS) {
    ctx.beginPath();
    ctx.arc(X(x), Y(y), rad * s, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}
