import * as THREE from 'three'
import type { PortraitLookLayout, PortraitManifest } from './types'

export type EyeOffsets = { left: THREE.Vector2; right: THREE.Vector2 }

/**
 * 滑鼠位置 → 每隻眼睛的虹膜位移（原圖像素，x 向右、y 向上）。
 *
 * 錨點用「虹膜中心」換算成畫面 NDC，方向 = 滑鼠 − 錨點。
 * 錨點若算錯（例如舊版眼心座標偏到眼睛下方）→ 滑鼠明明在眼睛正前方，眼神卻往上飄。
 */
export function computeEyeOffsets(
  clientX: number,
  clientY: number,
  viewport: DOMRect,
  manifest: PortraitManifest,
  layout: PortraitLookLayout,
  reducedMotion: boolean,
): EyeOffsets {
  const left = new THREE.Vector2()
  const right = new THREE.Vector2()
  if (reducedMotion || viewport.width < 1 || viewport.height < 1) {
    return { left, right }
  }

  const mx = ((clientX - viewport.left) / viewport.width) * 2 - 1
  const my = -((clientY - viewport.top) / viewport.height) * 2 + 1

  const gain = manifest.look?.gain ?? 0.9
  const stereo = manifest.look?.stereo ?? 0.94
  const { planeW, planeH, centerX, centerY, zoom } = layout
  // 相機若有放大（÷ zoom）或移動中心，錨點換算要跟著算，眼神才會對準滑鼠
  const halfW = layout.halfW / zoom
  const halfH = layout.halfH / zoom
  const { width: srcW, height: srcH } = manifest.sourceSize

  const fill = (eye: 'leftEye' | 'rightEye', out: THREE.Vector2) => {
    const spec = manifest[eye]
    // 原圖像素 → 世界座標 → 相機 NDC（正交相機：世界座標 / 半寬高）
    const anchorX = ((spec.iris.x / srcW - 0.5) * planeW - centerX) / halfW
    const anchorY = ((0.5 - spec.iris.y / srcH) * planeH - centerY) / halfH
    // 水平方向用畫面寬高比修正，讓「距離」在螢幕上是等比例的
    const dirX = (mx - anchorX) * (halfW / halfH)
    const dirY = my - anchorY
    const len = Math.hypot(dirX, dirY)
    if (len < 1e-5) return

    // 越遠看得越偏，到一定距離封頂；橢圓形上限（左右多、上下少）
    const amount = Math.min(len * gain * 2, 1)
    out.set((dirX / len) * amount * spec.maxOffset.x, (dirY / len) * amount * spec.maxOffset.y)
  }

  fill('leftEye', left)
  fill('rightEye', right)
  right.multiplyScalar(stereo)

  return { left, right }
}
