import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Sista passet: svag vinjett, en aning korn och en kall ton i skuggorna –
// målningens mörker är grönblått, aldrig svart.
const Grade = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.018 },
    uVignette: { value: 0.32 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      float sh = 1.0 - smoothstep(0.0, 0.3, l);
      c += vec3(-0.004, 0.007, 0.009) * sh;
      c = mix(vec3(l), c, 1.06);
      vec2 q = (vUv - 0.5) * vec2(1.0, 0.92);
      float v = smoothstep(0.92, 0.28, length(q));
      c *= mix(1.0, v, uVignette);
      float n = hash(vUv * uRes + fract(uTime) * 91.7) - 0.5;
      c += n * uGrain * (0.6 + 0.8 * (1.0 - l));
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function buildPost(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.1, 0.6, 1.35);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(Grade);
  composer.addPass(grade);
  return { composer, bloom, grade };
}
