/** 綠球表面擺放 */
export type FriedEggSphereLayout = {
  mode: 'sphere';
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  sink: number;
  placementScale: number;
  /** 模型最長邊（世界單位） */
  modelSize: number;
};

/** 掛在房子局部座標（底部中心為原點，+Y 向屋頂） */
export type FriedEggAttachLayout = {
  mode: 'attach';
  hostLabel: 'Gamehall';
  localX: number;
  localY: number;
  localZ: number;
  spinDegrees: number;
  placementScale: number;
  modelSize: number;
};

/**
 * 蛋形太陽：與彩虹相同，在鏡頭座標系下偏移（camZ 愈負愈遠），每幀面朝鏡頭。
 */
export type FriedEggSunLayout = {
  mode: 'sun';
  camX: number;
  camY: number;
  camZ: number;
  /** 鏡頭本地額外自轉（度） */
  spinDegrees: number;
  placementScale: number;
  modelSize: number;
  lightIntensity: number;
  emissiveBoost: number;
  /** Q 彈抖動（同布丁，蛋形太陽預設較慢） */
  jiggleStrength: number;
  jiggleSpeed: number;
  /** 蛋白金屬感 */
  whiteMetalness: number;
  whiteRoughness: number;
  whiteEnvIntensity: number;
};

export type FriedEggLayout = FriedEggSphereLayout | FriedEggAttachLayout | FriedEggSunLayout;

/** 初視：鏡頭右上空域（GUI 調參後預設） */
export const FRIED_EGG_SUN_DEFAULT: FriedEggSunLayout = {
  mode: 'sun',
  camX: 1.7,
  camY: 3.24,
  camZ: -10.5,
  spinDegrees: 0,
  placementScale: 2.71,
  modelSize: 0.14,
  lightIntensity: 1.45,
  emissiveBoost: 2.25,
  jiggleStrength: 0.92,
  jiggleSpeed: 0.34,
  /** 熟蛋白：非金屬、偏霧面 */
  whiteMetalness: 0,
  whiteRoughness: 0.38,
  whiteEnvIntensity: 0.62,
};

export type FriedEggPlacement = FriedEggLayout & { id: string };

export const FRIED_EGG_PLACEMENTS: FriedEggPlacement[] = [
  {
    id: 'egg_sun',
    ...FRIED_EGG_SUN_DEFAULT,
  },
];
