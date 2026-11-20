/**
 * 豬豬樹屋在綠球上的佈局與外觀。調完可用面板「印出全部佈局」、再貼回 TREE_HOUSE_PLACEMENTS。
 */
export type TreeHouseLayout = {
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 往球裡沉多少（負值 = 浮起來） */
  sink: number;
  /** 整體縮放 */
  placementScale: number;
  /** 整棵寬度（平台直徑，世界單位），再乘 placementScale */
  size: number;
  /** 豬屋佔平台的大小倍率 */
  houseScale: number;
  /** 樹幹支架高度倍率 */
  supportHeight: number;
  /** 木筏大小倍率（邊長、原木數、欄杆一起變） */
  raftSize: number;
  /** 樹幹粗細倍率 */
  trunkWidth: number;
  /** 樹幹造型種子 */
  trunkSeed: number;
  /** 豬屋身體顏色（鼻子、耳朵、門廊用它的深淺變化） */
  bodyColor: string;
  /** 耳朵前後：往前（+）／往後（−）繞頭的角度（°），左右耳鏡射對稱 */
  earForward: number;
  /** 耳朵厚度倍率 */
  earThickness: number;
  /** 耳朵大小倍率 */
  earSize: number;
  /** 豬屋在平台上左右移動（模型單位，+ = 右） */
  houseOffsetX: number;
  /** 豬屋在平台上前後移動（模型單位，+ = 往前／門口方向） */
  houseOffsetZ: number;
  /** 豬屋在平台上旋轉（°，從上往下看逆時針為正） */
  houseYaw: number;
  /** 亮度。1 = 原色 */
  colorBoost: number;
};

export const TREE_HOUSE_LAYOUT_DEFAULT: TreeHouseLayout = {
  angleFromTopDegrees: 35,
  azimuthDegrees: -6,
  spinDegrees: 100,
  sink: 0.004,
  placementScale: 1,
  size: 0.15,
  houseScale: 1,
  supportHeight: 1.3,
  raftSize: 1,
  trunkWidth: 1,
  trunkSeed: 3,
  bodyColor: '#eda592',
  earForward: -19,
  earThickness: 2.6,
  earSize: 0.91,
  houseOffsetX: 0,
  houseOffsetZ: 0,
  houseYaw: 0,
  colorBoost: 1,
};

export type TreeHousePlacement = TreeHouseLayout & { id: string };

export const TREE_HOUSE_PLACEMENTS: TreeHousePlacement[] = [
  {
    id: 'tree_house_1',
    angleFromTopDegrees: 46,
    azimuthDegrees: 56,
    spinDegrees: 100,
    sink: 0.004,
    placementScale: 0.85,
    size: 0.15,
    houseScale: 0.84,
    supportHeight: 1.3,
    raftSize: 1,
    trunkWidth: 1,
    trunkSeed: 3,
    bodyColor: '#ff9eb6',
    earForward: -19,
    earThickness: 2.6,
    earSize: 0.73,
    houseOffsetX: 0.175,
    houseOffsetZ: -0.07,
    houseYaw: -22,
    colorBoost: 1.11,
  },
];
