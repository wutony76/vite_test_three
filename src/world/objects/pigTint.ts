import * as THREE from 'three';

/**
 * 小豬換色：只換「粉紅色系」的部位（身體、鼻子、耳朵內側、蹄、尾巴），金幣、櫻花、黃色小花不動。
 *
 * pig_v2 的顏色不是 material.color，而是一張 64×64 的 palette atlas 貼圖：每個材質佔一小格純色。
 * 直接改 material.color 會「乘」在整張貼圖上，金幣和黃花也會一起被染色，所以改成：
 *   1. 第一次把原始貼圖畫到 canvas，留一份原始像素
 *   2. 換色時逐格檢查：色相落在粉紅範圍（315°～358°）、夠鮮豔、夠亮的格子才換
 *   3. 換成「使用者選的顏色 × 這格原本相對身體的亮度」→ 鼻子、蹄原本比身體深，換色後一樣比較深
 * 貼圖只有 64×64，每次換色重算一次只要不到 1 ms，不需要寫 shader。
 */

/** 身體原本的顏色（plan 的 red 材質 #F2869F）；其他粉色部位的深淺以它為基準 */
const BASE_BODY = new THREE.Color('#f2869f');
const baseLuma = luma(BASE_BODY.r * 255, BASE_BODY.g * 255, BASE_BODY.b * 255);

function luma(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** 這個像素是不是小豬的粉紅色系（不是金幣的金黃、不是投幣孔的暗紅、不是空白格） */
function isPigPink(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const value = max / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (value < 0.55 || saturation < 0.25) return false;
  // 色相（度）：紅在 0°／360°，粉紅在 330°～350° 附近；金幣、黃花在 35°～50°
  let hue: number;
  if (max === r) hue = ((g - b) / (max - min)) * 60;
  else if (max === g) hue = ((b - r) / (max - min)) * 60 + 120;
  else hue = ((r - g) / (max - min)) * 60 + 240;
  if (hue < 0) hue += 360;
  return hue >= 315 && hue <= 358;
}

export function createPigTint(model: THREE.Object3D) {
  // 找出用 palette atlas 的貼圖（名稱帶 atlas、而且不是 decal）
  let map: THREE.Texture | null = null;
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (map || !mesh.isMesh) return;
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (material?.map && /atlas/i.test(material.name) && !/decal/i.test(material.name)) map = material.map;
  });
  const texture = map as THREE.Texture | null;
  const image = texture?.image as CanvasImageSource & { width: number; height: number } | undefined;
  if (!texture || !image?.width) return null;

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);
  const original = context.getImageData(0, 0, canvas.width, canvas.height);
  const output = context.createImageData(canvas.width, canvas.height);
  // 之後貼圖改用這個 canvas：sampler 設定（NEAREST、flipY=false、sRGB）都沿用原本的 texture
  texture.image = canvas;

  const pick = new THREE.Color();

  function setColor(hex: string) {
    // getHex() 回傳的是 sRGB（選色器上看到的值）；pick.r 是線性空間，直接 ×255 會變得比選的更深、更飽和
    const rgb = pick.set(hex).getHex();
    const tr = (rgb >> 16) & 255;
    const tg = (rgb >> 8) & 255;
    const tb = rgb & 255;
    const src = original.data;
    const dst = output.data;
    for (let i = 0; i < src.length; i += 4) {
      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];
      if (isPigPink(r, g, b)) {
        // 保留這格相對身體的亮度：鼻子原本比身體暗 10%，換色後也暗 10%
        const k = luma(r, g, b) / baseLuma;
        dst[i] = Math.min(255, tr * k);
        dst[i + 1] = Math.min(255, tg * k);
        dst[i + 2] = Math.min(255, tb * k);
      } else {
        dst[i] = r;
        dst[i + 1] = g;
        dst[i + 2] = b;
      }
      dst[i + 3] = src[i + 3];
    }
    context!.putImageData(output, 0, 0);
    // 少了這行，GPU 上還是舊的貼圖，畫面不會變
    texture!.needsUpdate = true;
  }

  return { setColor };
}
