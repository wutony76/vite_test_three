/**
 * 芭蕉葉叢（綠球上的獨立物件）的佈局與外觀。調完可用面板「印出全部佈局」、再貼回 BANANA_LEAF_CLUSTER_PLACEMENTS。
 */

/**
 * 一片芭蕉葉（操作中心點在葉片中心）。座標是相對於葉叢中間那顆「隱形參考橢球」：
 *   azimuth / elevation：葉片中心「掛」在橢球表面哪一點上方（0° = 正面、90° = 右邊；仰角 0° = 腰、90° = 頂）
 *   lift：葉片中心離橢球表面多遠（沿表面法線，模型單位）
 *   rise：葉片中心再往正上方浮多少（垂直，模型單位；負值往下）
 *   tilt：從垂直往外倒幾度；yaw：以表面法線為軸左右轉；roll：繞葉脈自轉；
 *   pitch：向下旋轉（繞葉片寬度方向的軸，正值 = 葉尖往下）——全部都繞葉片中心轉
 *   length / width：長、寬（模型單位）；droop：下垂 0 ~ 1.2
 */
export type BananaLeafLayout = {
  azimuth: number;
  elevation: number;
  lift: number;
  rise: number;
  tilt: number;
  yaw: number;
  roll: number;
  pitch: number;
  length: number;
  width: number;
  droop: number;
  color: string;
};

export type BananaLeafClusterLayout = {
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 往球裡沉多少（負值 = 浮起來） */
  sink: number;
  /** 整體縮放 */
  placementScale: number;
  /** 模型單位 → 世界單位（再乘 placementScale） */
  size: number;
  /** 整組繞葉叢中心左右旋轉（°） */
  groupYaw: number;
  /** 整組前後傾（°） */
  groupTiltX: number;
  /** 整組左右傾（°） */
  groupTiltZ: number;
  /** 整組放大倍率 */
  groupScale: number;
  /** 整組上升（+）／下降（−），模型單位 */
  groupRise: number;
  /** 亮度。1 = 原色 */
  colorBoost: number;
  /** 每一片葉子（可單獨點選、拖曳、編輯、複製、移除） */
  leaves: BananaLeafLayout[];
};

export const BANANA_LEAF_CLUSTER_DEFAULT: BananaLeafClusterLayout = {
  angleFromTopDegrees: 42,
  azimuthDegrees: 28,
  spinDegrees: 0,
  sink: 0.003,
  placementScale: 1,
  size: 0.15,
  groupYaw: 0,
  groupTiltX: 0,
  groupTiltZ: 0,
  groupScale: 1,
  groupRise: 0,
  colorBoost: 1,
  // 6 片大芭蕉葉排成 A 字葉棚（前後斜面各 3 片），沿用原本長在豬屋上的設定
  leaves: [
    { azimuth: -33, elevation: 43, lift: 0.24, rise: 0.003, tilt: 150, yaw: 24, roll: -14, pitch: 0, length: 0.5, width: 0.36, droop: 0.15, color: '#6fb442' },
    { azimuth: 0, elevation: 71, lift: 0.349, rise: 0.001, tilt: 142, yaw: 0, roll: 0, pitch: 0, length: 0.78, width: 0.36, droop: 0.15, color: '#79bb47' },
    { azimuth: 50, elevation: 62, lift: 0.383, rise: 0.003, tilt: 145, yaw: -32, roll: 14, pitch: 0, length: 0.78, width: 0.36, droop: 0.15, color: '#68ab3d' },
    { azimuth: -130, elevation: 62, lift: 0.383, rise: 0.003, tilt: 145, yaw: -32, roll: 14, pitch: 0, length: 0.78, width: 0.36, droop: 0.15, color: '#72b443' },
    { azimuth: -180, elevation: 71, lift: 0.349, rise: 0.001, tilt: 142, yaw: 0, roll: 0, pitch: 0, length: 0.78, width: 0.36, droop: 0.15, color: '#6aaf40' },
    { azimuth: 130, elevation: 62, lift: 0.383, rise: 0.003, tilt: 145, yaw: 32, roll: -14, pitch: 0, length: 0.78, width: 0.36, droop: 0.15, color: '#7dbf4b' },
  ],
};

export type BananaLeafClusterPlacement = BananaLeafClusterLayout & { id: string };

export const BANANA_LEAF_CLUSTER_PLACEMENTS: BananaLeafClusterPlacement[] = [
  {
    id: 'banana_leaves_1',
    angleFromTopDegrees: 45,
    azimuthDegrees: 52,
    spinDegrees: -12,
    sink: 0.003,
    placementScale: 1.39,
    size: 0.125,
    groupYaw: 0,
    groupTiltX: 17,
    groupTiltZ: 0,
    groupScale: 1.0,
    groupRise: -0.255,
    colorBoost: 1.0,
    leaves: [
      { azimuth: -130, elevation: 62, lift: 0.383, rise: 0.003, tilt: 145, yaw: -32, roll: 14, pitch: 0, length: 0.78, width: 0.36, droop: 0.15, color: '#72b443' },
      { azimuth: -180, elevation: 71, lift: 0.349, rise: 0.001, tilt: 142, yaw: 0, roll: 0, pitch: 0, length: 0.78, width: 0.36, droop: 0.15, color: '#6aaf40' },
      { azimuth: 130, elevation: 62, lift: 0.383, rise: 0.003, tilt: 145, yaw: 32, roll: -14, pitch: 0, length: 0.78, width: 0.36, droop: 0.15, color: '#7dbf4b' },
    ],
  },
];
