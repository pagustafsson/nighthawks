import * as THREE from 'three';

const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);

/** Osynlig skuggkastare – en "flagga" som formar ljuset som på en filminspelning. */
export function blockerMaterial() {
  return new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
}

/**
 * Glas ritas i två pass:
 *  1. en multiplicerande ton (det som syns genom glaset färgas svagt grönt)
 *  2. en additiv reflex med Fresnel – speglar en infångad kubkarta av omgivningen
 *     och får en ljus kant i flacka vinklar, som glasets tjocklek.
 */
export function glassTint(color) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.SrcColorFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
}

export function glassReflect(env, { strength = 1, rim = 0x0, rimPow = 3.0, f0 = 0.05 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      envMap: { value: env },
      uStrength: { value: strength },
      uRim: { value: new THREE.Color(rim) },
      uRimPow: { value: rimPow },
      uF0: { value: f0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform samplerCube envMap;
      uniform float uStrength;
      uniform vec3 uRim;
      uniform float uRimPow;
      uniform float uF0;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float fres = uF0 + (1.0 - uF0) * pow(1.0 - ndv, 5.0);
        vec3 R = reflect(-V, N);
        vec3 env = textureCube(envMap, R).rgb;
        // dämpa de allra starkaste speglingarna så att lysrören inte bränner ut
        env = env / (1.0 + 0.25 * env);
        vec3 col = env * fres * uStrength + uRim * pow(1.0 - ndv, uRimPow);
        gl_FragColor = vec4(col, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

export function buildMaterials(T) {
  const M = {};

  // ----- mark -----
  M.asphalt = std({ map: T.asphalt.map, bumpMap: T.asphalt.bump, bumpScale: 0.6, color: 0xc2d8cc, roughness: 0.86 });
  M.sidewalk = std({ map: T.concrete.map, bumpMap: T.concrete.bump, bumpScale: 0.35, color: 0xc4eccc, roughness: 0.82 });
  M.sidewalkFar = std({ map: T.pavers.map, color: 0xc9dcc9, roughness: 0.85 });
  M.curb = std({ map: T.concrete.map, color: 0xb9c9bd, roughness: 0.75 });
  M.slab = std({ color: 0x15191c, roughness: 0.9 });
  M.slabLip = std({ color: 0x2a3033, roughness: 0.8 });
  M.cut = std({ color: 0x191d21, roughness: 0.85 });
  M.iron = std({ color: 0x2b302f, roughness: 0.55, metalness: 0.8 });

  // ----- tegel och sten -----
  M.brickRed = std({ map: T.brickRed.map, bumpMap: T.brickRed.bump, bumpScale: 0.5, roughness: 0.9 });
  M.brickBrown = std({ map: T.brickBrown.map, bumpMap: T.brickBrown.bump, bumpScale: 0.5, roughness: 0.9 });
  M.brickDark = std({ map: T.brickDark.map, bumpMap: T.brickDark.bump, bumpScale: 0.5, roughness: 0.9 });
  M.stone = std({ map: T.concrete.map, color: 0x8f8a84, roughness: 0.8 });
  M.stoneDark = std({ map: T.concrete.map, color: 0x5d5a58, roughness: 0.8 });
  M.tar = std({ map: T.asphalt.map, color: 0x66706f, roughness: 0.95 });

  // ----- butiksfasader (målat trä) -----
  M.shopGreen = std({ color: 0x17382d, roughness: 0.5 });
  M.shopGreenLt = std({ color: 0x22503f, roughness: 0.5 });
  M.shopOlive = std({ color: 0x1e2e24, roughness: 0.55 });
  M.shopNavy = std({ color: 0x14303c, roughness: 0.45 });
  M.shopShade = std({ color: 0x1b3d4d, roughness: 0.9 });
  M.shopBlack = std({ color: 0x0b1113, roughness: 0.4 });
  M.shopDisplay = std({ color: 0xb4532a, roughness: 0.7 });
  M.shopWall = std({ map: T.plaster.map, color: 0x34443e, roughness: 0.9 });
  M.shopFloor = std({ color: 0x4a3a2c, roughness: 0.7 });
  M.shopDark = std({ color: 0x06090a, roughness: 0.9 });
  M.paper = std({ color: 0xcfd3b4, roughness: 0.9 });

  // ----- fönster i tegelhusen -----
  M.sash = std({ color: 0x18221f, roughness: 0.6 });
  M.room = std({ color: 0x05070b, roughness: 0.4 });
  M.blind = std({ color: 0x2a6b54, roughness: 0.85 });
  M.blindPale = std({ color: 0x6f9a7c, roughness: 0.85 });

  // ----- Phillies, utsida -----
  M.dinerBase = std({ color: 0x24322f, roughness: 0.32 });
  M.dinerPanel = std({ map: T.panels.map, bumpMap: T.panels.bump, bumpScale: 1.4, color: 0x2b3b38, roughness: 0.3 });
  M.sillRim = std({ color: 0x566033, roughness: 0.5 });
  M.sillJade = std({ color: 0x129a60, roughness: 0.42 });
  M.fascia = std({ color: 0x3a686e, roughness: 0.36 });
  M.fasciaDark = std({ color: 0x15292b, roughness: 0.5 });
  M.brass = std({ color: 0xa8842f, roughness: 0.38, metalness: 1 });
  M.postMint = std({ color: 0x4a957c, roughness: 0.45 });
  M.postDark = std({ color: 0x4a5656, roughness: 0.36, metalness: 1 });
  M.alu = std({ color: 0xbfc6c6, roughness: 0.3, metalness: 1 });
  M.aluDull = std({ color: 0x9aa3a3, roughness: 0.48, metalness: 1 });
  M.signBoard = std({ map: T.sign.map, roughness: 0.75, emissive: 0xffffff, emissiveMap: T.sign.map, emissiveIntensity: 0.09 });
  M.signBack = std({ map: T.walnut.map, color: 0x4a3626, roughness: 0.85 });

  // ----- Phillies, insida -----
  // Väggarna får lite egenljus: det motsvarar ljuset som studsar runt i rummet
  // och ger Hoppers jämna, platta gula ytor.
  M.wall = std({ map: T.plaster.map, color: 0xf2e99c, roughness: 0.92, emissive: 0xefe392, emissiveIntensity: 0.74 });
  M.wallShade = std({ map: T.plaster.map, color: 0xd9cf80, roughness: 0.92, emissive: 0xe9d977, emissiveIntensity: 0.2 });
  M.wallInner = std({ map: T.plaster.map, color: 0xeee69c, roughness: 0.92, emissive: 0xefe392, emissiveIntensity: 0.86, side: THREE.DoubleSide });
  M.ceiling = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.3, 2.3, 1.95) });
  M.floor = std({ map: T.plaster.map, color: 0xc9992b, roughness: 0.55 });
  M.cherry = phys({ map: T.cherry.map, color: 0xc7a49c, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  M.cherryTop = phys({ map: T.cherry.map, color: 0xd9b9b0, roughness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.3 });
  M.seat = std({ color: 0x8d4c1c, roughness: 0.5 });
  M.chrome = std({ color: 0xe9eded, roughness: 0.07, metalness: 1 });
  M.steel = std({ color: 0xa2aaaa, roughness: 0.36, metalness: 1 });
  M.door = std({ map: T.plaster.map, color: 0xd07d1c, roughness: 0.6, emissive: 0xc06a10, emissiveIntensity: 0.18 });
  M.ceramic = std({ color: 0xf3f1e6, roughness: 0.22 });
  M.gaugeGlass = std({ color: 0x1f8f76, roughness: 0.2, emissive: 0x0a4a3c, emissiveIntensity: 0.5 });
  M.ketchup = std({ color: 0xc8501c, roughness: 0.4 });
  M.smallGlass = phys({ color: 0xd8efe6, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.35 });

  // ----- figurer -----
  M.skin = std({ color: 0xe2b08a, roughness: 0.6 });
  M.skinPale = std({ color: 0xecc6a6, roughness: 0.6 });
  M.suitNavy = std({ color: 0x25355e, roughness: 0.85 });
  M.suitGrey = std({ color: 0x47596a, roughness: 0.85 });
  M.shirtBlue = std({ color: 0x5f93c0, roughness: 0.8 });
  M.hatGrey = std({ color: 0x6d7574, roughness: 0.8 });
  M.hatBlue = std({ color: 0x74868f, roughness: 0.8 });
  M.hatBand = std({ color: 0x15181c, roughness: 0.7 });
  M.dressRed = std({ color: 0xc23428, roughness: 0.6 });
  M.hairRed = std({ color: 0xa63e18, roughness: 0.55 });
  M.hairBlond = std({ color: 0xc99655, roughness: 0.6 });
  M.hairDark = std({ color: 0x2a221c, roughness: 0.6 });
  M.white = std({ color: 0xf2f2ea, roughness: 0.75 });
  M.lips = std({ color: 0xa81f1c, roughness: 0.4 });
  M.shoe = std({ color: 0x121212, roughness: 0.4 });

  // Trottoarerna hör hit: annars skuggar bara plattans baksidor, och skuggan
  // från kantstenen börjar då först några centimeter ut från dess fot – en
  // ljus strimma längs rännstenen.
  for (const k of ['dinerBase', 'dinerPanel', 'sillRim', 'sillJade', 'fascia', 'fasciaDark', 'brass', 'tar', 'curb', 'sidewalk', 'sidewalkFar']) {
    M[k].shadowSide = THREE.DoubleSide;
  }
  return M;
}
