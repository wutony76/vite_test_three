export const eyeVertex = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const eyeFragment = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uMask;

varying vec2 vUv;

void main() {
  vec4 col = texture2D(uMap, vUv);
  vec4 maskTex = texture2D(uMask, vUv);
  float mask = max(maskTex.r, maskTex.a);
  float a = col.a * mask;
  if (a < 0.02) discard;
  gl_FragColor = vec4(col.rgb, a);
}
`