/**
 * 布丁在綠球上的佈局。在面板調好後，把 console 印出的區塊整段貼回這裡即可寫死。
 */
export type PuddingLayout = {
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  sink: number;
  placementScale: number;
  /** 模型最長邊（世界單位） */
  modelSize: number;
  /** Q 彈晃動整體強度 */
  jiggleStrength: number;
  /** Q 彈晃動速度倍率 */
  jiggleSpeed: number;
};

/** 新增布丁時套用的預設（單顆模板） */
export const PUDDING_LAYOUT_DEFAULT: PuddingLayout = {
  angleFromTopDegrees: 16,
  azimuthDegrees: -28,
  spinDegrees: 42,
  sink: 0.01,
  placementScale: 1,
  modelSize: 0.13,
  jiggleStrength: 1,
  jiggleSpeed: 1,
};

export type PuddingPlacement = PuddingLayout & { id: string };

/** 場景啟動時要種幾顆、各在哪裡 */
export const PUDDING_PLACEMENTS: PuddingPlacement[] = [
  {
    id: 'pudding_1',
    angleFromTopDegrees: 42,
    azimuthDegrees: -40,
    spinDegrees: 42,
    sink: 0.003,
    placementScale: 0.85,
    modelSize: 0.13,
    jiggleStrength: 1,
    jiggleSpeed: 1,
  },
  {
    id: 'pudding_2',
    angleFromTopDegrees: 40,
    azimuthDegrees: -49,
    spinDegrees: 42,
    sink: 0.003,
    placementScale: 0.53,
    modelSize: 0.13,
    jiggleStrength: 1,
    jiggleSpeed: 1,
  },
  {
    id: 'pudding_3',
    angleFromTopDegrees: 41,
    azimuthDegrees: 37,
    spinDegrees: 42,
    sink: 0.001,
    placementScale: 0.29,
    modelSize: 0.13,
    jiggleStrength: 1,
    jiggleSpeed: 1,
  },
  {
    id: 'pudding_4',
    angleFromTopDegrees: 34,
    azimuthDegrees: 146,
    spinDegrees: 42,
    sink: 0.01,
    placementScale: 1.35,
    modelSize: 0.13,
    jiggleStrength: 1,
    jiggleSpeed: 1,
  },
  {
    id: 'pudding_5',
    angleFromTopDegrees: 45,
    azimuthDegrees: 175,
    spinDegrees: 42,
    sink: -0.001,
    placementScale: 0.35,
    modelSize: 0.13,
    jiggleStrength: 1,
    jiggleSpeed: 1,
  },
];
