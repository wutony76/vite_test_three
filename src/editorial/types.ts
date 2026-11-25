/** 原圖像素座標（y 向下，與照片一致） */
export type PixelPoint = { x: number; y: number }

/**
 * 單眼素材描述（由 tools/bakePortraitLayers.ts 產生）。
 * 全部用「原圖像素」：換照片時只看照片座標就能對位，不用換算 UV。
 */
export type EyeManifest = {
  /** 虹膜層與眼眶遮罩共用的矩形（原圖像素） */
  rect: { x: number; y: number; w: number; h: number }
  /** 虹膜中心（原圖像素），也是視線方向的錨點 */
  iris: PixelPoint
  /** 虹膜最大位移（原圖像素）；x 大、y 小，眼睛才不會上下翻白眼 */
  maxOffset: PixelPoint
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
