# Proposal

## 變更名稱

`add-texture-surface-engine` — Texture & Surface Detail Engine（貼圖、UV、Bake、Decal、Texture QA）

## 背景

- plan 的材質只有 `hex／roughness／metallic／alpha／emissive`，AI 想描述「木板、石磚、屋瓦」也寫不進去。
- 幾何產生器（`shapes.py`）不產生 UV；Phase 5 的 palette atlas 把每個面的 UV 塌成色格中心一點，畫面上仍是純色。
- 唯一真正用到貼圖的是烤玉米，而且是 orchestrator 寫死 `grilled_corn_body` 的特例；它的 Bump 節點匯出成 `normalTexture`，但圖片不是 tangent-space normal 編碼。
- Visual QA 只比中位數色差，純色反而最容易拿高分；沒有貼圖容量與 GPU 預算。
- 結果：模型表面單調，和參考圖差距大。

## 目標

1. **Surface Engine**（`lowpoly_kit/surface/`）取代 `build/materials.py` 的單色路線、`build/appearance.py`、`appearance/corn_surface.py` 的特例：
   - plan 材質新增 `surface`（材質類別、圖樣、色票、圖樣尺寸、磨損、髒污、UV 策略、解析度等級）
   - 有 `surface` 的材質使用貼圖；沒有的維持 palette atlas（純色仍可用，但不是預設）
2. **程序手繪貼圖庫**（numpy，可重現、離線）：木板、木紋、磚、石、屋瓦、灰泥、金屬、布、葉、地面、玉米粒、雜訊。色票鎖定、無縫平鋪，輸出 base color／ORM／normal。
3. **UV Engine**：依 profile／surface 選策略（planar、along、cylinder、fit、cell），以公尺為單位，texel density 可量測；需要 bake 時建立不重疊的 `UVBake`。
4. **Material Builder**：只產生 glTF 匯出得了的節點組合，color space 依角色設定（base／emissive = sRGB，ORM／normal = Non-Color）。
5. **Bake Engine**（Cycles）：AO 與「完整表面」（貼圖 × AO × 邊緣高光 × 垂直漸層）烘焙成圖片，存檔、重新載入、接回材質。
6. **Decal Engine**：招牌、海報、符號等獨立 Object，alpha MASK，不融進主 Mesh。
7. **Texture Provider 介面**：procedural（預設）、library、manual、**本機 ComfyUI**（使用者決策）；產出快取並記錄 provenance。
8. **Texture QA** 與 **Visual QA v2**：缺圖、缺 UV、拉伸、重疊、texel density、color space、節點相容、外部檔案、GLB 匯出、預算、純色比例；材質區域色彩、細節密度、風格一致性、紋理比例。
9. **匯出**：GLB 匯出後用 gltf-transform 轉 **WebP**（使用者決策），palette atlas 與 normal map 維持無損。
10. **Scene**：terrain／road 與資產共用同一套 Surface Engine；相同貼圖以內容 hash 命名，場景 GLB 自動去重。

## 範圍

- 包含：上列 1～10；遷移 grilled_corn；crate_pile、test02_cottage、test01_shop（decal）、biolum_tree、sample_town 升級為貼圖資產；e2e 新增 Test C。
- 不包含：
  - KTX2（場景 GPU 貼圖超過約 150 MB 時再升級，Texture QA 會提醒）
  - 實際安裝 ComfyUI 與模型（provider 以本機 mock server 測試；安裝後即可使用）
  - Blender 互動式 Texture Paint 筆刷自動化（改以 numpy Paint Layer 與 manual round-trip 取代）

## 影響面

- 新增：`lowpoly_kit/surface/`、`qa/texture.py`、`qa/surface_metrics.py`、`scripts/optimize_textures.mjs`、`scripts/prepare_textures.py`、`tools/blender/textures/`
- 修改：orchestrator、scene assembly、schema、detail_config、profiles、visual QA、manifest、MCP server、Three.js 檢查、e2e
- 刪除：`appearance/corn_surface.py` 與 orchestrator 的玉米特例
- plan：上列資產加上 `surface`／`decals`；重新匯出 GLB
- 套件：devDependencies 新增 `@gltf-transform/*`、`sharp`、`meshoptimizer`

## 風險與對策

- glTF 匯不出程序節點 → Material Builder 只用白名單節點；程序效果一律先 bake；`NODE_COMPAT` 檢查擋下
- 貼圖讓檔案與 GPU 暴增 → 依 tier 決定解析度（不全用 2K）、平鋪貼圖共用、WebP、預算檢查
- Cycles bake 慢且非決定性 → 固定 samples／seed、只在有貼圖材質時執行、`preview` 不 bake；測試用小尺寸
- 貼圖掩蓋錯誤比例 → 幾何 QA 與 Visual QA 的輪廓 IoU 門檻不變，貼圖不得拉低
- 不同材質風格不一 → 色票鎖定 + 風格一致性指標

## 驗證方式

- 純 Python：painter 無縫性與決定性、PNG 讀寫、UV 數學、provider 快取、ComfyUI client（mock server）、schema、surface metrics
- Blender：UV 策略、material builder 節點與 color space、bake、decal、Texture QA 每條規則正反例、GLB 內容
- Three.js：貼圖、colorSpace、aoMap channel、WebP 可載入
- e2e：Test A／B 回歸 + Test C（貼圖資產）

## 成功標準

- [ ] 升級後的資產 FLAT_RATIO（primary／secondary 純色面積比）≤ 30%
- [ ] Texture QA 全部規則有測試；升級資產沒有 fail
- [ ] grilled_corn 沒有 orchestrator 特例，normal map 編碼正確，GLB 比 627 KB 小 ≥ 50%
- [ ] GLB 的 base color／emissive 是 sRGB、其他資料貼圖是 Non-Color；Three.js 端驗證通過
- [ ] Test A／B 輪廓 IoU 不下降；既有測試全部通過；`npm run build` 通過
