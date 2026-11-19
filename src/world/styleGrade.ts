import * as THREE from 'three';

/**
 * 畫面風格統一（style grade）。
 *
 * 場景混了三種素材：寫實貼圖（洗衣店、台灣廳舍…）、色塊表貼圖（Gamehall、布丁…）、純色漸層（小豬、浮空島…）。
 * 這裡不改任何模型，而是在每個內建材質的 fragment shader 最後面加一段「調色」：
 *   1. 全場色調統一：暗部往同一個淡紫色抬亮、整體往同一個粉色靠一點
 *      → 插畫看起來一致，主要靠「大家共用同一組陰影色與色調」
 *   2. 寫實貼圖降對比：只對「LINEAR 取樣的貼圖」（照片風格）降低飽和與亮度對比
 *      → 髒舊的照片細節變得像插畫上色；NEAREST 的色塊表本來就乾淨，不動
 *
 * 為什麼用 shader 而不是改 material.color？
 * 小豬、檸檬等程式會在執行期自己改 material.color，改顏色會互相覆蓋；
 * 在 shader 最後一步調色，跟那些程式完全不衝突。
 *
 * 所有材質共用同一份 uniforms 物件：面板拖動只改數值，不用重新編譯 shader。
 */
export type StyleGradeSettings = {
  enabled: boolean;
  /** 整體往 tintColor 靠的比例（0～1） */
  tintAmount: number;
  tintColor: string;
  /** 暗部抬亮的強度：越大陰影越淡、越偏 shadowColor */
  shadowLift: number;
  shadowColor: string;
  /** 寫實貼圖的飽和度（1 = 原樣，0 = 黑白） */
  textureSaturation: number;
  /** 寫實貼圖的亮度對比（1 = 原樣，越小越平） */
  textureContrast: number;
  /** 降對比時亮度往這個值收（線性空間；0.12 約等於畫面上 38% 的亮度。線性值看起來會比直覺暗很多） */
  texturePivot: number;
};

export const STYLE_GRADE_DEFAULT: StyleGradeSettings = {
  enabled: true,
  tintAmount: 0.01,
  tintColor: '#f6cfe3',
  shadowLift: 0.12,
  shadowColor: '#9b86d6',
  textureSaturation: 1,
  textureContrast: 1,
  texturePivot: 0.12,
};

/** 不調色的物件（以及它底下全部）：浮空小星球有自己的遠景霧化、荷包蛋太陽要維持亮白 */
const EXCLUDED_ROOT_NAMES = new Set(['floating_island', 'egg_sun_anchor']);

const GRADE_KEY = '|styleGrade:v1';

/**
 * 每個材質自己的「選取調色」：飽和度、亮度（1 = 原樣）。
 * 跟上面全場共用的 uniforms 不同：選中某一棟房子時只有那一棟變，所以每個材質要有自己一份。
 * 放在 material.userData：注入 shader 時、選取時都拿同一個物件，誰先誰後都沒關係
 * （房子模型是非同步載入的，可能先被選、後才注入）。
 */
type SelectUniforms = { saturation: { value: number }; brightness: { value: number } };

function selectUniforms(material: THREE.Material): SelectUniforms {
  const data = material.userData as { gradeSelect?: SelectUniforms };
  data.gradeSelect ??= { saturation: { value: 1 }, brightness: { value: 1 } };
  return data.gradeSelect;
}

/**
 * 把 root 底下所有材質的飽和度、亮度設成指定值（1 = 原樣）。
 * 只對有注入調色的材質有效；發光、不吃色調映射的燈（招牌字、燈管）不會變。
 */
export function setObjectSelectGrade(root: THREE.Object3D, saturation: number, brightness: number) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const u = selectUniforms(material);
      u.saturation.value = saturation;
      u.brightness.value = brightness;
    }
  });
}

type GradeUniforms = {
  uGradeEnabled: { value: number };
  uTintAmount: { value: number };
  uTintColor: { value: THREE.Color };
  uShadowLift: { value: number };
  uShadowColor: { value: THREE.Color };
  uTexSaturation: { value: number };
  uTexContrast: { value: number };
  uTexPivot: { value: number };
};

