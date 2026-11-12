export type FlowerStyleSettings = {
  size: number;
  petalColor: string;
  centerColor: string;
};

export type GroundFlowerSettings = {
  count: number;
  seed: number;
  sizeVariation: number;
  lift: number;
  frontShare: number;
  viewFocus: number;
  viewConeDegrees: number;
  styleBRatio: number;
  styleA: FlowerStyleSettings;
  styleB: FlowerStyleSettings;
};

/** 面板調定後寫入的預設（2026-11-12） */
export const DEFAULT_GROUND_FLOWER_SETTINGS: GroundFlowerSettings = {
  count: 128,
  seed: 73160,
  sizeVariation: 0.5,
  lift: 0.0012,
  frontShare: 0.5,
  viewFocus: 0.88,
  viewConeDegrees: 52,
  styleBRatio: 0.35,
  styleA: {
    size: 0.35,
    petalColor: '#fff6ee',
    centerColor: '#ffcf5e',
  },
  styleB: {
    size: 0.46,
    petalColor: '#ece389',
    centerColor: '#ffa985',
  },
};
