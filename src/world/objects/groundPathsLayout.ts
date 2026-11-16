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
    { colat: 26.9, az: -57.2 },
    { colat: 13.7, az: -46.9 },
    { colat: 12.3, az: 21.5 },
    { colat: 35.4, az: 48.6 },
    { colat: 39.9, az: 70.2 },
    { colat: 35, az: 99.2 },
    { colat: 24.1, az: 134.3 },
    { colat: 29, az: 172.4 },
    { colat: 28.2, az: -166.6 },
    { colat: 25, az: -152.1 },
    { colat: 24.5, az: -119.2 },
    { colat: 35.3, az: -93.1 },
    { colat: 35.6, az: -67.1 },
    { colat: 27.1, az: -57.9 },
  ],
];
