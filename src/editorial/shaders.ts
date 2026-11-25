/** 底圖與眼睛層共用 */
export const portraitVertex = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/**
 * 底圖：貼圖 → 6% 暖暗調色。
 * 調色原本是另一張疊在上面的半透明平面（還用錯混合模式每幀報錯），直接在這裡混色比較單純。
 */
export const baseFragment = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;

void main() {
  vec3 col = texture2D(uMap, vUv).rgb;
  col = mix(col, vec3(0.0102, 0.0080, 0.0063), 0.06);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/**
 * 眼睛層：mesh 本身固定蓋在眼眶上，只「位移虹膜貼圖的取樣座標」。
 * - uMask 用原本的 vUv 取樣 → 眼眶開口固定不動
 * - uMap 用 vUv - uOffset 取樣 → 虹膜在開口裡移動，超出開口的部分被眼皮裁掉
 * 若改成移動整個 mesh（舊做法）→ 遮罩跟著跑，看起來是整塊眼睛貼紙在滑。
 *
 * uCharge：噴火前的蓄力（0..1），虹膜越暗的地方發越強的紅光（瞳孔最亮，像從深處燒起來）。
 */
export const eyeFragment = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uMask;
uniform vec2 uOffset;
uniform float uCharge;
/** 虹膜中心在貼圖上的 UV、貼圖像素尺寸：用來算「離瞳孔幾個像素」 */
uniform vec2 uIrisUv;
uniform vec2 uRectPx;
uniform float uTime;

varying vec2 vUv;

void main() {
  vec2 irisUv = vUv - uOffset;
  vec4 col = texture2D(uMap, irisUv);
  // 取樣超出貼圖範圍就當透明，避免 ClampToEdge 拉出邊緣像素
  float inside = step(0.0, irisUv.x) * step(irisUv.x, 1.0) * step(0.0, irisUv.y) * step(irisUv.y, 1.0);
  float mask = texture2D(uMask, vUv).r;

  float flick = 0.85 + 0.15 * sin(uTime * 23.0) * sin(uTime * 7.0);
  // 以瞳孔為中心的放射狀光暈（中心最亮、往虹膜外圈漸弱），虹膜本身只染紅、保留紋理。
  // 曾經用「越暗越亮」的亮度門檻判斷瞳孔 → 虹膜紋理深淺不一，切出一塊塊斑駁的色塊。
  float core = 1.0 - smoothstep(0.0, 17.0, length((irisUv - uIrisUv) * uRectPx));
  col.rgb = mix(col.rgb, col.rgb * vec3(2.2, 0.45, 0.3), uCharge * 0.7);
  col.rgb += vec3(1.0, 0.1, 0.02) * uCharge * flick * core * 0.55;

  float a = col.a * mask * inside;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col.rgb, a);
  // ShaderMaterial 不會自動做 tone mapping / 色彩空間轉換（MeshBasicMaterial 會）。
  // 少了這兩行 → 虹膜輸出的是線性色值，會比底圖暗很多，看起來像兩顆黑洞。
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
