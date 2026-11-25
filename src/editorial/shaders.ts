export const eyeVertex = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/**
 * 眼睛層：mesh 本身固定蓋在眼眶上，只「位移虹膜貼圖的取樣座標」。
 * - uMask 用原本的 vUv 取樣 → 眼眶開口固定不動
 * - uMap 用 vUv - uOffset 取樣 → 虹膜在開口裡移動，超出開口的部分被眼皮裁掉
 * 若改成移動整個 mesh（舊做法）→ 遮罩跟著跑，看起來是整塊眼睛貼紙在滑。
 */
export const eyeFragment = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uMask;
uniform vec2 uOffset;

varying vec2 vUv;

void main() {
  vec2 irisUv = vUv - uOffset;
  vec4 col = texture2D(uMap, irisUv);
  // 取樣超出貼圖範圍就當透明，避免 ClampToEdge 拉出邊緣像素
  float inside = step(0.0, irisUv.x) * step(irisUv.x, 1.0) * step(0.0, irisUv.y) * step(irisUv.y, 1.0);
  float mask = texture2D(uMask, vUv).r;
  float a = col.a * mask * inside;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col.rgb, a);
  // ShaderMaterial 不會自動做 tone mapping / 色彩空間轉換（MeshBasicMaterial 會）。
  // 少了這兩行 → 虹膜輸出的是線性色值，會比底圖暗很多，看起來像兩顆黑洞。
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
