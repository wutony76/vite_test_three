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
/** 壞笑程度 0..1（發射雷射時上揚） */
uniform float uSmirk;
/** 照片尺寸與左右嘴角位置（原圖像素，y 向下） */
uniform vec2 uTexSize;
uniform vec2 uCornerL;
uniform vec2 uCornerR;
varying vec2 vUv;

/**
 * 嘴角附近的位移量：以嘴角為中心的橢圓高斯（左右 26px、上下 16px），離嘴角越遠影響越小，
 * 所以只有嘴角在動，嘴唇中間和臉頰不會被拉歪。
 */
vec2 cornerShift(vec2 px, vec2 corner, vec2 move) {
  vec2 d = (px - corner) / vec2(26.0, 16.0);
  return move * exp(-dot(d, d) * 1.6);
}

void main() {
  // 壞笑：不對稱地拉嘴角——右嘴角往上 10px、往外 3px，左嘴角只往上 3px。
  // 兩邊一樣高會變成「開心的笑」，一高一低才是不懷好意的笑。
  // 做法是「反向取樣」：這個像素要顯示的，是原本在 px − 位移 那裡的內容 → 內容就被推到新位置
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uTexSize;
  vec2 shift = cornerShift(px, uCornerR, vec2(3.0, -10.0)) + cornerShift(px, uCornerL, vec2(-1.0, -3.0));
  vec2 src = px - shift * uSmirk;
  vec3 col = texture2D(uMap, vec2(src.x / uTexSize.x, 1.0 - src.y / uTexSize.y)).rgb;

  // 右嘴角外上方一道很淡的笑紋陰影，讓「勾起來」更明顯
  vec2 crease = (px - (uCornerR + vec2(6.0, -10.0))) / vec2(4.0, 8.0);
  col *= 1.0 - 0.22 * uSmirk * exp(-dot(crease, crease));

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
/** 勾玉目前轉到的角度（弧度）：由 CPU 累加，蓄力越滿轉越快，轉速改變時才不會跳格 */
uniform float uSpin;
/** 寫輪眼圖案半徑（貼圖像素），略小於虹膜半徑，外圈留一點原本的虹膜邊 */
uniform float uIrisR;

varying vec2 vUv;

/**
 * 寫輪眼圖案（全部用距離函式算，不需要貼圖）。q：以虹膜中心為原點、以半徑為 1 的座標。
 * 回傳 ink：0 = 紅色虹膜、1 = 黑色墨線（瞳孔、外環、勾玉軌道、三個勾玉）。
 */
float sharinganInk(vec2 q, float spin) {
  float r = length(q);
  float a = atan(q.y, q.x);
  float ink = 0.0;
  ink = max(ink, 1.0 - smoothstep(0.2, 0.24, r));               // 瞳孔
  ink = max(ink, smoothstep(0.86, 0.92, r));                     // 外環
  ink = max(ink, 1.0 - smoothstep(0.012, 0.032, abs(r - 0.55))); // 勾玉繞行的細環

  // 三個勾玉：頭是圓點，尾巴沿著圓環往「旋轉的反方向」拖出去，越後面越細、略往外彎
  for (int k = 0; k < 3; k++) {
    float ang = spin + float(k) * 2.0944;
    vec2 head = vec2(cos(ang), sin(ang)) * 0.55;
    ink = max(ink, 1.0 - smoothstep(0.12, 0.15, length(q - head)));
    float behind = mod(ang - a + 6.28318, 6.28318); // 這個像素落在頭後面幾弧度
    float t = behind / 0.95;                         // 0 = 頭、1 = 尾巴尖端
    if (t < 1.0) {
      float halfW = 0.12 * (1.0 - t);
      float along = 0.55 + 0.1 * t;
      ink = max(ink, 1.0 - smoothstep(halfW - 0.02, halfW + 0.01, abs(r - along)));
    }
  }
  return ink;
}

void main() {
  vec2 irisUv = vUv - uOffset;
  vec4 col = texture2D(uMap, irisUv);
  // 取樣超出貼圖範圍就當透明，避免 ClampToEdge 拉出邊緣像素
  float inside = step(0.0, irisUv.x) * step(irisUv.x, 1.0) * step(0.0, irisUv.y) * step(irisUv.y, 1.0);
  float mask = texture2D(uMask, vUv).r;

  // 寫輪眼：蓄力（uCharge 0 → 1）時虹膜漸漸變成 紅底＋黑色勾玉，發射中維持。
  // 座標用 irisUv（已經扣掉視線位移）→ 圖案跟著虹膜一起轉向。
  if (uCharge > 0.001) {
    vec2 q = (irisUv - uIrisUv) * uRectPx / uIrisR;
    float r = length(q);
    float ink = sharinganInk(q, uSpin);
    // 紅色虹膜：中間亮、往外變暗，看起來有立體感（線性色值，之後交給 tone mapping）
    vec3 red = mix(vec3(0.75, 0.02, 0.02), vec3(0.28, 0.0, 0.0), smoothstep(0.25, 0.9, r));
    vec3 sharingan = mix(red, vec3(0.012, 0.004, 0.004), ink);
    // 保留原本眼睛的反光，才不會像一張平貼上去的圖
    float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    sharingan = max(sharingan, col.rgb * smoothstep(0.35, 0.7, lum));
    // 圖案只畫在虹膜範圍內，外面一圈淡回原本的虹膜邊
    float inIris = 1.0 - smoothstep(0.95, 1.08, r);
    col.rgb = mix(col.rgb, sharingan, uCharge * inIris);
  }

  float a = col.a * mask * inside;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col.rgb, a);
  // ShaderMaterial 不會自動做 tone mapping / 色彩空間轉換（MeshBasicMaterial 會）。
  // 少了這兩行 → 虹膜輸出的是線性色值，會比底圖暗很多，看起來像兩顆黑洞。
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
