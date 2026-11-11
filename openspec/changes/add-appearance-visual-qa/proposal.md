# Proposal

## 變更名稱

`add-appearance-visual-qa` — Material Engine（palette atlas、vertex color）與 Visual QA（Stylized Asset Pipeline Phase 5）

## 背景

- Phase 3 每種顏色是一個材質。多材質的零件（燈、盆栽、門）每種材質都是一個 primitive：test01_shop 有 40 個，預算只好暫時放寬到 48。
- 顏色是均勻的純色，水彩參考圖那種明暗變化完全沒有。
- `DetailConfig` 的 `material_quality`、`texture_quality` 在 Phase 3 還不生效。
- 和參考圖的比對只能靠人看並排圖，沒有數字可以判斷「像不像」，也無法追蹤修改後是變好還是變差。

## 目標

1. **Palette atlas**：plan 的所有不透明顏色畫在一張小貼圖上，每個面的 UV 指向自己的色格。
   - 不透明零件共用 1 個材質，發光零件共用 1 個，玻璃維持獨立且半透明
   - roughness／metallic 放在另一張 metallicRoughness 貼圖，不會因為合併材質而遺失
2. **Vertex color**（`palette_vc`）：依面做固定的明暗起伏，加上下暗上亮的高度漸層，做出水彩的層次。
3. `material_quality`、`texture_quality` 實際生效：
   - `flat`：沿用一色一材質
   - `palette`：使用 atlas
   - `palette_vc`：atlas 加上 vertex color
4. **Visual QA**（程式判定，不靠 AI 主觀）：
   - 輪廓 IoU：正面正交渲染的主體剪影 vs 參考圖輪廓
   - 元件位置 IoU：每個元件投影到正面的外框 vs 參考圖的元件框
   - 色差 ΔE：渲染圖 vs 參考圖，在色票取樣區比較
   - 輸出疊圖給 AI 或人工檢視；AI 的評語只是附註，不決定通過與否

## 範圍

- 包含：
  - `appearance/atlas.py`（純 Python：色格配置、像素、UV）
  - `build/appearance.py`（Blender：貼圖、材質、UV、vertex color）
  - orchestrator 在 bevel 之後套用外觀
  - `qa/metrics.py`（純 Python + numpy：多邊形掃描線填色、IoU、sRGB → Lab、ΔE、外框投影）
  - `qa/visual.py`（Blender：渲染剪影與正面圖、計算指標、輸出疊圖，完成後還原場景設定）
  - `api.validate_visual(plan, out_dir)`；`build_from_plan.py --qa`
  - Three.js 檢查：確認有貼圖、有 vertex color、貼圖使用 NEAREST 取樣、draw call 下降
- 不包含：
  - 法線貼圖、AO bake
  - 描邊（outline）
  - 非正面視角的參考圖比對：需要估計相機，列為後續工作
  - AI 評語的自動化：由 WORKFLOW 規定 AI 讀疊圖後寫評語

## 影響面

- 新增 `lowpoly_kit/appearance/`、`build/appearance.py`、`qa/metrics.py`、`qa/visual.py`
- 修改 orchestrator、`api.py`、`scripts/build_from_plan.py`、`tests/threejs_plan_check.mjs`、`export/gltf_export.py`（匯出 vertex color）
- plan：test01_shop 的 `max_primitives` 依實際結果收緊
- 重新匯出 GLB

## 風險與對策

- 風險：貼圖縮小（mipmap）時，相鄰色格的顏色混在一起
  - 對策：Image Texture 用 Closest 取樣 → glTF sampler 是 NEAREST，不會混色；色格至少 8 px
- 風險：glTF exporter 不認得「貼圖 × vertex color」的節點組合，貼圖沒有匯出
  - 對策：匯出後讀 GLB JSON，確認有 `baseColorTexture` 和 `COLOR_0`，寫成測試
- 風險：Visual QA 的渲染改動使用者的場景設定（引擎、相機、隱藏狀態）
  - 對策：所有設定在 finally 中還原，暫時的相機一定刪除；有測試驗證還原
- 風險：水彩參考圖和平塗渲染的色差本來就大
  - 對策：色差只到 warn，不判定 fail；輪廓和位置 IoU 才會 fail

## 驗證方式

- 純 Python：atlas 配置與 UV、掃描線填色的正確性（矩形、三角形、凹多邊形）、IoU、ΔE 的已知值
- Blender：
  - test01_shop 使用 atlas 後的 primitive 數下降，且每個 Object 只有 opaque／emissive／glass 三種材質
  - Visual QA 的輪廓 IoU ≥ 0.85、元件位置 IoU 平均 ≥ 0.7
  - Visual QA 執行完後場景設定和執行前一致
- Three.js：貼圖、vertex color、NEAREST、只有玻璃半透明、draw call
- 回歸：既有測試、`npm run build`

## 成功標準

- [ ] test01_shop 的 primitive 數 ≤ 32（原本 40）；glTF 有 baseColorTexture、metallicRoughnessTexture、COLOR_0
- [ ] `preset="preview"`（flat）仍然是一色一材質
- [ ] Visual QA：輪廓 IoU ≥ 0.85、元件位置 IoU 平均 ≥ 0.7，並輸出疊圖
- [ ] Visual QA 不改變使用者的場景設定
- [ ] 既有測試全部通過