type CreateStyleGradeOptions = {
  root: THREE.Object3D;
  settings?: StyleGradeSettings;
};

export function createStyleGrade({ root, settings: initial = STYLE_GRADE_DEFAULT }: CreateStyleGradeOptions) {
  const settings: StyleGradeSettings = { ...initial };
  const uniforms: GradeUniforms = {
    uGradeEnabled: { value: 1 },
    uTintAmount: { value: 0 },
    // THREE.Color 設 hex 時會自動轉成線性空間，跟 shader 裡 gl_FragColor（色調映射前）同一個空間
    uTintColor: { value: new THREE.Color() },
    uShadowLift: { value: 0 },
    uShadowColor: { value: new THREE.Color() },
    uTexSaturation: { value: 1 },
    uTexContrast: { value: 1 },
    uTexPivot: { value: 0.25 },
  };
  /** 處理過的材質：WeakSet 不會阻止材質被回收（物件刪掉後自然消失） */
  const processed = new WeakSet<THREE.Material>();
  /** 實際編譯時有套到「寫實貼圖降對比」的材質（貼圖可能晚一點才設上，所以在編譯時才記） */
  const softenedSet = new WeakSet<THREE.Material>();
  const stats = { graded: 0, softened: 0 };

  function apply() {
    uniforms.uGradeEnabled.value = settings.enabled ? 1 : 0;
    uniforms.uTintAmount.value = THREE.MathUtils.clamp(settings.tintAmount, 0, 1);
    uniforms.uTintColor.value.set(settings.tintColor);
    uniforms.uShadowLift.value = Math.max(0, settings.shadowLift);
    uniforms.uShadowColor.value.set(settings.shadowColor);
    uniforms.uTexSaturation.value = Math.max(0, settings.textureSaturation);
    uniforms.uTexContrast.value = Math.max(0, settings.textureContrast);
    uniforms.uTexPivot.value = Math.max(0, settings.texturePivot);
  }

  function isGradable(material: THREE.Material) {
    // 自訂 shader（彩虹、背景…）沒有內建的 include 片段可以插
    if ((material as THREE.ShaderMaterial).isShaderMaterial) return false;
    // toneMapped: false 是刻意「發光、不吃色調映射」的東西（火焰、燈、閃電），維持原色
    if (material.toneMapped === false) return false;
    return (
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshLambertMaterial ||
      material instanceof THREE.MeshPhongMaterial ||
      material instanceof THREE.MeshBasicMaterial ||
      material instanceof THREE.MeshToonMaterial
    );
  }

  /** 只有「LINEAR 取樣」的貼圖才算寫實貼圖；NEAREST 的色塊表本來就是乾淨色塊 */
  function hasRealisticMap(material: THREE.Material) {
    const map = (material as THREE.MeshStandardMaterial).map;
    return !!map && map.magFilter === THREE.LinearFilter;
  }

  function injectGrade(material: THREE.Material) {
    // 先保留原本的 hook（番茄醬有自己的 onBeforeCompile），我們接在它後面
    const previousCompile = material.onBeforeCompile;
    // three.js 預設的 cache key 是「onBeforeCompile 的原始碼字串」。
    // 包裝之後每個材質的 onBeforeCompile 原始碼都一樣（都是下面這個函式），
    // 所以要在包裝「之前」先算好原本的 key，不然番茄醬（有自己的 hook）會跟一般材質撞同一個 key
    const originalKey = material.customProgramCacheKey;
    const previousKey =
      originalKey === THREE.Material.prototype.customProgramCacheKey
        ? (() => {
            const key = previousCompile.toString();
            return () => key;
          })()
        : originalKey.bind(material);

    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      if (!shader.fragmentShader.includes('#include <tonemapping_fragment>')) return;
      // 「是不是寫實貼圖」要在編譯當下才判斷：有些房子的貼圖是材質建好之後才另外設上去的，
      // 設上 map 時 three.js 會自動重新編譯，這裡就會再跑一次、拿到最新的判斷
      const soften = hasRealisticMap(material);
      if (soften && !softenedSet.has(material)) {
        softenedSet.add(material);
        stats.softened += 1;
      }
      Object.assign(shader.uniforms, uniforms);
      const select = selectUniforms(material);
      shader.uniforms.uSelectSaturation = select.saturation;
      shader.uniforms.uSelectBrightness = select.brightness;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform float uGradeEnabled;
        uniform float uTintAmount;
        uniform vec3 uTintColor;
        uniform float uShadowLift;
        uniform vec3 uShadowColor;
        uniform float uTexSaturation;
        uniform float uTexContrast;
        uniform float uTexPivot;
        uniform float uSelectSaturation;
        uniform float uSelectBrightness;`,
      );

      if (soften && shader.fragmentShader.includes('#include <map_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            // 寫實貼圖降飽和、降對比（在打光之前，所以光影仍然正常）
            float texLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            vec3 texSoft = mix(vec3(texLum), diffuseColor.rgb, uTexSaturation);
            // 對比只壓縮「亮度」往 uTexPivot 收，再等比例縮放顏色：色相不變，不會整片變灰
            float newLum = mix(uTexPivot, texLum, uTexContrast);
            texSoft *= newLum / max(texLum, 1e-3);
            diffuseColor.rgb = mix(diffuseColor.rgb, texSoft, uGradeEnabled);
          }`,
        );
      }

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <tonemapping_fragment>',
        `{
          // 全場色調統一（打光完成、色調映射之前）
          vec3 graded = gl_FragColor.rgb;
          float gLum = dot(graded, vec3(0.2126, 0.7152, 0.0722));
          // 越暗的地方抬得越多，而且抬成淡紫：大家的陰影就變成同一種顏色
          // 門檻 0.12 是「線性空間」亮度（畫面上約 38%）：只動真正的陰影；
          // 設太高（例如 0.5）會連草地、番茄醬一起抬亮，整個畫面像蒙一層牛奶
          graded += uShadowColor * uShadowLift * (1.0 - smoothstep(0.0, 0.12, gLum));
          graded = mix(graded, uTintColor, uTintAmount);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, graded, uGradeEnabled);
          // 選取調色（不受上面的 enabled 開關影響）：
          // 飽和度 = 往「同亮度的灰」的反方向推，顏色更鮮艷、亮度不變；亮度 = 整體乘上倍率
          float sLum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          gl_FragColor.rgb = max(mix(vec3(sLum), gl_FragColor.rgb, uSelectSaturation), 0.0) * uSelectBrightness;
        }
        #include <tonemapping_fragment>`,
      );
    };
    // 注入過的 shader 跟原本的不能共用同一個編譯結果，cache key 要不同
    material.customProgramCacheKey = () =>
      `${previousKey()}${GRADE_KEY}${hasRealisticMap(material) ? ':soft' : ''}`;
    material.needsUpdate = true;
    stats.graded += 1;
  }

  /** 找出還沒處理過的材質並注入；模型是非同步載入的，所以要定期呼叫 */
  function scan() {
    const walk = (object: THREE.Object3D) => {
      if (EXCLUDED_ROOT_NAMES.has(object.name)) return;
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (processed.has(material)) continue;
          processed.add(material);
          if (!isGradable(material)) continue;
          try {
            injectGrade(material);
          } catch (error) {
            console.warn('[styleGrade] 材質注入失敗，已略過', material.name, error);
          }
        }
      }
      for (const child of object.children) walk(child);
    };
    walk(root);
  }

  apply();
  scan();

  return {
    settings,
    apply,
    scan,
    stats,
  };
}

export function formatStyleGradeSettingsForPaste(s: StyleGradeSettings) {
  return (
    `// 貼回 src/world/styleGrade.ts 的 STYLE_GRADE_DEFAULT\n` +
    `export const STYLE_GRADE_DEFAULT: StyleGradeSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  tintAmount: ${s.tintAmount.toFixed(3)},\n` +
    `  tintColor: '${s.tintColor}',\n` +
    `  shadowLift: ${s.shadowLift.toFixed(3)},\n` +
    `  shadowColor: '${s.shadowColor}',\n` +
    `  textureSaturation: ${s.textureSaturation.toFixed(2)},\n` +
    `  textureContrast: ${s.textureContrast.toFixed(2)},\n` +
    `  texturePivot: ${s.texturePivot.toFixed(2)},\n` +
    `};\n`
  );
}
