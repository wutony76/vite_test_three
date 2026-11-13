/**
 * 檸檬片在綠球上的佈局與外觀。調完可用面板印出、再貼回這裡。
 */
export type LemonSliceLayout = {
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 貼地後繞局部 X 傾斜。0 = 切面朝外 */
  tiltXDegrees: number;
  /** 貼地後繞局部 Z 傾斜 */
  tiltZDegrees: number;
  sink: number;
  /** 整體縮放（長寬高一起） */
  placementScale: number;
  /** 模型最長邊（世界單位），再乘 placementScale */
  modelSize: number;
  /** 厚度倍率。1 = 模型原高，只拉高、不改變長寬 */
  heightScale: number;
  /** 亮度。1 = 原色 */
  colorBoost: number;
  /** 染色；tintMix 為 0 時看不出來 */
  tintColor: string;
  /** 0 = 原色，1 = 完全染成 tintColor */
  tintMix: number;
};

export const LEMON_SLICE_LAYOUT_DEFAULT: LemonSliceLayout = {
  angleFromTopDegrees: 43,
  azimuthDegrees: 5,
  spinDegrees: 8,
  tiltXDegrees: 0,
  tiltZDegrees: 0,
  sink: 0.003,
  placementScale: 0.47,
  modelSize: 0.2,
  heightScale: 1,
  colorBoost: 0.79,
  tintColor: '#806652',
  tintMix: 0,
};

export type LemonSlicePlacement = LemonSliceLayout & { id: string };

export const LEMON_SLICE_PLACEMENTS: LemonSlicePlacement[] = [];
