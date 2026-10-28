
varying vec2 vUv;

// 由 JavaScript 每幀傳入，單位是秒
uniform float uTime;

// 色碼 → vec3（0 ~ 1）
// 用法：hexToRgb(0xeb145f)，把 CSS 的 # 換成 0x 就好
// 原理：色碼是一個整數，紅、綠、藍各佔 8 位元（0xRRGGBB）
//   >> 16 往右移 16 位元 → 留下 RR
//   >> 8  往右移 8 位元  → 留下 RRGG，再 & 0xFF 只取最後 8 位元 → GG
//   & 0xFF 直接取最後 8 位元 → BB
// 每個通道是 0 ~ 255，除以 255 變成 shader 用的 0 ~ 1
vec3 hexToRgb(int hex) {
  return vec3(
    float((hex >> 16) & 0xFF),
    float((hex >> 8) & 0xFF),
    float(hex & 0xFF)
  ) / 255.0;
}

 float hash(vec2 p) {
    return fract(
      sin(dot(p, vec2(127.1, 311.7))) * 43758.5453
    );
  }

  // 產生平滑噪聲
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(
      mix(a, b, f.x),
      mix(c, d, f.x),
      f.y
    );
  }


void main() {
  vec3 topColor = hexToRgb(0x65e4e6);
  vec3 middleColor = hexToRgb(0xca0065);
  vec3 bottomColor = hexToRgb(0x5c096d);

  vec3 color;

  // 產生不規則數值（0 ~ 1）
  // 加上 uTime 讓取樣位置跟著時間移動，噪聲才會流動
  float n = noise(vUv * 5.0 + vec2(uTime * 0.15, uTime * 0.05));

  // 用噪聲「推動漸層的位置」，而不是直接加減顏色：
  // ❌ color += (n - 0.5) * 0.35 → 紅綠藍同時加減同一個數，等於疊一層灰 → 會變白、變黑
  // ✅ 把 y 往上或往下推一點，再去三個顏色之間取色 → 結果只會是三個顏色的混合，不會出現白或黑
  // 0.3 = 推動的幅度，越大雲霧越明顯
  float y = clamp(vUv.y + (n - 0.5) * 0.3, 0.0, 1.0);
  float split = 0.31;

  if (y > split) {
    float t = (y - split) / (1.0 - split);
    // t = smoothstep(0.0, 0.6, t);
    color = mix(middleColor, topColor, t);
  } else {
    float t = y / split;
    color = mix(bottomColor, middleColor, t);
  }

  // 用噪聲擾動原本的漸層
  // float t = vUv.y + (n - 0.5) * 0.5;
  // 混合兩種顏色
  // color = mix(topColor, middleColor, smoothstep(0.2, 0.8, t));

  gl_FragColor = vec4(color, 1.0);
}
