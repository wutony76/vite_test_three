import * as THREE from 'three';

/**
 * 前景模糊（移軸 tilt-shift 效果）：畫面最下面那條帶狀區域往下越來越糊。
 *
 * 為什麼要做：預設鏡頭下，畫面底部約 1/3 是靠近鏡頭的番茄醬，又大又清楚，視覺重量太重、搶走綠球的焦點。
 * 真實相機拍近物時，焦點外的前景本來就是糊的（景深）；小星球這種「模型感」場景，移軸模糊更是招牌效果。
 *
 * 為什麼不只模糊番茄醬：醬會繞到綠球後面，單獨畫的話要另外處理被球擋住的部分（要深度圖），
 * 而預設鏡頭下畫面底部本來就是醬、也是離鏡頭最近的東西 → 依畫面高度來糊，效果幾乎一樣，簡單很多。
 *
 * 流程（每幀，主場景畫完之後）：
 *   1. 把目前畫面複製成貼圖（copyFramebufferToTexture，GPU 內部複製，很快）
 *   2. 半解析度橫向 + 直向高斯模糊（做兩輪，模糊半徑才夠大）
 *   3. 以「離畫面底部多遠」當遮罩，把模糊版疊回畫面：底部全糊 → 往上漸漸變清楚
 *
 * 顏色：畫面上的像素已經是 sRGB，模糊、疊回都直接用 sRGB 值，不做色彩空間轉換。
 */
export type ForegroundBlurSettings = {
  enabled: boolean;
  /** 從畫面底部往上多高（0～1，佔畫面高度）開始變清楚；這以上完全清晰 */
  band: number;
  /** 從「全糊」到「清晰」的過渡佔 band 的比例；越大越柔 */
  feather: number;
  /** 模糊半徑（半解析度下的像素） */
  blurRadius: number;
  /** 最底部的模糊強度（0～1） */
  strength: number;
};

export const FOREGROUND_BLUR_DEFAULT: ForegroundBlurSettings = {
  enabled: true,
  band: 0.3,
  feather: 0.75,
  blurRadius: 3,
  strength: 1,
};

const fullscreenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

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
  uniform sampler2D tBlur;
  uniform float uBand;
  uniform float uFeather;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    // vUv.y：0 = 畫面最底、1 = 最頂。band 以上完全清晰，band × (1 - feather) 以下全糊
    float fullBlurUntil = uBand * (1.0 - uFeather);
    float mask = 1.0 - smoothstep(fullBlurUntil, uBand, vUv.y);
    mask *= uStrength;
    if (mask < 0.002) discard;
    gl_FragColor = vec4(texture2D(tBlur, vUv).rgb, mask);
  }
`;

type CreateForegroundBlurOptions = {
  renderer: THREE.WebGLRenderer;
  settings?: ForegroundBlurSettings;
};

export function createForegroundBlur({ renderer, settings: initial = FOREGROUND_BLUR_DEFAULT }: CreateForegroundBlurOptions) {
  const settings: ForegroundBlurSettings = { ...initial };

  // 畫面複製到這張貼圖（大小跟畫面一樣，視窗改變時重建）
  let frameTexture: THREE.FramebufferTexture | null = null;
  const blurA = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const blurB = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });

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
      tBlur: { value: blurB.texture },
      uBand: { value: settings.band },
      uFeather: { value: settings.feather },
      uStrength: { value: settings.strength },
    },
    vertexShader: fullscreenVertex,
    fragmentShader: compositeFragment,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(quadGeometry, blurMaterial);
  quad.frustumCulled = false;
  quadScene.add(quad);

  const drawSize = new THREE.Vector2();

  function resizeIfNeeded() {
    renderer.getDrawingBufferSize(drawSize);
    const fullW = Math.max(1, Math.round(drawSize.x));
    const fullH = Math.max(1, Math.round(drawSize.y));
    if (!frameTexture || frameTexture.image.width !== fullW || frameTexture.image.height !== fullH) {
      frameTexture?.dispose();
      frameTexture = new THREE.FramebufferTexture(fullW, fullH);
      // 複製來的像素已經是 sRGB，標成 NoColorSpace：取樣時不要再轉換一次
      frameTexture.colorSpace = THREE.NoColorSpace;
      frameTexture.minFilter = THREE.LinearFilter;
      frameTexture.magFilter = THREE.LinearFilter;
    }
    const w = Math.max(1, Math.round(fullW * 0.5));
    const h = Math.max(1, Math.round(fullH * 0.5));
    if (blurA.width !== w || blurA.height !== h) {
      blurA.setSize(w, h);
      blurB.setSize(w, h);
    }
    return { w, h };
  }

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

  /** 主場景畫完之後呼叫（畫面上已經是完整的一幀） */
  function render() {
    if (!settings.enabled || settings.strength <= 0 || settings.band <= 0) return;
    const { w, h } = resizeIfNeeded();
    const previousTarget = renderer.getRenderTarget();

    // 1. 複製目前畫面（必須在畫面本身這個 framebuffer 上複製）
    renderer.setRenderTarget(null);
    renderer.copyFramebufferToTexture(frameTexture!);

    // 2. 兩輪橫 + 直高斯模糊（半解析度）：一輪半徑不夠大，前景看起來只是「有點霧」
    updateWeights();
    const step = Math.max(settings.blurRadius, 0.01) / 4;
    blurPass(frameTexture!, blurA, step / w, 0);
    blurPass(blurA.texture, blurB, 0, step / h);
    blurPass(blurB.texture, blurA, (step * 2) / w, 0);
    blurPass(blurA.texture, blurB, 0, (step * 2) / h);

    // 3. 依畫面高度疊回去
    compositeMaterial.uniforms.uBand.value = THREE.MathUtils.clamp(settings.band, 0, 1);
    compositeMaterial.uniforms.uFeather.value = THREE.MathUtils.clamp(settings.feather, 0.01, 1);
    compositeMaterial.uniforms.uStrength.value = THREE.MathUtils.clamp(settings.strength, 0, 1);
    renderer.setRenderTarget(previousTarget);
    quad.material = compositeMaterial;
    renderer.render(quadScene, quadCamera);
  }

  function dispose() {
    frameTexture?.dispose();
    blurA.dispose();
    blurB.dispose();
    blurMaterial.dispose();
    compositeMaterial.dispose();
    quadGeometry.dispose();
  }

  return { settings, render, dispose };
}

export function formatForegroundBlurSettingsForPaste(s: ForegroundBlurSettings) {
  return (
    `// 貼回 src/world/foregroundBlur.ts 的 FOREGROUND_BLUR_DEFAULT\n` +
    `export const FOREGROUND_BLUR_DEFAULT: ForegroundBlurSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  band: ${s.band.toFixed(2)},\n` +
    `  feather: ${s.feather.toFixed(2)},\n` +
    `  blurRadius: ${s.blurRadius.toFixed(1)},\n` +
    `  strength: ${s.strength.toFixed(2)},\n` +
    `};`
  );
}
