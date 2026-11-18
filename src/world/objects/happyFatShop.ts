import * as THREE from 'three';
import { loadGltfOnce, scheduleGltfMount } from './sharedGltf';

const HAPPY_FAT_URL = `${import.meta.env.BASE_URL}models/earth_mamas/earth_mamas.glb`;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();
const chimneyBox = new THREE.Box3();
const chimneyTop = new THREE.Vector3();

/** 同時在空中的煙團數量：少了會斷斷續續，太多會糊成一根柱子 */
const SMOKE_COUNT = 8;
/** 一團煙從冒出到消失的秒數 */
const SMOKE_LIFE = 3.2;

type SmokePuff = {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  age: number;
  /** 每團煙各自往旁邊歪一點，才不會排成一直線 */
  drift: THREE.Vector2;
};

/**
 * 可調色的五個部位。GLB 只有三個材質（屋頂、腰線、煙囪共用一張 atlas 貼圖），
 * 所以載入時每個部位各自複製一份材質，改一個部位不會連帶改到別的。
 */
export type HappyFatShopColors = {
  /** 一樓磚牆＋轉角圓柱 */
  groundWall: string;
  /** 二樓弧面牆 */
  upperWall: string;
  /** 一二樓之間的腰線 */
  cornice: string;
  /** 半弧屋頂（外緣的深色邊會跟著一起換色、維持比較深） */
  roof: string;
  /** 煙囪（含頂蓋） */
  chimney: string;
};

type ColorPart = keyof HappyFatShopColors;

/** 模型節點名稱（earth_mamas_xxx）→ 部位 */
const NODE_PART: Record<string, ColorPart> = {
  gf_shell: 'groundWall',
  corner_pillars: 'groundWall',
  upper_shell: 'upperWall',
  cornice: 'cornice',
  roof: 'roof',
  chimney: 'chimney',
};

/** 部位用到的貼圖平均色（線性空間）。量不到就當白色，等於直接把目標色乘上去 */
const pixelCache = new WeakMap<object, ImageData | null>();

function readPixels(texture: THREE.Texture): ImageData | null {
  const image = texture.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!image || !image.width || !image.height) return null;
  if (pixelCache.has(image)) return pixelCache.get(image) ?? null;
  let data: ImageData | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context) {
      context.drawImage(image, 0, 0);
      data = context.getImageData(0, 0, image.width, image.height);
    }
  } catch {
    data = null;
  }
  pixelCache.set(image, data);
  return data;
}

/**
 * 用 mesh 的頂點 UV 去貼圖上取樣，算出「這個部位實際看到的平均顏色」。
 * 為什麼不用整張貼圖平均：atlas 上同時有屋頂、腰線、煙囪的顏色，整張平均會混在一起。
 */
function averageMapColor(mesh: THREE.Mesh, map: THREE.Texture | null): THREE.Color {
  const result = new THREE.Color(1, 1, 1);
  const uv = mesh.geometry.getAttribute('uv');
  const pixels = map ? readPixels(map) : null;
  if (!uv || !pixels) return result;
  const { width, height, data } = pixels;
  const step = Math.max(1, Math.floor(uv.count / 3000));
  const sum = new THREE.Color(0, 0, 0);
  const sample = new THREE.Color();
  let count = 0;
  for (let i = 0; i < uv.count; i += step) {
    // glTF 貼圖 flipY = false，UV (0,0) 就是圖片左上角；磚牆 UV 會超過 1（重複平鋪），取小數部分
    const u = uv.getX(i) - Math.floor(uv.getX(i));
    const v = uv.getY(i) - Math.floor(uv.getY(i));
    const x = Math.min(width - 1, Math.floor(u * width));
    const y = Math.min(height - 1, Math.floor(v * height));
    const index = (y * width + x) * 4;
    sample.setRGB(data[index] / 255, data[index + 1] / 255, data[index + 2] / 255, THREE.SRGBColorSpace);
    sum.r += sample.r;
    sum.g += sample.g;
    sum.b += sample.b;
    count += 1;
  }
  if (count === 0) return result;
  return result.setRGB(
    Math.max(sum.r / count, 0.02),
    Math.max(sum.g / count, 0.02),
    Math.max(sum.b / count, 0.02),
  );
}

/**
 * 綠球上的街角小店「Happy Fat」（earth_mamas.glb）：參考圖的兩層小店，
 * 改成 mainHall（龍兔的家）的香菇屋風格，屋頂是半弧面。
 * 擺放方式跟寶箱一樣：離頂端角度＋方位角決定在球面上的位置，面板可調、可拖曳。
 */
