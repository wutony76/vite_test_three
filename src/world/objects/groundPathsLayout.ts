/**
 * 綠球上的自訂小徑佈局。在畫面上用「綠球細節 → 4. 泥土小徑 → 編輯小徑」調好後，
 * 按「印出小徑佈局」，把 console 印出來的內容貼回這裡，就會變成預設。
 *
 * 每條路是一串路點；每個路點用兩個角度表示：
 *   colat：離綠球頂端幾度（0 = 正頂端）
 *   az：方位角（度），跟房子、檸檬片等的 azimuthDegrees 同一個基準
 * 路點之間會自動畫成平滑的曲線。
 *
 * 清單是空的 → 使用自動路線（把房子和篝火用最短的連法串起來）。
 */
export type GroundPathPoint = { colat: number; az: number };

export const GROUND_PATHS_LAYOUT: GroundPathPoint[][] = [
  [
    { colat: 24.8, az: -54.9 },
    { colat: 13.7, az: -46.9 },
    { colat: 12.3, az: 21.5 },
    { colat: 35.4, az: 48.6 },
    { colat: 39.9, az: 70.2 },
    { colat: 35, az: 99.2 },
    { colat: 24.1, az: 134.3 },
    { colat: 30.2, az: 163 },
    { colat: 30.7, az: -174.8 },
    { colat: 24.7, az: -150.1 },
    { colat: 33.9, az: -124.4 },
    { colat: 33.5, az: -102.2 },
    { colat: 36.4, az: -91.4 },
    { colat: 36.9, az: -78.6 },
    { colat: 33.1, az: -64.3 },
    { colat: 24.7, az: -54.5 },
  ],
];
