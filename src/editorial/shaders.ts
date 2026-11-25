import { FIRE } from './fireTheme'

/** 底圖與眼睛層共用 */
export const portraitVertex = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/**
 * 底圖：貼圖 → 6% 暖暗調色，加上發動時的人像效果（全部由 uniform 控制強度，0 時跟原圖一樣）：
 * - 壞笑（uSmirk）：嘴角不對稱上揚
 * - 眉毛下壓（uPower）：眉頭往下壓、眉尾上挑
 * - 眼周紋路（uPower）：從眼睛外圍往外爬的黑紫血管紋
 * - 戲劇化打光（uPower）：整體壓暗＋暗角＋偏紫，人物輪廓內緣打一圈紫色輪廓光
 * - 頭髮染紫＋飄動（uPower）：頭髮區域隨流動雜訊晃動，依原本明暗重新上紫色，再加往上流的光澤
 * （查克拉氣場在另一張比照片大的平面上畫：auraFragment，火焰才能竄出照片方框）
 */
export const baseFragment = /* glsl */ `
uniform sampler2D uMap;
/** 人物輪廓遮罩：R = 人物、G = 大範圍模糊（離人物多近）、B = 小範圍模糊（輪廓附近）、A = 頭髮；四周多留 uMaskPad px */
uniform sampler2D uSil;
uniform float uMaskPad;
/** 壞笑程度 0..1（發射雷射時上揚） */
uniform float uSmirk;
/** 發動強度 0..1（蓄力時上升、發射中維持、放開後退去）：眉毛、紋路、打光、氣場共用 */
uniform float uPower;
uniform float uTime;
/** 照片尺寸、嘴角、眼睛中心、眉頭／眉尾（原圖像素，y 向下） */
uniform vec2 uTexSize;
uniform vec2 uCornerL;
uniform vec2 uCornerR;
uniform vec2 uEyeL;
uniform vec2 uEyeR;
uniform vec2 uBrowInL;
uniform vec2 uBrowInR;
uniform vec2 uBrowOutL;
uniform vec2 uBrowOutR;
varying vec2 vUv;

/**
 * 局部位移：以某一點為中心的橢圓高斯（半徑 radius px），離中心越遠影響越小，
 * 所以只有那一小塊在動，周圍不會被拉歪。
 */
vec2 pointShift(vec2 px, vec2 at, vec2 radius, vec2 move) {
  vec2 d = (px - at) / radius;
  return move * exp(-dot(d, d) * 1.6);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

/**
 * 眼周血管紋：以眼睛為中心的極座標，沿角度切成 9 條放射線，再用雜訊讓線條彎曲。
 * 起點在眼眶外（避開眼球），長度 = 發動強度 × 75px，越往外越細。回傳 0..1（1 = 線條上）。
 */
float veins(vec2 px, vec2 eye, float power) {
  vec2 d = px - eye;
  d.y *= 1.7; // 眼睛是橫的：垂直方向壓扁，起始圈才會是貼著眼眶的橢圓
  float r = length(d);
  float start = 46.0;
  float reach = start + power * 75.0;
  if (r < start || r > reach) return 0.0;
  float a = atan(d.y, d.x);
  float w = a * 9.0 / 6.28318 + (vnoise(vec2(r * 0.05, a * 3.0)) - 0.5) * 1.4;
  float distPx = abs(fract(w) - 0.5) * 6.28318 * r / 9.0;
  float t = (r - start) / max(reach - start, 1.0);
  float thick = mix(2.4, 0.5, t);
  // 每條線長度不一：用角度雜訊讓有些線短一點
  float len = 0.55 + 0.45 * hash(vec2(floor(w), 7.0));
  float alive = 1.0 - smoothstep(len - 0.1, len, t);
  return (1.0 - smoothstep(thick, thick + 1.0, distPx)) * alive * smoothstep(start, start + 6.0, r);
}

/** 照片像素 → 遮罩 UV（遮罩比照片大一圈，y 要翻回貼圖的向上座標） */
vec2 maskUv(vec2 px) {
  vec2 mp = (px + uMaskPad) / (uTexSize + 2.0 * uMaskPad);
  return vec2(mp.x, 1.0 - mp.y);
}

void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uTexSize;

  // 壞笑：不對稱地拉嘴角——右嘴角往上 10px、往外 3px，左嘴角只往上 3px。
  // 兩邊一樣高會變成「開心的笑」，一高一低才是不懷好意的笑。
  vec2 shift = pointShift(px, uCornerR, vec2(26.0, 16.0), vec2(3.0, -10.0)) * uSmirk
             + pointShift(px, uCornerL, vec2(26.0, 16.0), vec2(-1.0, -3.0)) * uSmirk;
  // 眉毛下壓：眉頭往下 7px、稍微往中間靠；眉尾往上 3px → 「狠」的表情
  shift += (pointShift(px, uBrowInL, vec2(30.0, 18.0), vec2(2.0, 7.0))
          + pointShift(px, uBrowInR, vec2(30.0, 18.0), vec2(-2.0, 7.0))
          + pointShift(px, uBrowOutL, vec2(34.0, 18.0), vec2(0.0, -3.0))
          + pointShift(px, uBrowOutR, vec2(34.0, 18.0), vec2(0.0, -3.0))) * uPower;
  // 頭髮飄動：頭髮區域用兩組緩慢流動的雜訊推動取樣位置（左右 ±5px、上下 ±3px），
  // 頭髮邊緣也會跟著擺動，看起來像被氣流吹動
  float hairHere = uPower > 0.001 ? texture2D(uSil, maskUv(px)).a : 0.0;
  if (hairHere > 0.01) {
    vec2 flow = vec2(vnoise(px * 0.03 + vec2(0.0, uTime * 1.6)), vnoise(px * 0.03 + vec2(7.3, uTime * 1.3))) - 0.5;
    shift += flow * 2.0 * vec2(5.0, 3.0) * hairHere * uPower;
  }
  // 「反向取樣」：這個像素顯示原本在 px − 位移 的內容 → 內容被推到新位置
  vec2 src = px - shift;
  vec3 col = texture2D(uMap, vec2(src.x / uTexSize.x, 1.0 - src.y / uTexSize.y)).rgb;

  // 右嘴角外上方一道很淡的笑紋陰影，讓「勾起來」更明顯
  vec2 crease = (px - (uCornerR + vec2(6.0, -10.0))) / vec2(4.0, 8.0);
  col *= 1.0 - 0.22 * uSmirk * exp(-dot(crease, crease));
  col = mix(col, vec3(0.0102, 0.0080, 0.0063), 0.06);

  if (uPower > 0.001) {
    // 眼周血管紋
    float v = max(veins(px, uEyeL, uPower), veins(px, uEyeR, uPower));
    col = mix(col, ${FIRE.veins}, v * 0.85);

    vec3 sil = texture2D(uSil, maskUv(px)).rgb;
    // 戲劇化打光：整體壓暗、偏紫、加暗角（以臉為中心）
    vec2 c = (px - vec2(uTexSize.x * 0.5, uTexSize.y * 0.42)) / uTexSize.y;
    float vignette = 1.0 - smoothstep(0.12, 0.5, length(c));
    // 注意 col 是線性值：乘 0.6 看起來只暗一點點，要壓到 0.1～0.6 才有「氣氛轉暗」的感覺
    float dim = mix(1.0, 0.12 + 0.5 * vignette, uPower);
    col *= dim;
    col = mix(col, col * vec3(0.8, 0.66, 1.08), uPower * 0.75);
    // 頭髮染紫：用「取樣到的那根頭髮」的遮罩值（跟著飄動一起移動），依原本明暗對應深紫→淺紫，
    // 保留髮絲紋理；再加一道道斜斜往上流的光澤（用雜訊扭曲，不會是死板的直條紋）
    float hair = texture2D(uSil, maskUv(src)).a;
    if (hair > 0.01) {
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 dye = mix(${FIRE.hairDark}, ${FIRE.hairLight}, smoothstep(0.0, 0.12, lum));
      float band = sin(px.y * 0.07 + px.x * 0.025 + uTime * 5.0 + vnoise(px * 0.02) * 4.0);
      // 只取 sin 最高的一小段（0.88 以上）當光澤 → 細細的反光，不會變成粗條紋；亮度也只疊 0.35
      dye += ${FIRE.hairSheen} * smoothstep(0.88, 1.0, band) * 0.35 * smoothstep(0.02, 0.1, lum + 0.03);
      col = mix(col, dye, hair * uPower);
    }

    // 輪廓光：只在人物內緣那一圈（小範圍模糊遮罩在 0.5～0.9 之間的地方）
    float rim = smoothstep(0.5, 0.62, sil.b) * (1.0 - smoothstep(0.62, 0.92, sil.b)) * sil.r;
    col += ${FIRE.rimLight} * rim * uPower * 1.3;
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/**
 * 查克拉氣場：畫在一張「照片＋四周各 uMaskPad px」的平面上（比照片大），疊在照片之上、眼睛之下。
 * 火焰只出現在人物外面（遮罩 R < 0.5），所以照片內的背景區與照片外的一圈都會燒起來，
 * 不再被照片的方框裁掉。其他地方 discard（透明）。
 */
export const auraFragment = /* glsl */ `
uniform sampler2D uSil;
uniform float uPower;
uniform float uTime;
/** 遮罩（＝這張平面）的像素尺寸 */
uniform vec2 uMaskSize;
/** 遮罩四周多留的邊（px）與照片尺寸：用來判斷「在照片框外」 */
uniform float uMaskPad;
uniform vec2 uTexSize;
/** 照片框外、這個高度（原圖 y）以下不畫火：肩膀在框外是延伸出去的隱形形狀，描它的火會很怪 */
uniform float uOutsideCutY;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  if (uPower < 0.001) discard;
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uMaskSize;
  if (texture2D(uSil, vUv).r >= 0.5) discard;
  vec2 srcPx = px - uMaskPad;
  bool outside = srcPx.x < 0.0 || srcPx.x > uTexSize.x || srcPx.y < 0.0 || srcPx.y > uTexSize.y;
  if (outside && srcPx.y > uOutsideCutY) discard;

  // 人物外圍 10px 一格的方塊，雜訊往上捲動 → 一格格竄起的火焰
  const float CELL = 10.0;
  vec2 cell = floor(px / CELL);
  // 取「下方 16px」的遠近值：火焰會偏向輪廓上方延伸，看起來是往上燒
  vec2 cellPx = (cell + 0.5) * CELL + vec2(0.0, 16.0);
  vec2 cellUv = cellPx / uMaskSize;
  // 上限 0.5（= 輪廓上的值）：往下取樣可能落進人物內部（例如肩膀上方），那裡是 1，
  // 不鎖的話那一帶永遠滿格熱度 → 變成實心紫帶，放開後也退不掉
  float near = min(texture2D(uSil, vec2(cellUv.x, 1.0 - cellUv.y)).g, 0.5);
  // 雜訊在垂直方向拉長（y 係數小）→ 一條條直立的火舌，而不是一顆顆圓斑
  float flick = vnoise(vec2(cell.x * 0.55, cell.y * 0.16 + uTime * 3.5));
  // near 是高斯模糊（σ 45）後的值：輪廓上 0.5、外推 40px 約 0.19、60px 約 0.09、80px 約 0.04。
  // reach = near × 5 再加上雜訊（± 0.8）：雜訊的份量要夠大，火舌才會一長一短參差不齊
  float reach = near * 5.0 + (flick - 0.5) * 1.6;
  // 發動強度不足時把門檻拉高：強度一降，火焰就從外往內縮回去（放開後不會殘留）
  float threshold = 0.7 + (1.0 - uPower) * 3.0;
  if (reach <= threshold) discard;
  // 三段硬邊色階（卡通）：貼近人物亮紫 → 中段深紫 → 火舌尖端黑
  vec3 mid = mix(${FIRE.auraOuter}, ${FIRE.auraInner}, 0.35);
  vec3 col = reach > threshold + 0.9 ? ${FIRE.auraInner} : reach > threshold + 0.35 ? mid : ${FIRE.auraOuter};
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
    // 虹膜漸層（fireTheme.ts：紅或紫）：中間亮、往外變暗，看起來有立體感（線性色值，之後交給 tone mapping）
    vec3 red = mix(${FIRE.sharinganInner}, ${FIRE.sharinganOuter}, smoothstep(0.25, 0.9, r));
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
