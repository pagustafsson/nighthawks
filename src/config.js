// Alla mått är i meter och härledda ur målningen (2000 × 1091 px) genom
// bakåtprojektion: horisont y = 482 px, flyktpunkter för glasfasaden och
// gatan bakom, ögonhöjd 1,65 m och brännvidd 2200 px.
//
// Modellens koordinatsystem: origo i kilens teoretiska spets (där de två
// glaslinjerna möts), +X längs bakre glasväggen, +Z mot betraktaren, +Y upp.

export const DEG = Math.PI / 180;
export const ALPHA = 45 * DEG; // kilens vinkel
export const CA = Math.cos(ALPHA);
export const SA = Math.sin(ALPHA);

const r = 1.1;

export const D = {
  r, // radie på den rundade glasspetsen
  tanOff: r / Math.tan(ALPHA / 2), // avstånd spets → tangentpunkt (2,656)

  // höjder
  sill: 0.48,
  head: 2.45, // glasets överkant mot gatan
  farHead: 2.57, // bakre fönstrets överkant (sett inifrån)
  ceil: 2.8,
  fasciaTop: 3.0,
  signH: 0.36,

  // främre glasväggen, t = avstånd längs väggen från spetsen
  tP1: 2.656,
  tP2: 2.857,
  tPost: 6.876,
  tDoor: [9.35, 10.25],
  tR: 10.59, // hörn mot gavelväggen

  // bakre väggen
  xWinEnd: 6.43,
  pierT: 0.85, // murpelarens djup in i rummet
  xC: 7.49, // gavelvägg
  xK: 10.2, // slut på enplansdelen (kök)

  // gavelväggens dörr
  doorZ: [1.62, 2.24],
  doorH: 2.0,

  // disken
  cOff: 0.82, // avstånd glas → diskens kundsida
  cW: 0.5,
  cTipR: 0.47,
  cH: 0.76,
  thirdX: 6.85,

  stoolOff: 0.42,
  stoolH: 0.49,
  stoolsT: [3.378, 4.093, 4.732, 5.305, 5.904, 6.462, 7.039, 7.62, 8.2],
  farStoolsX: [3.62, 4.24, 4.86, 5.489, 6.138],
};

export const BLOCK = { x0: -8.5, x1: 13, z0: -11.5, z1: 12, roadY: -0.15, thick: 1.7 };

export const STREET = {
  facadeZ: -6.46, // röda husets fasadliv
  farCurbZ: -4.8,
  dinerFarCurbZ: -1.3,
  nearWalk: 3.6,
  chamferA: [1.87, -1.3],
  chamferB: [-3.1, 1.99],
};

// Hoppers kamera
export const HERO = {
  pos: [0.682, 1.65, 10.831],
  fwd: [0.2521, -0.9677], // (x, z)
  pitch: 1.653 * DEG, // nedåt
  focalPx: 2200,
  imgW: 2000,
  imgH: 1091,
};
