// 粒子的 Shader：每顆粒子的變形、波浪、滑鼠推開、漣漪、大小、顏色，全部在 GPU 上算
// CPU 每幀只需要更新幾個 uniform（時間、變形進度、滑鼠位置…），所以幾萬顆粒子也很順

export const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uMorph;         // 0 = 球體、1 = 環面結、2 = 波浪、3 = 文字（中間值 = 變形中）
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec3 uMouse;          // 滑鼠在 3D 空間的位置（z = 0 平面）
  uniform float uMouseStrength; // 0 ~ 1：滑鼠最近有移動才推開粒子
  uniform vec3 uRippleOrigin;   // 點擊位置
  uniform float uRippleTime;    // 點擊時的 uTime

  // position 屬性 = 球體；其他三個形狀放在自訂屬性
  attribute vec3 aKnot;
  attribute vec3 aWave;
  attribute vec3 aText;
  attribute float aRandom;      // 每顆粒子固定的亂數 0 ~ 1

  varying float vRandom;
  varying float vGlow;

  // 第 k 段變形的進度（0 ~ 1）
  // 減掉 aRandom × 0.35：每顆粒子出發時間不同 → 變形時像一陣風吹過，而不是整齊瞬移
  float stage(float k) {
    return smoothstep(0.0, 1.0, clamp((uMorph - k) * 1.35 - aRandom * 0.35, 0.0, 1.0));
  }

  void main() {
    // 波浪：平面上的點加上兩組 sin / cos 起伏，隨時間流動
    vec3 wave = aWave;
    wave.y += sin(wave.x * 1.3 + uTime * 1.1) * 0.28 + cos(wave.z * 1.6 + uTime * 0.9) * 0.22;

    // 依序混合：球體 → 環面結 → 波浪 → 文字
    vec3 p = mix(position, aKnot, stage(0.0));
    p = mix(p, wave, stage(1.0));
    p = mix(p, aText, stage(2.0));

    // 待機時微微漂浮
    float seed = aRandom * 40.0;
    p += vec3(sin(uTime * 0.7 + seed), cos(uTime * 0.6 + seed * 1.3), sin(uTime * 0.5 + seed * 0.7)) * 0.025;

    // 轉到世界座標，滑鼠和漣漪才能用同一個座標系計算
    vec4 world = modelMatrix * vec4(p, 1.0);

    // 滑鼠推開：距離越近推越遠，1.3 單位外不受影響
    vec3 away = world.xyz - uMouse;
    float push = (1.0 - smoothstep(0.0, 1.3, length(away))) * uMouseStrength;
    world.xyz += normalize(away + 0.0001) * push * 0.7;

    // 點擊漣漪：一圈以每秒 4 單位往外擴散的環，經過的粒子被往外推，並隨時間衰減
    float age = uTime - uRippleTime;
    float ring = abs(length(world.xyz - uRippleOrigin) - age * 4.0);
    float ripple = (1.0 - smoothstep(0.0, 0.45, ring)) * exp(-age * 1.4) * step(0.0, age);
    world.xyz += normalize(world.xyz - uRippleOrigin + 0.0001) * ripple * 0.45;

    vec4 view = viewMatrix * world;
    gl_Position = projectionMatrix * view;

    // 點的大小：越遠越小（除以深度），並乘上裝置像素比，高解析螢幕上大小一致
    gl_PointSize = uSize * (0.5 + aRandom) * uPixelRatio / -view.z;

    vRandom = aRandom;
    // 被推開或被漣漪掃過的粒子會變亮
    vGlow = push + ripple;
  }
`

export const fragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;

  varying float vRandom;
  varying float vGlow;

  void main() {
    // gl_PointCoord：點內部的座標 0 ~ 1；離中心超過 0.5 就丟掉 → 方形的點變圓形
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    // 中心亮、邊緣淡出 → 柔和的光點
    float alpha = smoothstep(0.5, 0.0, d);

    vec3 color = mix(uColorA, uColorB, vRandom) + vGlow * 0.9;
    gl_FragColor = vec4(color, alpha * uOpacity);

    // 把線性色彩轉成螢幕用的 sRGB（ShaderMaterial 不會自動做）
    #include <colorspace_fragment>
  }
`
