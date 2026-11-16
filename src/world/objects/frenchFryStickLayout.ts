/** 單根薯條在綠球上的佈局（無紙盒）。 */
export type FrenchFryStickLayout = {
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  tiltXDegrees: number;
  tiltZDegrees: number;
  sink: number;
  placementScale: number;
  modelSize: number;
  colorBoost: number;
  tintColor: string;
  tintMix: number;
};

export const FRENCH_FRY_STICK_LAYOUT_DEFAULT: FrenchFryStickLayout = {
  angleFromTopDegrees: 42,
  azimuthDegrees: 144,
  spinDegrees: -40,
  tiltXDegrees: -3,
  tiltZDegrees: 6,
  sink: -0.003,
  placementScale: 0.45,
  modelSize: 0.075,
  colorBoost: 1.05,
  tintColor: '#f5c84a',
  tintMix: 0.35,
};

export type FrenchFryStickPlacement = FrenchFryStickLayout & { id: string };

export const FRENCH_FRY_STICK_PLACEMENTS: FrenchFryStickPlacement[] = [
  {
    id: 'french_fry_3',
    angleFromTopDegrees: 44,
    azimuthDegrees: 143,
    spinDegrees: -40,
    tiltXDegrees: -3,
    tiltZDegrees: 6,
    sink: -0.003,
    placementScale: 0.45,
    modelSize: 0.075,
    colorBoost: 1.05,
    tintColor: '#f5c84a',
    tintMix: 0.35,
  },
  {
    id: 'french_fry_2',
    angleFromTopDegrees: 42,
    azimuthDegrees: 144,
    spinDegrees: -40,
    tiltXDegrees: -3,
    tiltZDegrees: 6,
    sink: -0.003,
    placementScale: 0.45,
    modelSize: 0.075,
    colorBoost: 1.05,
    tintColor: '#f5c84a',
    tintMix: 0.35,
  },
];