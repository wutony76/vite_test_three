/**
 * 鮭魚排在綠球上的佈局與外觀。調完可用面板印出、再貼回這裡。
 */
export type SalmonSteakLayout = {
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

export const SALMON_STEAK_LAYOUT_DEFAULT: SalmonSteakLayout = {
  angleFromTopDegrees: 39,
  azimuthDegrees: 1,
  spinDegrees: -18,
  tiltXDegrees: 0,
  tiltZDegrees: 0,
  sink: 0.004,
  placementScale: 1,
  modelSize: 0.16,
  heightScale: 1,
  colorBoost: 1.5,
  tintColor: '#ffffff',
  tintMix: 0,
};

export type SalmonSteakPlacement = SalmonSteakLayout & { id: string };

export const SALMON_STEAK_PLACEMENTS: SalmonSteakPlacement[] = [];
