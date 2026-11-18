/**
 * 薯條（紙盒 + 薯條）在綠球上的佈局。調完可用面板印出、再貼回這裡。
 */
export type FrenchFriesLayout = {
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 貼地後繞局部 X 傾斜。≈90 時紙盒躺下 */
  tiltXDegrees: number;
  /** 貼地後繞局部 Z 傾斜 */
  tiltZDegrees: number;
  sink: number;
  placementScale: number;
  /** 模型最長邊（世界單位） */
  modelSize: number;
  colorBoost: number;
  tintColor: string;
  tintMix: number;
};

export const FRENCH_FRIES_LAYOUT_DEFAULT: FrenchFriesLayout = {
  angleFromTopDegrees: 32,
  azimuthDegrees: -32,
  spinDegrees: -31,
  tiltXDegrees: 0,
  tiltZDegrees: 0,
  sink: 0.029,
  placementScale: 0.39,
  modelSize: 0.12,
  colorBoost: 1.02,
  tintColor: '#41c391',
  tintMix: 0.29,
};

export type FrenchFriesPlacement = FrenchFriesLayout & { id: string };

export const FRENCH_FRIES_PLACEMENTS: FrenchFriesPlacement[] = [
  {
    id: 'french_fries_1',
    angleFromTopDegrees: 32,
    azimuthDegrees: -32,
    spinDegrees: -31,
    tiltXDegrees: 0,
    tiltZDegrees: 0,
    sink: 0.029,
    placementScale: 0.39,
    modelSize: 0.120,
    colorBoost: 1.02,
    tintColor: '#41c391',
    tintMix: 0.29,
  },
  {
    id: 'french_fries_2',
    angleFromTopDegrees: 41,
    azimuthDegrees: 10,
    spinDegrees: -31,
    tiltXDegrees: 0,
    tiltZDegrees: 0,
    sink: 0.029,
    placementScale: 0.39,
    modelSize: 0.120,
    colorBoost: 1.02,
    tintColor: '#0af5a7',
    tintMix: 0.92,
  },
  {
    id: 'french_fries_3',
    angleFromTopDegrees: 41,
    azimuthDegrees: -53,
    spinDegrees: 84,
    tiltXDegrees: 0,
    tiltZDegrees: 0,
    sink: 0.029,
    placementScale: 0.39,
    modelSize: 0.120,
    colorBoost: 1.02,
    tintColor: '#f20707',
    tintMix: 0.91,
  },
  {
    id: 'french_fries_4',
    angleFromTopDegrees: 7,
    azimuthDegrees: 14,
    spinDegrees: 84,
    tiltXDegrees: 0,
    tiltZDegrees: 0,
    sink: 0.029,
    placementScale: 0.39,
    modelSize: 0.120,
    colorBoost: 1.02,
    tintColor: '#dc0aeb',
    tintMix: 0.94,
  },
  {
    id: 'french_fries_5',
    angleFromTopDegrees: 28,
    azimuthDegrees: 49,
    spinDegrees: 84,
    tiltXDegrees: 0,
    tiltZDegrees: 0,
    sink: 0.029,
    placementScale: 0.39,
    modelSize: 0.120,
    colorBoost: 1.02,
    tintColor: '#fff700',
    tintMix: 0.86,
  },
  {
    id: 'french_fries_6',
    angleFromTopDegrees: 36,
    azimuthDegrees: 132,
    spinDegrees: 84,
    tiltXDegrees: 0,
    tiltZDegrees: 0,
    sink: 0.029,
    placementScale: 0.39,
    modelSize: 0.120,
    colorBoost: 1.02,
    tintColor: '#ec0909',
    tintMix: 0.92,
  },
  {
    id: 'french_fries_7',
    angleFromTopDegrees: 33,
    azimuthDegrees: -155,
    spinDegrees: 84,
    tiltXDegrees: 0,
    tiltZDegrees: 0,
    sink: 0.029,
    placementScale: 0.39,
    modelSize: 0.120,
    colorBoost: 1.02,
    tintColor: '#f312eb',
    tintMix: 0.90,
  },
  {
    id: 'french_fries_8',
    angleFromTopDegrees: 46,
    azimuthDegrees: 154,
    spinDegrees: 84,
    tiltXDegrees: 0,
    tiltZDegrees: 0,
    sink: 0.029,
    placementScale: 0.39,
    modelSize: 0.120,
    colorBoost: 1.02,
    tintColor: '#f8fd08',
    tintMix: 0.92,
  },
  {
    id: 'french_fries_9',
    angleFromTopDegrees: 7,
    azimuthDegrees: -81,
    spinDegrees: 1,
    tiltXDegrees: 0,
    tiltZDegrees: 0,
    sink: 0.029,
    placementScale: 0.39,
    modelSize: 0.120,
    colorBoost: 1.02,
    tintColor: '#076bed',
    tintMix: 0.94,
  },
];