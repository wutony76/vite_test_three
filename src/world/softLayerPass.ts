import * as THREE from 'three';

/**
 * 柔邊圖層（soft layer）：把某一層（layer）的物件單獨畫到一張透明圖上，做高斯模糊，再貼回畫面。
 * 用在浮空小星球：遠方的島邊緣太銳利，看起來像剪貼上去的；邊緣糊一點才有「很遠、隔著空氣」的感覺。
 *
 * 流程（每幀）：
 *   1. 只畫 layer 上的物件 → sharpTarget（全解析度、透明背景）
 *   2. 橫向高斯模糊 sharpTarget → blurTargetA
 *   3. 直向高斯模糊 blurTargetA → blurTargetB（兩趟一維 = 一次二維高斯，但便宜很多）
 *   4. 合成：輪廓（alpha 不滿的地方）用模糊版、內部用清晰版，貼到畫面上
 *
 * 合成時機：在天空背景之後、主場景之前 → 島就像天空背景的一部分，綠球、房子會蓋在它前面。
 *
 * 顏色約定：渲染到 RenderTarget 時 three.js 不做色彩空間轉換（保持線性），
 * 而且透明背景上畫出來的顏色等於「已乘上 alpha」（premultiplied）。
 * 所以模糊、合成都在 premultiplied 線性空間做，最後輸出前才轉 sRGB。
 */
export type SoftLayerSettings = {
  enabled: boolean;
  /** 模糊半徑（半解析度下的像素） */
  blurRadius: number;
  /** 0 = 只糊邊緣，1 = 整個都用模糊版 */
  wholeBlur: number;
};

export const SOFT_LAYER_DEFAULT: SoftLayerSettings = {
  enabled: true,
  blurRadius: 2.5,
  wholeBlur: 0.15,
};

const fullscreenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// 9 個取樣點的一維高斯：權重依 sigma 算好傳進來，方向（橫／直）由 uDirection 決定
const blurFragment = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 uDirection;
  uniform float uWeights[5];
  varying vec2 vUv;
  void main() {
    vec4 sum = texture2D(tInput, vUv) * uWeights[0];
    for (int i = 1; i < 5; i++) {
      vec2 offset = uDirection * float(i);
      sum += texture2D(tInput, vUv + offset) * uWeights[i];
      sum += texture2D(tInput, vUv - offset) * uWeights[i];
    }
    gl_FragColor = sum;
  }
`;

const compositeFragment = /* glsl */ `
  uniform sampler2D tSharp;
  uniform sampler2D tBlur;
  uniform float uWholeBlur;
  varying vec2 vUv;
  void main() {
    vec4 sharp = texture2D(tSharp, vUv);
    vec4 blurred = texture2D(tBlur, vUv);
    // 模糊版的 alpha 接近 1 = 島的內部；介於 0～1 = 輪廓附近（含往外暈開的那圈）
    // 輪廓附近用模糊版，內部用清晰版，細節保留、邊緣變柔
    float edge = 1.0 - smoothstep(0.88, 1.0, blurred.a);
    vec4 color = mix(sharp, blurred, max(edge, uWholeBlur));
    if (color.a < 0.002) discard;
    // premultiplied → 一般顏色，轉成 sRGB 後再乘回 alpha（混合模式用 premultiplied）
    vec3 linear = color.rgb / color.a;
    gl_FragColor = vec4(linear, color.a);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= gl_FragColor.a;
  }
