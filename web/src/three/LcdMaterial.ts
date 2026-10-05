import { Color, ShaderMaterial, Vector2, type Texture } from 'three'

/** BMO's emissive LCD: plain mint screen, or a texture (games / video). */
export function createLcdMaterial() {
  return new ShaderMaterial({
    toneMapped: false,
    uniforms: {
      uStrength: { value: 1 },
      uBase: { value: new Color('#C4F7CF') },
      // screen content: 0 = BMO's face grid, 1 = texture (games / uploaded video), 2 = dark,
      // 3 = see-through hole: the YouTube player sits behind the canvas and shows through the screen
      uMode: { value: 0 },
      uMap: { value: null as Texture | null },
      uFit: { value: new Vector2(1, 1) }, // letterbox scale
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uStrength;
      uniform vec3 uBase;
      uniform float uMode;
      uniform sampler2D uMap;
      uniform vec2 uFit;
      varying vec2 vUv;
      void main() {
        if (uMode > 2.5) {
          gl_FragColor = vec4(0.0); // opaque material => blending off => writes a transparent hole
          return;
        }
        vec3 col = uBase; // plain screen (no grid)
        if (uMode > 1.5) {
          col = vec3(0.012, 0.02, 0.016);
        } else if (uMode > 0.5) {
          vec2 uv = (vUv - 0.5) / uFit + 0.5;
          bool inside = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
          col = inside ? texture2D(uMap, uv).rgb : vec3(0.0);
        }
        float vignette = 1.0 - 0.18 * length(vUv - 0.5);
        gl_FragColor = vec4(col * uStrength * vignette, 1.0);
        #include <colorspace_fragment>
      }`,
  })
}
