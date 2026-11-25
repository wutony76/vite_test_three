/**
 * 整套技能配色：火焰（火苗、火星、燒痕火邊、自燃火線）、雷射（光束、眼睛光芒、命中衝擊波）、寫輪眼虹膜。
 *
 * 切換：改 FIRE_THEME 這一行就好，shader 會在建立時把顏色寫進去。
 * - 'classic'：卡通橘紅火＋紅色寫輪眼與紅色雷射
 * - 'black'：黑焰——火是黑色帶暗紫光，雷射與寫輪眼都改成紫色系
 *
 * 顏色都是 0..1 的 RGB。火焰層的顏色是「直接輸出到畫面」的值（那個 shader 不做色彩空間轉換）；
 * 寫輪眼（sharingan*）畫在人像上，會經過 tone mapping，所以是線性值（看起來會比數字亮一些）。
 */
export type FireTheme = 'classic' | 'black'
export const FIRE_THEME: FireTheme = 'black'

type Rgb = [number, number, number]

type FirePalette = {
  /** 火苗方塊：剛冒出 → 飄到一半 → 快消失 */
  flameYoung: Rgb
  flameMid: Rgb
  flameOld: Rgb
  /** 火苗方塊的描邊顏色與粗細（0 = 不描邊；黑焰用暗紫邊把黑色方塊襯出「火」的輪廓） */
  flameEdge: Rgb
  flameEdgeWidth: number
  /** 火星菱形：中心、外圈（落點噴出的火星，以及自燃時火線冒的火花共用） */
  sparkInner: Rgb
  sparkOuter: Rgb
  /** 燒痕洞口的火邊與自燃火線：外圈、內圈 */
  rimOuter: Rgb
  rimInner: Rgb
  /** 雷射橫切面：亮芯、光束本體、本體上流動的亮紋、黑描邊、外圈光暈 */
  laserCore: Rgb
  laserBody: Rgb
  laserFlow: Rgb
  laserOutline: Rgb
  laserGlow: Rgb
  /** 眼睛光芒：尖刺外色、中心色 */
  flareOuter: Rgb
  flareInner: Rgb
  /** 命中衝擊波：剛出現 → 消失前 */
  ringStart: Rgb
  ringEnd: Rgb
  /** 寫輪眼虹膜漸層：靠瞳孔（亮）→ 外圈（暗），線性值 */
  sharinganInner: Rgb
  sharinganOuter: Rgb
}

const PALETTES: Record<FireTheme, FirePalette> = {
  classic: {
    flameYoung: [1.0, 0.95, 0.62],
    flameMid: [1.0, 0.58, 0.15],
    flameOld: [0.85, 0.2, 0.08],
    flameEdge: [0, 0, 0],
    flameEdgeWidth: 0,
    sparkInner: [1.0, 0.95, 0.6],
    sparkOuter: [1.0, 0.7, 0.2],
    rimOuter: [1.0, 0.46, 0.08],
    rimInner: [1.0, 0.85, 0.25],
    laserCore: [1.0, 0.97, 0.95],
    laserBody: [0.86, 0.06, 0.05],
    laserFlow: [1.0, 0.5, 0.4],
    laserOutline: [0.07, 0.0, 0.0],
    laserGlow: [0.85, 0.05, 0.04],
    flareOuter: [0.92, 0.08, 0.05],
    flareInner: [1.0, 1.0, 1.0],
    ringStart: [1.0, 1.0, 1.0],
    ringEnd: [0.95, 0.12, 0.06],
    sharinganInner: [0.75, 0.02, 0.02],
    sharinganOuter: [0.28, 0.0, 0.0],
  },
  black: {
    // 單色方塊、不描邊：每顆火苗整顆一個顏色，隨燃燒時間 暗紫紅 → 深紫 → 黑 漸變
    flameYoung: [0.36, 0.06, 0.3],
    flameMid: [0.1, 0.02, 0.12],
    flameOld: [0.01, 0.0, 0.015],
    flameEdge: [0, 0, 0],
    flameEdgeWidth: 0,
    sparkInner: [0.48, 0.12, 0.52],
    sparkOuter: [0.05, 0.0, 0.06],
    rimOuter: [0.02, 0.0, 0.03],
    rimInner: [0.42, 0.07, 0.38],
    laserCore: [0.96, 0.9, 1.0],
    laserBody: [0.42, 0.08, 0.62],
    laserFlow: [0.78, 0.5, 1.0],
    laserOutline: [0.03, 0.0, 0.05],
    laserGlow: [0.45, 0.1, 0.68],
    flareOuter: [0.5, 0.12, 0.72],
    flareInner: [0.96, 0.9, 1.0],
    ringStart: [0.96, 0.9, 1.0],
    ringEnd: [0.42, 0.08, 0.62],
    sharinganInner: [0.42, 0.06, 0.72],
    sharinganOuter: [0.07, 0.0, 0.16],
  },
}

const glsl = (v: Rgb | number) =>
  typeof v === 'number' ? v.toFixed(3) : `vec3(${v.map((n) => n.toFixed(3)).join(', ')})`

/** 給 shader 字串內嵌用的 GLSL 常值（顏色 → vec3、數字 → float） */
export const FIRE = Object.fromEntries(
  Object.entries(PALETTES[FIRE_THEME]).map(([k, v]) => [k, glsl(v)]),
) as Record<keyof FirePalette, string>
