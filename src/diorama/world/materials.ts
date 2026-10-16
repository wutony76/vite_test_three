// 整個場景共用的材質：同樣外觀只建一個（電影院範例學到的「有幾種外觀就建幾個材質」）
import * as THREE from 'three'
import * as tex from './textures'

// 會隨日夜改變亮度的材質：晚上亮、白天暗
// nightness：0 = 白天、1 = 晚上
export type Glow = (nightness: number) => void

const std = (params: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(params)

export function createMaterials() {
  const glows: Glow[] = []

  // 自發光材質：emissiveIntensity 在白天 day、晚上 night 之間變化
  // 數值 > 1 會超過螢幕亮度上限，Bloom 後製就會讓它「暈開」發光
  const glowing = (params: THREE.MeshStandardMaterialParameters, day: number, night: number) => {
    const material = std(params)
    glows.push((n) => (material.emissiveIntensity = THREE.MathUtils.lerp(day, night, n)))
    return material
  }

  const signMap = tex.signTexture()
  const bladeMap = tex.bladeSignTexture()

  const materials = {
    brick: std({ map: tex.brickTexture(), roughness: 0.92 }),
    concrete: std({ color: 0x8d8a84, roughness: 0.95 }),
    slab: std({ color: 0x4a4641, roughness: 1 }),
    paving: std({ map: tex.pavingTexture(), roughness: 0.95 }),
    trim: std({ color: 0x1f4a3a, roughness: 0.55 }),
    cream: std({ color: 0xe9dfc8, roughness: 0.8 }),
    wood: std({ color: 0x8a5a3b, roughness: 0.75 }),
    darkWood: std({ color: 0x4a2f1f, roughness: 0.8 }),
    metal: std({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.35 }),
    darkMetal: std({ color: 0x3a3f45, metalness: 0.5, roughness: 0.5 }),
    stainless: std({ color: 0xc9ced3, metalness: 0.85, roughness: 0.28 }),
    asphalt: std({ color: 0x2b2d33, roughness: 0.95 }),
    ground: std({ color: 0x3a3c4c, roughness: 1 }),
    lineWhite: std({ color: 0xe9e6dd, roughness: 0.7 }),
    curb: std({ color: 0x9b978f, roughness: 0.9 }),
    windowDark: std({ color: 0x1c222b, roughness: 0.15, metalness: 0.2 }),
    curtain: std({ color: 0xb9a27c, roughness: 0.9 }),
    sack: std({ map: tex.sackTexture(), roughness: 1 }),
    burlap: std({ color: 0xa88556, roughness: 1 }),
    // flatShading：每個面一個顏色，低多邊形的「切面」風格
    leaf: std({ color: 0x5f8f3e, roughness: 0.8, flatShading: true }),
    leafLight: std({ color: 0x86ad4c, roughness: 0.8, flatShading: true }),
    blossom: std({ color: 0xf2c46d, roughness: 0.7, flatShading: true }),
    trunk: std({ color: 0x5a3d2a, roughness: 0.9 }),
    scooter: std({ color: 0x9fd3c7, roughness: 0.35, metalness: 0.1 }),
    seat: std({ color: 0x5a3b2a, roughness: 0.6 }),
    tire: std({ color: 0x1d1d1f, roughness: 0.9 }),
    catOrange: std({ color: 0xe0913f, roughness: 0.85 }),
    catGrey: std({ color: 0x8b8f96, roughness: 0.85 }),
    catWhite: std({ color: 0xf1ede6, roughness: 0.85 }),
    acBody: std({ color: 0xd7d9d6, roughness: 0.6 }),
    acGrill: std({ map: tex.fanGrillTexture(), roughness: 0.6 }),
    chalkboard: std({ map: tex.chalkboardTexture(), roughness: 0.9 }),
    awning: std({ map: tex.awningTexture(), roughness: 0.85, side: THREE.DoubleSide }),
    neonBack: std({ color: 0x15171b, roughness: 0.6 }),

    // ── 晚上會亮的 ──
    // 一樓櫥窗：暖色燈光從店裡透出來
    shopGlass: glowing({ color: 0x1a120c, emissive: 0xffb46a, roughness: 0.2 }, 0.15, 1.6),
    // 二樓窗：烘豆室的燈
    windowLit: glowing({ color: 0x241a12, emissive: 0xffc98a, roughness: 0.2 }, 0.1, 1.4),
    // 店招燈箱：map 和 emissiveMap 用同一張圖 → 字和底色都會發光
    sign: glowing({ map: signMap, emissiveMap: signMap, emissive: 0xffffff, roughness: 0.5 }, 0, 0.9),
    bladeSign: glowing({ map: bladeMap, emissiveMap: bladeMap, emissive: 0xffffff, roughness: 0.5 }, 0, 0.8),
    bulb: glowing({ color: 0xfff3dc, emissive: 0xffd59a }, 0.2, 3),
    lampHead: glowing({ color: 0xfff3dc, emissive: 0xffd8a0 }, 0.1, 3.5),
    headlight: glowing({ color: 0xfffbe8, emissive: 0xfff4d6 }, 0.1, 2),
  }

  // 霓虹燈管：MeshBasicMaterial 不受光影響，顏色直接乘上倍數讓亮度超過 1 → Bloom 光暈
  // （由 World 依日夜與閃爍設定亮度，所以不放進 glows）
  const neon = {
    pink: new THREE.MeshBasicMaterial({ color: 0xff3d6e }),
    cyan: new THREE.MeshBasicMaterial({ color: 0x5ef0ff }),
    pinkBase: new THREE.Color(0xff3d6e),
    cyanBase: new THREE.Color(0x5ef0ff),
  }

  const softDot = tex.softDotTexture()

  function dispose() {
    for (const material of [...Object.values(materials), neon.pink, neon.cyan]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose()
      material.dispose()
    }
    softDot.dispose()
  }

  return { ...materials, neon, softDot, glows, dispose }
}

export type Materials = ReturnType<typeof createMaterials>
