/**
 * 樹墩在綠球上的佈局與外觀。調完可用面板「印出全部佈局」、再貼回 TREE_STUMP_PLACEMENTS。
 *
 * 尺寸分三層（跟檸檬片一樣的概念，再多了「寬、深、高」各自拉）：
 *   modelSize      → 模型基準寬度（世界單位）
 *   placementScale → 整體縮放（長寬高一起）
 *   width/depth/heightScale → 只拉某一軸；紋路是 shader 即時算的，拉多寬都不會糊
 */
export type TreeStumpLayout = {
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 貼地後繞局部 X 傾斜 */
  tiltXDegrees: number;
  /** 貼地後繞局部 Z 傾斜 */
  tiltZDegrees: number;
  /** 往球裡沉多少（負值 = 浮起來） */
  sink: number;
  /** 整體縮放（長寬高一起） */
  placementScale: number;
  /** 樹墩底寬（世界單位），再乘 placementScale */
  modelSize: number;
  /** 左右變寬（局部 X）。1 = 原寬 */
  widthScale: number;
  /** 前後變厚（局部 Z）。1 = 原深 */
  depthScale: number;
  /** 變高（局部 Y）。1 = 原高 */
  heightScale: number;
  /** 切面上的年輪圈數（拉大後想要更細的年輪就調多一點） */
  ringCount: number;
  /** 左下那截小樹枝 */
  showBranch: boolean;
  /** 造型種子：同樣的設定換個種子，樹皮紋、切口高低、裂縫位置都不一樣 */
  seed: number;
  /** 亮度。1 = 原色 */
  colorBoost: number;
  /** 染色；tintMix 為 0 時看不出來 */
  tintColor: string;
  /** 0 = 原色，1 = 完全染成 tintColor */
  tintMix: number;
};

export const TREE_STUMP_LAYOUT_DEFAULT: TreeStumpLayout = {
  angleFromTopDegrees: 40,
  azimuthDegrees: 35,
  spinDegrees: 20,
  tiltXDegrees: 0,
  tiltZDegrees: 0,
  sink: 0.003,
  placementScale: 1,
  modelSize: 0.085,
  widthScale: 1,
  depthScale: 1,
  heightScale: 1,
  ringCount: 9,
  showBranch: true,
  seed: 1,
  colorBoost: 1,
  tintColor: '#806652',
  tintMix: 0,
};

export type TreeStumpPlacement = TreeStumpLayout & { id: string };

export const TREE_STUMP_PLACEMENTS: TreeStumpPlacement[] = [
  {
    id: 'tree_stump_1',
    angleFromTopDegrees: 43,
    azimuthDegrees: 48,
    spinDegrees: 20,
    tiltXDegrees: 0,
    tiltZDegrees: 0,
    sink: 0.049,
    placementScale: 1,
    modelSize: 0.085,
    widthScale: 1.65,
    depthScale: 2.1,
    heightScale: 1.3,
    ringCount: 9,
    showBranch: true,
    seed: 1,
    colorBoost: 1,
    tintColor: '#806652',
    tintMix: 0,
  },
  {
    id: 'tree_stump_2',
    angleFromTopDegrees: 42,
    azimuthDegrees: 55,
    spinDegrees: -63,
    tiltXDegrees: 0,
    tiltZDegrees: 0,
    sink: 0.026,
    placementScale: 1,
    modelSize: 0.085,
    widthScale: 1,
    depthScale: 1,
    heightScale: 1.3,
    ringCount: 9,
    showBranch: true,
    seed: 1,
    colorBoost: 1,
    tintColor: '#806652',
    tintMix: 0,
  },
];