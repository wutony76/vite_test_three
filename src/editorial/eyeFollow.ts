import * as THREE from 'three'
import type { PortraitLookLayout, PortraitManifest } from './types'

const _target = new THREE.Vector2()

export type EyeOffsets = { left: THREE.Vector2; right: THREE.Vector2 }

/** 視埠 NDC 目標 → 世界座標平面上的虹膜位移（整塊眼圖層移動） */
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
  _target.set(mx, my)

  const gain = manifest.look?.gain ?? 0.85
  const stereo = manifest.look?.stereo ?? 0.94
  const { planeW, planeH, halfW, halfH } = layout

  const fill = (eye: 'leftEye' | 'rightEye', out: THREE.Vector2) => {
    const spec = manifest[eye]
    const anchorX = ((spec.centerU - 0.5) * planeW) / halfW
    const anchorY = ((0.5 - spec.centerV) * planeH) / halfH
    const dirX = _target.x - anchorX
    const dirY = _target.y - anchorY
    const len = Math.hypot(dirX, dirY)
    if (len < 1e-5) return

    const maxWorld = spec.maxOffsetUv * planeW
    const scale = Math.min(len * gain, 1) * maxWorld
    out.set((dirX / len) * scale, (dirY / len) * scale)
  }

  fill('leftEye', left)
  fill('rightEye', right)
  right.multiplyScalar(stereo)

  return { left, right }
}