// 商品資料：UI 顯示用的文字、價格、尺寸、配色
// 與 3D 程式分開，之後換成從後端 API 取得時，只要改這裡的資料來源

export type ProductVariant = {
  // 對應模型 KHR_materials_variants 裡的配色名稱（比對時不分大小寫）
  modelName: string
  // 網址參數用的 key，例：?variant=midnight
  key: string
  // 顯示名稱
  label: string
  // 色票按鈕顏色（CSS 色碼）
  swatch: string
}

export type Product = {
  brand: string
  name: string
  description: string
  price: number
  modelUrl: string
  sizes: string[]
  variants: ProductVariant[]
  credit: { text: string; href: string; license: string; licenseHref: string }
}

export const product: Product = {
  // 虛構品牌與商品名稱（模型本身沒有品牌標誌）
  brand: 'STRIDE LAB',
  name: 'Daily Runner 經典休閒鞋',
  description: '輕量網布鞋面搭配緩震中底，日常通勤與週末出遊都適合。拖曳旋轉、滾輪縮放，從每個角度檢視細節。',
  price: 2980,
  // public/ 底下的檔案以 / 開頭的絕對路徑引用
  // import.meta.env.BASE_URL：部署在子路徑（例如 GitHub Pages 的 /repo-name/）時也能找到檔案
  modelUrl: `${import.meta.env.BASE_URL}models/shoe/shoe.glb`,
  sizes: ['US 7', 'US 8', 'US 9', 'US 10', 'US 11'],
  // 第一個為預設配色；色票依實際貼圖顏色取色
  variants: [
    { modelName: 'midnight', key: 'midnight', label: '湖水藍', swatch: '#1f86c2' },
    { modelName: 'beach', key: 'beach', label: '珊瑚粉', swatch: '#e7a7ab' },
    // 色票可用漸層表現雙色（黑色鞋身 + 紅色側條）
    { modelName: 'street', key: 'street', label: '街頭黑', swatch: 'linear-gradient(135deg, #222 55%, #f0505f 55%)' },
  ],
  credit: {
    text: '3D 模型 © 2021 Shopify（Khronos glTF Sample Assets）',
    href: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/MaterialsVariantsShoe',
    license: 'CC BY 4.0',
    licenseHref: 'https://creativecommons.org/licenses/by/4.0/',
  },
}
