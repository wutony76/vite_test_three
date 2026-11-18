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
  /** 蛋白自發光（乘 emissiveBoost 前） */
  whiteGlow: number;
  /** 蛋黃自發光（乘 emissiveBoost 前） */
  yolkGlow: number;
  /** 蛋黃表面那層「油亮」清漆：0 = 關，1 = 最亮 */
  yolkClearcoat: number;
  /** 清漆粗糙度：越小高光越銳利 */
  yolkClearcoatRoughness: number;
  /** 蛋黃邊緣往深橘壓暗的強度（中心黃 → 邊緣橘） */
  yolkRimStrength: number;
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
  /** 舊版蛋白 0.38、蛋黃 0.52（× boost），整片過曝成平面；降一點，讓燈光和反射透出立體感 */
  whiteGlow: 0.3,
  yolkGlow: 0.38,
  yolkClearcoat: 1,
  yolkClearcoatRoughness: 0.06,
  yolkRimStrength: 0.6,
};

export type FriedEggPlacement = FriedEggLayout & { id: string };

export const FRIED_EGG_PLACEMENTS: FriedEggPlacement[] = [
  {
    id: 'egg_sun',
    ...FRIED_EGG_SUN_DEFAULT,
  },
];
