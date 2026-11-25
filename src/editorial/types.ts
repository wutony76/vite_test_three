export type EyeManifest = {
  centerU: number
  centerV: number
  radiusUv: number
  maxOffsetUv: number
}

export type PortraitManifest = {
  version: number
  sourceSize: { width: number; height: number }
  planeHeight: number
  leftEye: EyeManifest
  rightEye: EyeManifest
  look?: { gain?: number; stereo?: number }
}

export type PortraitLookLayout = {
  planeW: number
  planeH: number
  halfW: number
  halfH: number
}

export const PORTRAIT_ASSET_BASE = `${import.meta.env.BASE_URL}images/portrait`