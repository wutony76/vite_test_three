/**
 * 糖果罐（柑仔店屋頂那罐的獨立版，放在綠球上）的佈局與外觀。
 * 調完可用面板「印出全部佈局」、再貼回 CANDY_JAR_PLACEMENTS。
 */
export type CandyJarLayout = {
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 往球裡沉多少（負值 = 浮起來） */
  sink: number;
  /** 整體縮放 */
  placementScale: number;
  /** 模型單位 → 世界單位（罐子高約 0.78 個模型單位） */
  size: number;
  /** 罐蓋、圓鈕的顏色（預設跟柑仔店的紅色遮雨棚一樣） */
  lidColor: string;
  /** 罐子裡幾顆糖球 */
  candyCount: number;
  /** 亮度。1 = 原色 */
  colorBoost: number;
};

export const CANDY_JAR_LAYOUT_DEFAULT: CandyJarLayout = {
  angleFromTopDegrees: 38,
  azimuthDegrees: -14,
  spinDegrees: 20,
  sink: 0.003,
  placementScale: 1,
  size: 0.11,
  lidColor: '#e8473f',
  candyCount: 110,
  colorBoost: 1,
};

export type CandyJarPlacement = CandyJarLayout & { id: string };

export const CANDY_JAR_PLACEMENTS: CandyJarPlacement[] = [
  {
    id: 'candy_jar_1',
    angleFromTopDegrees: 44,
    azimuthDegrees: 48,
    spinDegrees: 20,
    sink: -0.03,
    placementScale: 0.47,
    size: 0.11,
    lidColor: '#e8473f',
    candyCount: 110,
    colorBoost: 1.0,
  },
  {
    id: 'candy_jar_2',
    angleFromTopDegrees: 42,
    azimuthDegrees: 50,
    spinDegrees: 20,
    sink: -0.03,
    placementScale: 0.66,
    size: 0.11,
    lidColor: '#227aec',
    candyCount: 110,
    colorBoost: 1.0,
  },
  {
    id: 'candy_jar_3',
    angleFromTopDegrees: 44,
    azimuthDegrees: 60,
    spinDegrees: 20,
    sink: 0.003,
    placementScale: 0.66,
    size: 0.11,
    lidColor: '#ecd122',
    candyCount: 110,
    colorBoost: 1.0,
  },
];