export type HappyFatShopSettings = {
  enabled: boolean;
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 整棟最長邊（世界單位） */
  size: number;
  /**
   * 建築厚度（前後深度倍率，1 = 原始模型）。
   * 只沿模型自己的 z 軸（前後方向）拉伸，寬度和高度不變；
   * 少了這個就只能整體等比放大，沒辦法單獨讓房子變「厚」。
   */
  depth: number;
  sink: number;
  /** 煙囪冒煙 */
  smokeEnabled: boolean;
  /** 煙最濃時的不透明度（0～1） */
  smokeOpacity: number;
  /** 煙飄多高（1 = 大約煙囪本身高度的 1.7 倍） */
  smokeRise: number;
  colors: HappyFatShopColors;
};

export const HAPPY_FAT_SHOP_DEFAULT: HappyFatShopSettings = {
  enabled: true,
  angleFromTopDegrees: 5,
  azimuthDegrees: 110,
  spinDegrees: -180,
  size: 0.2,
  depth: 2.1,
  sink: 0.055,
  smokeEnabled: true,
  smokeOpacity: 0.55,
  smokeRise: 1,
  // 使用者在面板上調好的配色（二樓牆改成暖灰白，其餘維持建模時 plan.json 的 hex）
  colors: {
    groundWall: '#C98B6B',
    upperWall: '#e2d8d0',
    cornice: '#8A5A3C',
    roof: '#F2C14E',
    chimney: '#9AA0A8',
  },
};

type CreateHappyFatShopOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: HappyFatShopSettings;
};

