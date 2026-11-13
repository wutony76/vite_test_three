export type GrilledCornLayout = {
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  sink: number;
  placementScale: number;
  /** 模型最長邊（世界單位） */
  modelSize: number;
};

/** 每根玉米各自的外觀與熱氣（場景即時，不影響 GLB 貼圖烘焙） */
export type GrilledCornVisualLayout = {
  emissiveIntensity: number;
  colorBoost: number;
  /** 0=原色，越大越偏橘 */
  orangeBias: number;
  normalScale: number;
  /** 熱氣濃度：0=關，1=標準，可調到 ~1.8 */
  steamDensity: number;
  /** 染色（乘上此色）；#ffffff ＋ mix 0 = 原色 */
  tintColor: string;
  /** 染色強度 0–1 */
  tintMix: number;
};

export const GRILLED_CORN_LAYOUT_DEFAULT: GrilledCornLayout = {
  angleFromTopDegrees: 36,
  azimuthDegrees: -62,
  spinDegrees: 18,
  sink: 0.008,
  placementScale: 1,
  modelSize: 0.11,
};

/** 僅供「新增玉米」時的初值；已擺放的以 GRILLED_CORN_PLACEMENTS 各筆為準 */
export const GRILLED_CORN_VISUAL_DEFAULT: GrilledCornVisualLayout = {
  emissiveIntensity: 0.1,
  colorBoost: 1.08,
  orangeBias: 0.24,
  normalScale: 2.15,
  steamDensity: 1,
  tintColor: '#ffffff',
  tintMix: 0,
};

export type GrilledCornPlacement = GrilledCornLayout & GrilledCornVisualLayout & { id: string };

export function splitGrilledCornPlacement(placement: GrilledCornPlacement): {
  layout: GrilledCornLayout;
  visual: GrilledCornVisualLayout;
} {
  const {
    id: _id,
    emissiveIntensity,
    colorBoost,
    orangeBias,
    normalScale,
    steamDensity,
    tintColor,
    tintMix,
    ...layout
  } = placement;
  return {
    layout,
    visual: { emissiveIntensity, colorBoost, orangeBias, normalScale, steamDensity, tintColor, tintMix },
  };
}

/**
 * 場景要幾根玉米 = `GRILLED_CORN_PLACEMENTS.length`（陣列有幾筆就長幾根）。
 * 執行時也可用 GUI「新增玉米」；調完用「印出全部設定」貼回此檔。
 */
export const GRILLED_CORN_PLACEMENTS: GrilledCornPlacement[] = [
  {
    id: 'grilled_corn_1',
    angleFromTopDegrees: 25,
    azimuthDegrees: -175,
    spinDegrees: 18,
    sink: 0.008,
    placementScale: 1,
    modelSize: 0.11,
    emissiveIntensity: 0.1,
    colorBoost: 1.08,
    orangeBias: 0.24,
    normalScale: 2.15,
    steamDensity: 1,
    tintColor: '#ffffff',
    tintMix: 0,
  },
  {
    id: 'grilled_corn_2',
    angleFromTopDegrees: 32,
    azimuthDegrees: -35,
    spinDegrees: 18,
    sink: 0.008,
    placementScale: 1,
    modelSize: 0.11,
    emissiveIntensity: 0.1,
    colorBoost: 1.08,
    orangeBias: 0.24,
    normalScale: 2.15,
    steamDensity: 1,
    tintColor: '#ffffff',
    tintMix: 0,
  },
  {
    id: 'grilled_corn_3',
    angleFromTopDegrees: 39,
    azimuthDegrees: -110,
    spinDegrees: 18,
    sink: 0.008,
    placementScale: 1,
    modelSize: 0.11,
    emissiveIntensity: 0.1,
    colorBoost: 1.08,
    orangeBias: 0.24,
    normalScale: 2.15,
    steamDensity: 1,
    tintColor: '#ffffff',
    tintMix: 0,
  },
  {
    id: 'grilled_corn_4',
    angleFromTopDegrees: 22,
    azimuthDegrees: 30,
    spinDegrees: 18,
    sink: 0.008,
    placementScale: 1,
    modelSize: 0.11,
    emissiveIntensity: 0.1,
    colorBoost: 1.08,
    orangeBias: 0.24,
    normalScale: 2.15,
    steamDensity: 1,
    tintColor: '#ffffff',
    tintMix: 0,
  },
  {
    id: 'grilled_corn_5',
    angleFromTopDegrees: 37,
    azimuthDegrees: 135,
    spinDegrees: 18,
    sink: 0.008,
    placementScale: 1,
    modelSize: 0.11,
    emissiveIntensity: 0.1,
    colorBoost: 1.08,
    orangeBias: 0.24,
    normalScale: 2.15,
    steamDensity: 1.8,
    tintColor: '#ffffff',
    tintMix: 0,
  },
];
