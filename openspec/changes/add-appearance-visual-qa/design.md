# Design

## 1. Palette atlas

```
atlas64：64×64 px，8×8 格，每格 8 px（最多 64 色）
atlas256：256×256 px，8×8 格，每格 32 px（解析度較高，給鏡頭會拉近的主角資產）
```

- **色格配置**（`appearance/atlas.py`，純 Python）：
  - 只有不透明材質（`alpha` 為 1）放進 atlas，依 plan 的 materials 順序排列。玻璃另外處理。
  - 第 i 個顏色在 (col = i % 8, row = i // 8)。UV 指向格子中心 ((col + 0.5) / 8, 1 − (row + 0.5) / 8)，glTF 的 V 軸向下，所以 row 要翻過來。
  - 同一個面的所有 loop 都放在同一點：整個面就是一個純色，不需要展 UV。
- **兩張貼圖**：
  - `LPK_<plan>_atlas_color`：sRGB，像素就是 hex 原色
  - `LPK_<plan>_atlas_mr`：Non-Color；G = roughness、B = metallic（glTF metallicRoughness 的規格），R 填 1
- **三個共用材質**（每個 plan）：
  - `atlas`：color 貼圖 → Base Color；mr 貼圖 → Separate Color → Roughness、Metallic
  - `atlas_emissive`：同上，再把 color 貼圖接到 Emission Color（強度 1.5）
  - 玻璃：維持 Phase 3 的獨立材質（半透明）
- **取樣**：Image Texture 的 interpolation 設為 Closest，匯出後 glTF sampler 是 NEAREST，不會產生 mipmap 混色。
- **primitive**：每個 Object 最多 3 個（opaque、emissive、glass），多數只有 1 個。

## 2. Vertex color（`palette_vc`）

- 屬性名稱 `Col`，CORNER、BYTE_COLOR。同一個面的 loop 用同一個值，維持 low poly 的平面感。
- 亮度係數 = 面的明暗起伏 × 高度漸層：
  - 面的起伏：1 ± 6%，用面中心（世界座標，四捨五入到 mm）做 CRC32 雜湊，每次結果相同
  - 高度漸層：0.86 + 0.14 × clamp(面中心 z ÷ 資產高度)，牆腳較暗、上方較亮，和水彩的上亮下暗一致
- 材質：Color Attribute × atlas color（Mix，Multiply）→ Base Color。
- 匯出：`export_vertex_color="ACTIVE"`，確保 `COLOR_0` 一定匯出；Three.js 的 GLTFLoader 看到 `COLOR_0` 會自動設定 `vertexColors = true`，乘在貼圖顏色上。

## 3. material_quality／texture_quality

| material_quality | texture_quality | 結果 |
|---|---|---|
| flat | 任何 | 一色一材質（Phase 3） |
| palette | none | 退回 flat（沒有貼圖就沒有 atlas），報告註記 |
| palette | atlas64／atlas256 | atlas，沒有 vertex color |
| palette_vc | atlas64／atlas256 | atlas + vertex color |

## 4. Visual QA

`qa/metrics.py` 是純 Python + numpy，Blender 內外都能測試：

- `polygon_mask(points, w, h)`：掃描線填色（每一列算出和多邊形邊的交點，兩兩配對填滿），正規化座標 0～1、原點左上。
- `iou(a, b)`、`bbox_iou(a, b)`。
- `srgb_to_lab`、`delta_e(hex_a, hex_b)`（CIE76）。
- `project_bbox(world_min, world_max, frame)`：正面正交視角下 x → u、z → v，換算成正規化影像座標。

`qa/visual.py`（Blender）：

1. `reference_frame(plan, plan_path)`：沿用 Phase 3 的取景計算（從 script 搬過來共用）。不是 `front_ortho` 時回傳 None，Visual QA 標記為 skipped。
2. **輪廓**：
   - 只渲染 primary／secondary 的 Object，因為參考圖的輪廓是建築主體，不含路燈、盆栽
   - Workbench FLAT、單色白、背景黑，渲染出剪影 → 二值化
   - 參考輪廓用 `polygon_mask` 產生
   - 計算 IoU：≥ 0.85 pass、≥ 0.75 warn、否則 fail
3. **元件位置**：
   - plan 元件和 reference 元件用同一個 id 對應
   - Object 的世界外框投影到影像座標 vs 參考框，計算 IoU
   - 平均 ≥ 0.7 pass、≥ 0.55 warn、否則 fail；單一元件 < 0.5 時列入 warn
   - 編輯類元件和已融合的元件沒有獨立 Object，略過
4. **顏色**：
   - 正面 FLAT 材質色渲染，在每個色票的 `sample` 區取中位數，和參考圖同一區的中位數比較 ΔE
   - ≤ 15 pass、≤ 30 warn、> 30 warn（標示偏差大）
   - 水彩和平塗本來就有差距，所以不判定 fail
5. **輸出**（out_dir）：
   - `front.png`、`silhouette.png`
   - `overlay.png`：參考輪廓和模型剪影疊在一起，綠 = 重疊、紅 = 只有參考、藍 = 只有模型
   - `compare.png`
   - `visual_report.json`
6. **還原**：
   - 執行前記錄 render engine、shading、world color、view transform、解析度、相機、film_transparent、每個 Object 的 `hide_render`
   - finally 一律還原，並刪除暫時的相機與 world

## 5. AI 視覺檢視

- WORKFLOW 規定：Visual QA 跑完後，AI 用 Read 或 `look` 看 `overlay.png`、`compare.png`，寫出評語：差異、原因、要改 plan 的哪個欄位。
- 評語附在回報中，**不影響 pass／fail**。判定只看第 4 節的數值。

## 6. 測試

- `tests/test_visual_metrics.py`（純 Python）：
  - 矩形與三角形 mask 的面積
  - 凹多邊形（L 形）
  - IoU 的已知值
  - ΔE（同色 0、黑白約 100）
  - 投影
  - atlas 配置
- `tests/test_appearance.py`（Blender）：
  - atlas 後 primitive 下降
  - 材質種類只有 opaque／emissive／glass
  - UV 落在正確色格，取樣顏色等於原色
  - preview 仍然是 flat
  - GLB 帶有貼圖與 `COLOR_0`
  - Visual QA 的門檻
  - 場景設定還原