export function createHappyFatShop({
  groundRadius,
  up,
  front,
  envMap,
  layout = HAPPY_FAT_SHOP_DEFAULT,
}: CreateHappyFatShopOptions) {
  // colors 要另外複製一份：只用 { ...layout } 的話面板改色會改到 HAPPY_FAT_SHOP_DEFAULT 本身
  const settings: HappyFatShopSettings = { ...layout, colors: { ...layout.colors } };
  const anchor = new THREE.Object3D();
  anchor.name = 'happy_fat_shop';
  const content = new THREE.Group();
  anchor.add(content);
  let introGrow = 1;
  let modelSize = 11;
  const hangers: THREE.Object3D[] = [];
  /** 煙囪要反向縮回 z，不然整棟變厚時煙囪會被拉成扁長的一片 */
  let chimney: THREE.Object3D | null = null;
  /** 每個上色的材質記住：屬於哪個部位、shader 用的目標色 uniform */
  const tinted: { part: ColorPart; tint: { value: THREE.Color } }[] = [];

  /** 面板改色只要更新 uniform，不必重新編譯 shader */
  function applyColors() {
    for (const { part, tint } of tinted) tint.value.set(settings.colors[part]);
  }

  /**
   * 「換色」而不是「染色」：
   *   染色 = material.color 乘在貼圖上。原本是飽和的黃橘色時，藍色通道幾乎是 0，
   *         怎麼乘都乘不出藍色（實測選藍色會變綠色）。
   *   換色 = 只拿貼圖的「亮度」當明暗紋路，顏色整個換成目標色。
   *         除以這個部位的平均亮度，讓整體平均剛好等於選的顏色；
   *         磚縫、木紋、屋頂外緣比較深的那圈都還在，只是變成新顏色的深淺。
   */
  function makeRecolorable(material: THREE.MeshStandardMaterial, part: ColorPart, averageLuminance: number) {
    const tint = { value: new THREE.Color(settings.colors[part]) };
    tinted.push({ part, tint });
    material.color.set(1, 1, 1);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.hfTint = tint;
      shader.uniforms.hfAverageLuminance = { value: averageLuminance };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 hfTint;\nuniform float hfAverageLuminance;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          #ifdef USE_MAP
            float hfLuminance = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            diffuseColor.rgb = hfTint * (hfLuminance / hfAverageLuminance);
          #endif`,
        );
    };
    // 這段改過 shader，快取 key 要跟一般的 MeshStandardMaterial 分開，不然可能拿到沒改過的程式
    material.customProgramCacheKey = () => `happy-fat-recolor`;
  }

  function currentNormal(target: THREE.Vector3) {
    direction.copy(front).applyAxisAngle(up, THREE.MathUtils.degToRad(settings.azimuthDegrees));
    const angle = THREE.MathUtils.degToRad(settings.angleFromTopDegrees);
    return target.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle));
  }

  function applyPlacement() {
    anchor.visible = settings.enabled;
    currentNormal(normal);
    anchor.position.copy(normal).multiplyScalar(groundRadius - settings.sink);
    anchor.quaternion.setFromUnitVectors(Y_AXIS, normal);
    anchor.quaternion.multiply(spin.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(settings.spinDegrees)));
    anchor.scale.setScalar(Math.max(0.0001, introGrow));
    const base = settings.size / modelSize;
    const depth = THREE.MathUtils.clamp(settings.depth, 0.3, 4);
    // content 的縮放套在模型自己的座標上（還沒被 anchor 旋轉），所以 z 就是前後深度
    content.scale.set(base, base, base * depth);
    // 煙囪位置跟著屋頂往後移，但本身維持方正
    if (chimney) chimney.scale.z = 1 / depth;
    applyColors();
  }

  loadGltfOnce(HAPPY_FAT_URL)
    .then((gltf) => {
      scheduleGltfMount(() => {
        const model = gltf.scene.clone(true);
        model.name = 'happy_fat_shop_model';
        model.traverse((child) => {
          if (/_hanger_\d+$/.test(child.name)) hangers.push(child);
          if (/_chimney$/.test(child.name)) chimney = child;
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const nodeName = /earth_mamas_(\w+)$/.exec(mesh.name)?.[1] ?? /earth_mamas_(\w+)$/.exec(mesh.parent?.name ?? '')?.[1];
          const part = nodeName ? NODE_PART[nodeName] : undefined;
          if (part) {
            // 每個部位自己一份材質，才能分開上色
            const own = (mesh.material as THREE.MeshStandardMaterial).clone();
            mesh.material = own;
            const average = averageMapColor(mesh, own.map);
            makeRecolorable(own, part, Math.max(0.02, 0.2126 * average.r + 0.7152 * average.g + 0.0722 * average.b));
          }
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) {
            if (envMap && 'envMap' in material) {
              (material as THREE.MeshStandardMaterial).envMap = envMap;
              (material as THREE.MeshStandardMaterial).envMapIntensity = 0.3;
            }
          }
        });
        // 量模型原始大小（還沒掛上場景，量到的是模型自己的座標）
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        modelSize = Math.max(size.x, size.y, size.z, 1e-6);
        content.add(model);
        applyPlacement();
      });
    })
    .catch((error) => console.error(`[happyFatShop] 載入失敗：${HAPPY_FAT_URL}`, error));

  applyPlacement();

  // ── 煙囪冒煙：幾團半透明的白灰色多面體，從煙囪口往上飄、變大、變淡（做法同篝火） ──
  // 煙掛在 anchor 底下，不放進模型裡：模型的 content 會沿前後拉長（建築厚度），煙放進去會被拉成扁的
  let chimneyMesh: THREE.Mesh | null = null;
  const smokeGroup = new THREE.Group();
  smokeGroup.name = 'happy_fat_chimney_smoke';
  anchor.add(smokeGroup);
  const smokeGeometry = new THREE.IcosahedronGeometry(1, 0);
  const smoke: SmokePuff[] = [];
  for (let i = 0; i < SMOKE_COUNT; i++) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xefe9e3,
      roughness: 1,
      flatShading: true,
      transparent: true,
      opacity: 0,
      // 半透明物體不寫深度：不然後面的煙團會被前面那團的「透明殼」擋掉
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(smokeGeometry, material);
    mesh.castShadow = false;
    // 煙不參與點擊／拖曳判定：不然點到煙會變成在拖這棟店、或擋住後面的東西
    mesh.raycast = () => {};
    smokeGroup.add(mesh);
    smoke.push({
      mesh,
      material,
      // 錯開起始年齡，煙才會一團接一團冒出，不會同時噴出來
      age: (i / SMOKE_COUNT) * SMOKE_LIFE,
      drift: new THREE.Vector2(Math.random() - 0.5, Math.random() - 0.5),
    });
  }

  function updateSmoke(deltaTime: number) {
    smokeGroup.visible = settings.enabled && settings.smokeEnabled && chimney !== null;
    if (!smokeGroup.visible || !chimney) return;
    // 每格都重新抓煙囪口的位置：厚度、大小調整後煙囪會移動，煙要跟著從煙囪口冒出來
    // 在煙囪「自己的座標」裡取頂面中心，再換到 anchor 座標：
    // 不用世界座標的包圍盒，因為房子在球面上是斜的，世界的 max.y 不會剛好是煙囪口
    if (!chimneyMesh) {
      chimney.traverse((child) => {
        if (!chimneyMesh && (child as THREE.Mesh).isMesh) chimneyMesh = child as THREE.Mesh;
      });
    }
    if (!chimneyMesh) return;
    const geometry = chimneyMesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    chimneyBox.copy(geometry.boundingBox!);
    chimneyBox.getCenter(chimneyTop);
    chimneyTop.y = chimneyBox.max.y;
    chimneyMesh.updateWorldMatrix(true, false);
    chimneyTop.applyMatrix4(chimneyMesh.matrixWorld);
    anchor.worldToLocal(chimneyTop);
    // 1 個「模型單位」換成 anchor 座標的長度（anchor 的縮放是開場動畫，已經算在 worldToLocal 裡）
    const unit = settings.size / modelSize;
    const rise = 6 * unit * Math.max(0.1, settings.smokeRise);
    for (const puff of smoke) {
      puff.age += Math.min(deltaTime, 0.1);
      if (puff.age >= SMOKE_LIFE) {
        puff.age -= SMOKE_LIFE;
        puff.drift.set(Math.random() - 0.5, Math.random() - 0.5);
      }
      const k = puff.age / SMOKE_LIFE;
      puff.mesh.position.set(
        // 整體往同一邊被風吹（+x），再加上每團自己的小偏移
        chimneyTop.x + (k * 1.6 + puff.drift.x * k * 1.2) * unit,
        chimneyTop.y + 0.3 * unit + k * rise,
        chimneyTop.z + puff.drift.y * k * 1.2 * unit,
      );
      // 剛冒出時比煙囪口小，越往上越大
      puff.mesh.scale.setScalar((0.35 + k * 1.1) * unit);
      puff.mesh.rotation.set(k * 1.3, k * 2, 0);
      // 先淡入再淡出：sin(πk) 頭尾都是 0，不會突然冒出、也不會突然消失
      puff.material.opacity = Math.sin(Math.PI * k) * THREE.MathUtils.clamp(settings.smokeOpacity, 0, 1);
    }
  }

  let time = 0;
  function update(deltaTime: number) {
    time += deltaTime;
    /** 屋簷的香菇串輕輕打轉（目前只留主體、沒有香菇串，找不到節點就不做事） */
    hangers.forEach((hanger, index) => {
      hanger.rotation.y = Math.sin(time * 0.9 + index * 1.7) * THREE.MathUtils.degToRad(20);
    });
    updateSmoke(deltaTime);
  }

  function setIntroGrow(value: number) {
    introGrow = THREE.MathUtils.clamp(value, 0, 1.5);
    anchor.scale.setScalar(Math.max(0.0001, introGrow));
  }

  function setNormal(target: THREE.Vector3) {
    const angle = Math.acos(THREE.MathUtils.clamp(target.dot(up), -1, 1));
    horizontal.copy(target).addScaledVector(up, -target.dot(up));
    side.crossVectors(up, front);
    const azimuth = Math.atan2(horizontal.dot(side), horizontal.dot(front));
    settings.angleFromTopDegrees = Math.round(THREE.MathUtils.radToDeg(angle));
    settings.azimuthDegrees = Math.round(THREE.MathUtils.radToDeg(azimuth));
    applyPlacement();
  }

  return {
    object: anchor,
    settings,
    applySettings: applyPlacement,
    setIntroGrow,
    update,
    setNormal,
    getNormal: () => currentNormal(new THREE.Vector3()),
  };
}

