# Engineering Evidence：樹墩（add-tree-stump）

## 變更摘要

- 綠球上新增樹墩：方方的樹幹、年輪切面（整面心材色、偏心髓心、放射裂縫）、左下小樹枝。
- 全部程式產生（`treeStump.ts`）：幾何用建造器，紋路用 MeshStandardMaterial + onBeforeCompile 即時計算，
  放大、單軸拉寬都不會糊、樹皮紋不會被拉扁。
- 面板「樹墩」：位置、縮放、大小、變寬／變厚／變高、年輪圈數、造型 seed、小樹枝開關、亮度與染色；
  拖曳／點選選取、複製、移除、印出佈局（貼回 `treeStumpLayout.ts`），操作跟檸檬片一樣。

## 驗證佐證

- `tsc`、`npm run build` 通過；幾何測試 5 個 seed 法線全部朝外、0 NaN。
- 瀏覽器：場景、近拍、寬 ×3＋縮放 ×3 近拍、換 seed、面板複製／移除都正常，console 無錯誤。
- 截圖：`assets/tree-stump-render.png`、`assets/tree-stump-wide-zoom.png`、`assets/tree-stump-seed.png`、`assets/tree-stump-in-scene.png`

## 風險與後續追蹤

- 每個樹墩約 6.7k 三角面＋一個 fbm shader；複製很多個（> 20）時再考慮 InstancedMesh 或降低分段。
- 年輪跟著外形走：只拉寬時年輪變橢圓（刻意，像真木頭），年輪線本身仍銳利。
- 極端放大時樹皮紋是平滑的 value noise（不會出現像素格），細節量固定，不會無限增加。

## 封存前檢查

- [x] proposal / design / tasks / validation 完成
- [x] Architecture README 已補上 treeStump