`;

type CreateSoftLayerPassOptions = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** 要被拆出來畫的那一層（物件要 layers.set(layer)） */
  layer: number;
  /** 模糊圖層的解析度相對畫面（0.5 = 半解析度：本來就要糊，畫小一點省效能）；清晰版一律全解析度 */
  resolutionScale?: number;
  settings?: SoftLayerSettings;
};

export function createSoftLayerPass({
  renderer,
  scene,
  camera,
  layer,
  resolutionScale = 0.5,
  settings: initial = SOFT_LAYER_DEFAULT,
}: CreateSoftLayerPassOptions) {
  const settings: SoftLayerSettings = { ...initial };

  const targetOptions: THREE.RenderTargetOptions = {
    // HalfFloat：線性顏色用 8-bit 存，暗部會出現色階
    type: THREE.HalfFloatType,
    depthBuffer: true,
  };
  const sharpTarget = new THREE.WebGLRenderTarget(1, 1, targetOptions);
  const blurTargetA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const blurTargetB = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });

  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeometry = new THREE.PlaneGeometry(2, 2);

  const blurMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tInput: { value: null },
      uDirection: { value: new THREE.Vector2() },
      uWeights: { value: [0, 0, 0, 0, 0] },
    },
    vertexShader: fullscreenVertex,
    fragmentShader: blurFragment,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  const compositeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tSharp: { value: sharpTarget.texture },
      tBlur: { value: blurTargetB.texture },
      uWholeBlur: { value: 0 },
    },
    vertexShader: fullscreenVertex,
    fragmentShader: compositeFragment,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    // 顏色已經乘過 alpha：用 One / OneMinusSrcAlpha 疊上去，邊緣才不會出現黑邊
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(quadGeometry, blurMaterial);
  quad.frustumCulled = false;
  quadScene.add(quad);

  const drawSize = new THREE.Vector2();
  const clearColor = new THREE.Color();
  let lightRefreshTimer = 0;

  /**
   * 光源也要「在這一層」才會照到這一層的物件（three.js 收集光源時也看 layers）。
   * 場景裡的光會陸續加入（例如篝火、太陽），每秒補一次。
   */
  function shareLightsWithLayer() {
    scene.traverse((object) => {
      if ((object as THREE.Light).isLight) object.layers.enable(layer);
    });
  }

  function resizeIfNeeded() {
    renderer.getDrawingBufferSize(drawSize);
    // 清晰版跟畫面一樣大：內部細節、沒被模糊的地方才不會有鋸齒
    const fullW = Math.max(1, Math.round(drawSize.x));
    const fullH = Math.max(1, Math.round(drawSize.y));
    if (sharpTarget.width !== fullW || sharpTarget.height !== fullH) sharpTarget.setSize(fullW, fullH);
    // 模糊版用半解析度：反正要糊，畫小一點省一半以上的計算
    const w = Math.max(1, Math.round(drawSize.x * resolutionScale));
    const h = Math.max(1, Math.round(drawSize.y * resolutionScale));
    if (blurTargetA.width !== w || blurTargetA.height !== h) {
      blurTargetA.setSize(w, h);
      blurTargetB.setSize(w, h);
    }
    return { w, h };
  }

  /** 依模糊半徑算 9-tap 高斯權重（sigma ≈ 半徑 / 2），再正規化讓總和 = 1（不會變亮變暗） */
  function updateWeights() {
    const sigma = Math.max(0.01, settings.blurRadius / 2);
    const weights = blurMaterial.uniforms.uWeights.value as number[];
    let sum = 0;
    for (let i = 0; i < 5; i++) {
      weights[i] = Math.exp(-(i * i) / (2 * sigma * sigma));
      sum += i === 0 ? weights[i] : weights[i] * 2;
    }
    for (let i = 0; i < 5; i++) weights[i] /= sum;
  }

  function blurPass(input: THREE.Texture, output: THREE.WebGLRenderTarget, dx: number, dy: number) {
    blurMaterial.uniforms.tInput.value = input;
    (blurMaterial.uniforms.uDirection.value as THREE.Vector2).set(dx, dy);
    quad.material = blurMaterial;
    renderer.setRenderTarget(output);
    renderer.render(quadScene, quadCamera);
  }

  /** 在天空背景之後、主場景之前呼叫 */
  function render(deltaTime: number) {
    lightRefreshTimer -= deltaTime;
    if (lightRefreshTimer <= 0) {
      lightRefreshTimer = 1;
      shareLightsWithLayer();
    }

    const { w, h } = resizeIfNeeded();
    const previousTarget = renderer.getRenderTarget();
    const previousMask = camera.layers.mask;
    const previousAlpha = renderer.getClearAlpha();
    renderer.getClearColor(clearColor);
    const previousShadowAuto = renderer.shadowMap.autoUpdate;

    // 1. 只畫這一層，透明背景
    camera.layers.set(layer);
    // 陰影貼圖主場景會更新；這一趟不用再算一次（小島本來就不投影、不接影）
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(sharpTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    camera.layers.mask = previousMask;
    renderer.shadowMap.autoUpdate = previousShadowAuto;

    if (settings.enabled) {
      // 2、3. 橫向 + 直向高斯模糊（offset 用 UV 單位：1 像素 = 1/寬）
      updateWeights();
      const step = Math.max(settings.blurRadius, 0.01) / 4;
      blurPass(sharpTarget.texture, blurTargetA, step / w, 0);
      blurPass(blurTargetA.texture, blurTargetB, 0, step / h);
      compositeMaterial.uniforms.tBlur.value = blurTargetB.texture;
      compositeMaterial.uniforms.uWholeBlur.value = THREE.MathUtils.clamp(settings.wholeBlur, 0, 1);
    } else {
      // 關掉模糊：模糊版直接用清晰版，合成結果 = 原本的銳利畫面
      compositeMaterial.uniforms.tBlur.value = sharpTarget.texture;
      compositeMaterial.uniforms.uWholeBlur.value = 0;
    }

    // 4. 合成到原本的畫面
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(clearColor, previousAlpha);
    quad.material = compositeMaterial;
    renderer.render(quadScene, quadCamera);
  }

  function dispose() {
    sharpTarget.dispose();
    blurTargetA.dispose();
    blurTargetB.dispose();
    blurMaterial.dispose();
    compositeMaterial.dispose();
    quadGeometry.dispose();
  }

  /**
   * 開場預熱 shader 前呼叫：先讓光源也在這一層，預熱時編出來的程式才會跟實際畫的時候一模一樣
   * （光源數量不同，three.js 會當成不同的 shader 再編一次）
   */
  function prepareForCompile() {
    shareLightsWithLayer();
  }

  return { settings, render, dispose, prepareForCompile };
}

export function formatSoftLayerSettingsForPaste(s: SoftLayerSettings) {
  return (
    `// 貼回 src/world/softLayerPass.ts 的 SOFT_LAYER_DEFAULT\n` +
    `export const SOFT_LAYER_DEFAULT: SoftLayerSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  blurRadius: ${s.blurRadius.toFixed(2)},\n` +
    `  wholeBlur: ${s.wholeBlur.toFixed(2)},\n` +
    `};\n`
  );
}