export function formatHappyFatShopSettingsForPaste(s: HappyFatShopSettings) {
  return (
    `// 貼回 src/world/objects/happyFatShop.ts 的 HAPPY_FAT_SHOP_DEFAULT\n` +
    `export const HAPPY_FAT_SHOP_DEFAULT: HappyFatShopSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  angleFromTopDegrees: ${s.angleFromTopDegrees},\n` +
    `  azimuthDegrees: ${s.azimuthDegrees},\n` +
    `  spinDegrees: ${s.spinDegrees},\n` +
    `  size: ${s.size.toFixed(3)},\n` +
    `  depth: ${s.depth.toFixed(2)},\n` +
    `  sink: ${s.sink.toFixed(3)},\n` +
    `  smokeEnabled: ${s.smokeEnabled},\n` +
    `  smokeOpacity: ${s.smokeOpacity.toFixed(2)},\n` +
    `  smokeRise: ${s.smokeRise.toFixed(2)},\n` +
    `  colors: {\n` +
    `    groundWall: '${s.colors.groundWall}',\n` +
    `    upperWall: '${s.colors.upperWall}',\n` +
    `    cornice: '${s.colors.cornice}',\n` +
    `    roof: '${s.colors.roof}',\n` +
    `    chimney: '${s.colors.chimney}',\n` +
    `  },\n` +
    `};`
  );
}
