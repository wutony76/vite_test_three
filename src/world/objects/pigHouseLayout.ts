/**
 * 豬屋（原本豬豬樹屋上的豬造型小屋，獨立放在綠球上）的佈局與外觀。
 * 調完可用面板「印出全部佈局」、再貼回 PIG_HOUSE_PLACEMENTS。
 */
export type PigHouseLayout = {
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 往球裡沉多少（負值 = 浮起來） */
  sink: number;
  /** 整體縮放 */
  placementScale: number;
  /** 模型單位 → 世界單位（身體半徑 0.4 個模型單位） */
  size: number;
  /** 身體顏色（鼻子、耳朵、門廊用它的深淺變化） */
  bodyColor: string;
  /** 耳朵前後：往前（+）／往後（−）繞頭的角度（°），左右耳鏡射對稱 */
  earForward: number;
  /** 耳朵厚度倍率 */
  earThickness: number;
  /** 耳朵大小倍率 */
  earSize: number;
  /** 鼻子不定時噴冰塊（卡通冰塊＋星星閃光） */
  iceEnabled: boolean;
  /** 平均幾秒噴一次（實際會前後隨機 ±50%） */
  iceInterval: number;
  /** 每次噴幾顆 */
  iceCount: number;
  /** 噴的力道倍率 */
  iceSpeed: number;
  /** 亮度。1 = 原色 */
  colorBoost: number;
};

// 沿用豬豬樹屋最後的設定：粉紅色、耳朵、大小（0.15 × 0.85 × 0.84 ≈ 0.107）；位置移到綠球右前方空地（原樹墩那塊），門朝鏡頭偏一點成 3/4 視角
export const PIG_HOUSE_LAYOUT_DEFAULT: PigHouseLayout = {
  angleFromTopDegrees: 40,
  azimuthDegrees: 36,
  spinDegrees: 60,
  sink: 0.004,
  placementScale: 1,
  size: 0.107,
  bodyColor: '#ff9eb6',
  earForward: -19,
  earThickness: 2.6,
  earSize: 0.73,
  iceEnabled: true,
  iceInterval: 4,
  iceCount: 10,
  iceSpeed: 1,
  colorBoost: 1.11,
};

export type PigHousePlacement = PigHouseLayout & { id: string };

export const PIG_HOUSE_PLACEMENTS: PigHousePlacement[] = [
  {
    id: 'pig_house_2',
    angleFromTopDegrees: 38,
    azimuthDegrees: 34,
    spinDegrees: 24,
    sink: 0.004,
    placementScale: 1,
    size: 0.107,
    bodyColor: '#ffbdce',
    earForward: -19,
    earThickness: 2.6,
    earSize: 0.73,
  iceEnabled: true,
  iceInterval: 4,
  iceCount: 10,
  iceSpeed: 1,
    colorBoost: 0.95,
  },
];
