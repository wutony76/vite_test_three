# Design

> 本變更是 Blender pipeline（Python）而非 Three.js 頁面，模板中 State／Interaction 等章節不適用，改以模組契約與資料流說明。

## 1. 資料流（Single Asset Pipeline）

```
reference.json（palette、components、surfaces[]）── AI 看圖產出
        ↓
plan.json（materials[].surface、decals[]、budget 貼圖預算）── AI 規劃、使用者確認
        ↓ validate_plan
build_asset：
  元件建模 → extrude → boolean → wobble → bevel                    （Geometry Engine，既有）
  → Surface Engine：
      1. 解析材質：有 surface 的 → textured；其餘 → palette atlas（既有）
      2. Texture Source：procedural（預設）／library／manual／provider:comfyui（讀快取）
      3. UV：依 profile／surface 選 UV0 策略；bake 時建 UVBake
      4. Material Builder：glTF 白名單節點
      5. Paint／Bake：AO 或 full（貼圖 × AO × 邊緣 × 漸層）
      6. Decal：獨立 Object
  → repair／topology validate → Geometry QA → Texture QA → 預算
  → export GLB → optimize_textures.mjs（WebP） → manifest（含 texture 報告）
Visual QA v2（有 reference 時）
```

Scene：資產照上面建好；terrain／road 的材質走同一個 Surface Engine（UV 用 planar 世界座標）。

## 2. 決策與理由

| 決策 | 理由 |
|---|---|
| **UV 在幾何定案後（bevel 之後）以程式投影產生**，不在 40 多個 builder 內各自產生 | 規劃時原想「UV at birth」，但 extrude／boolean／bevel 都會改面；在最後一步依面的平面框架投影，對所有 builder 一致、可重現，也不必改寫每個 builder。UV 以公尺為單位，texel density 可直接計算 |
| UV0 策略：`planar`（每個面依自己的平面，u 水平、v 沿坡往上）、`along`（u 沿物件最長軸，木紋方向）、`cylinder`、`fit`（圓柱展開並正規化到 0～1，給不平鋪的 unique 貼圖）、`cell`（palette atlas） | `planar` 比 cube projection 好：斜屋頂不會拉伸，瓦片列沿坡面排；同方向的面共用同一個框架，所以貼圖連續 |
| UVBake（第二組 UV）用 `bpy.ops.uv.smart_project` 每個 mesh 各自展開，再依面積以 shelf packing 排進同一張資產貼圖 | spike 確認背景模式可用；自己排 cell 比多物件 pack 操作穩定且可重現 |
| 平鋪貼圖用獨立材質（REPEAT），純色仍用 palette atlas | glTF 無法在一張 atlas 內做平鋪（需要 `fract`，匯不出去）。每個貼圖材質多 1 個 primitive，由預算控制 |
| 程序貼圖用 numpy 自寫（週期性 value noise、週期性 Voronoi），不用 Blender 程序節點 | glTF 匯不出程序節點；numpy 在 Blender 內外都能跑、可測試、可重現 |
| 貼圖 datablock 以內容 hash 命名（`LPK_tex_<hash>`） | 相同 spec 的貼圖在不同資產間共用，場景 GLB 只存一份 |
| 手繪風 = **色票鎖定**：值域場映射到陰影／基底／高光三色，分 3～4 階，加筆觸雜訊 | 風格一致性的核心；即使是 AI 或圖庫圖片也經過同一步 |
| Bake 用 Cycles，CPU、固定 samples（AO 16）、`preview` 不 bake | spike：AO bake 一個方塊 0.36 s |
| Occlusion 經由名為 **`glTF Material Output`** 的 node group 的 `Occlusion` 輸入匯出 | spike：Blender 5.2 exporter 輸出 `occlusionTexture`，`texCoord: 1` |
| `Material.use_nodes` 在 Blender 6.0 移除 → 只在 `node_tree is None` 時設定 | spike 出現 DeprecationWarning |
| 持有 `uv_layers[...]` 參照跨 `mode_set` 會 crash → 每次切換後重新取得 | spike 實際 crash 於 `MeshUVLoopLayer_data_begin` |
| ComfyUI provider 在 host 端（MCP server／CLI）執行，Blender 只讀快取 PNG | Blender 內不需網路與額外套件；建模可重現 |
| WebP 由 `scripts/optimize_textures.mjs`（gltf-transform `textureCompress` + sharp）處理；palette atlas 與 normal map 用**無損** WebP | 有損壓縮會讓相鄰色格混色、法線方向偏差 |
| （實作時發現）AO 圖的尺寸刻意避開資產中所有 ORM／MR 圖的尺寸 | Blender 匯出器看到 occlusion 與 metallicRoughness「同尺寸」就合成一張 ORM；兩者 UV 空間不同（UVBake vs UVMap），合成後共用一個 sampler，每個材質還各存一份 AO。`GLB_TEXTURE_EXPORT` 會抓這種合併 |
| （實作時發現）磚、瓦、石等「有重力方向」的圖樣不套用 along，即使 profile 預設是 along | 磚柱（trim）若用 along，磚會變成直的 |
| （實作時發現）`derive_palette` 用 HSV 而不是 HLS | 接近白色的顏色在 HLS 飽和度被放大（#F9F4E8 是 0.57），推出的陰影是飽和的橘色 |
| （實作時發現）接縫指標用「圖內最大相鄰差」當分母 | 木板接縫剛好落在邊界旁時，百分位會把圖內同樣的縫線排除，誤判成接縫 |
| （實作時發現）decal 深度在 rect 內 5×5 點（含四角）打射線取最外側 | 招牌中央比外框凹；只打中心一點時，decal 四角被外框蓋住 |
| （實作時發現）Three.js 的 Node 檢查要用同名外掛覆蓋 `EXT_texture_webp` | 內建外掛會 `new Image()` 偵測支援度，在 Node 崩潰 |
| （實作時發現）平鋪貼圖材質各佔 1 個 primitive，test01_shop 預算 32 → 44、sample_town draw call 150 → 200 | glTF 無法把平鋪貼圖合進 atlas；`bake: full` 可以把整個資產合成 1 個材質（代價是 unique 貼圖較糊），留給遠景資產 |

## 3. 模組

```
lowpoly_kit/surface/
  spec.py           純 Python：surface 欄位、預設值、tier、texel density、UV 策略選擇（schema 也用）
  pngio.py          純 Python：PNG 讀寫（zlib＋struct），Blender 外測試與快取用
  packing.py        純 Python：shelf packing（UVBake 區塊、decal atlas）
  prepare.py        純 Python（host 端）：建模前執行 provider:* 填快取
  painter/
    noise.py        週期性 value noise／fBm／Voronoi（無縫）
    patterns.py     各材質圖樣：回傳 height、區塊 id、色彩變化
    stylize.py      色票鎖定、分階、筆觸、邊緣高光、磨損、髒污、height→normal、ORM
    library.py      generate(surface, size, seed) → {"base","orm","normal"} float 陣列
  sources/
    base.py         TextureRequest／TextureResult／provider 註冊與解析
    procedural.py   預設 provider
    files.py        library／manual provider（讀既有 PNG）
    comfyui.py      本機 ComfyUI HTTP client（host 端）
    postprocess.py  無縫化、色票鎖定、縮放（純 numpy）
    cache.py        request hash、快取目錄、provenance
  images.py         Blender：陣列 ↔ Image datablock、存檔、hash 命名
  uv.py             Blender：UV0 策略、UVBake、texel density 量測
  material_builder.py  Blender：textured／atlas／decal 材質，glTF 白名單
  gltf_compat.py    Blender：節點白名單與 color space 規則
  bake.py           Blender：Cycles AO／full bake，完成後還原設定
  decals.py         Blender：decal atlas、quad、文字渲染
  engine.py         Blender：apply_surface() 串起以上步驟
qa/texture.py       Blender：Texture QA
qa/surface_metrics.py  純 numpy：Sobel 細節密度、Lab 直方圖距離、風格指紋、主週期
scripts/optimize_textures.mjs   Node：WebP
scripts/prepare_textures.py     host：預先執行 provider:* 填快取
textures/{library,cache,comfyui}/
```

刪除：`appearance/corn_surface.py`（併入 `painter/patterns.corn_kernels`）、orchestrator 的玉米特例。
`build/appearance.py` 的 palette atlas 保留，由 engine 呼叫並排除 textured 材質。

## 4. Plan 契約（`lowpoly.asset/1` 新增選填欄位，舊 plan 不受影響）

```jsonc
"materials": [{
  "name": "wall", "hex": "#B8A58C", "roughness": 0.85,
  "surface": {
    "class": "stone",            // SURFACE_CLASSES
    "pattern": "cobble",         // 省略時用 class 預設
    "palette": ["#7E6E5C", "#B8A58C", "#D9CBB4"],  // 省略時由 hex 推出陰影／高光
    "scale_m": 0.22,             // 圖樣單元的大小（磚高、板寬、瓦片高）
    "wear": 0.4, "dirt": 0.2,    // 0～1，再乘上 DetailConfig.surface_detail
    "uv": "planar",              // planar|along|cylinder|fit；省略用 profile 預設
    "tier": "standard",          // prop|standard|hero
    "source": "procedural",      // procedural|library:<id>|manual:<path>|provider:comfyui
    "normal_strength": 1.0
  }
}],
"decals": [{"id": "sign", "target": "facade", "face": "front",
            "rect": [[x0, z0], [x1, z1]],      // 目標面上的公尺座標（x 水平、z 高度）
            "content": {"type": "text", "text": "LIME", "color": "#2B2B2B", "background": "#F2E6C8"},
            "offset": 0.004}],
"budget": {"max_tris": 3000, "max_primitives": 8, "max_texture_kb": 1500, "max_gpu_texture_mb": 16}
```

DetailConfig 新增：`surface_quality`（off／standard／hero）、`surface_detail`（0～1）、`bake`（none／ao／full）。
`preview`＝off／0／none；`game_default`＝standard／0.6／ao；`hero`＝hero／0.8／ao。

reference.json 新增選填 `surfaces[]`：`{id, region:[[x,y]...], class, pattern?, base_hex, scale_m?, components:[], source, confidence}`。

## 5. 解析度與預算

| tier | 平鋪貼圖 | unique／bake | 目標 texel density |
|---|---|---|---|
| prop | 256 | 512 | 128 px/m |
| standard | 512 | 1024 | 256 px/m |
| hero | 1024 | 2048 | 512 px/m |

`surface_quality = standard` 時 hero tier 降一級。GPU 記憶體估算 = w × h × 4 × 1.33（mipmap）。
預設預算（plan 未寫時）：每資產 `max_gpu_texture_mb` 16、`max_texture_kb` 2048。

## 6. Shader 白名單

Principled BSDF、Image Texture、UV Map、Separate Color、Normal Map（Tangent）、Color Attribute、Mix（RGBA MULTIPLY，接 vertex color）、`glTF Material Output` group、Material Output。
Image 的 color space：Base Color／Emission → sRGB；其他 → Non-Color。

## 7. Texture QA 規則

| code | level | 判定 |
|---|---|---|
| TEXTURE_MISSING | fail | textured 材質缺 base 圖片或圖片無像素 |
| UV_MISSING | fail | 使用 textured／bake 材質的 mesh 缺 UV0／UVBake |
| UV_STRETCH | fail／warn | UV 面積 ÷ 3D 面積相對中位數 > 2×（或 < 0.5×）的面積比 > 10% 為 fail；> 1.5× 為 warn |
| UV_OVERLAP | fail | UVBake 光柵化後重疊 > 0.5% |
| UV_PADDING | warn | UVBake island 間距 < tier padding |
| TEXEL_DENSITY | warn | 偏離目標 ±50% |
| COLOR_SPACE | fail | 角色與 color space 不符 |
| NODE_COMPAT | fail | 匯出材質含白名單外節點 |
| EXTERNAL_FILE_MISSING | fail | 圖片未打包且檔案不存在 |
| GLB_TEXTURE_EXPORT | fail | GLB 缺少預期的貼圖槽或 TEXCOORD |
| TEXTURE_BUDGET | fail | 檔案 KB 或 GPU MB 超過預算 |
| GPU_TEXTURE_HIGH | warn | 場景 GPU 貼圖 > 150 MB（建議升級 KTX2） |
| FLAT_RATIO | warn | primary／secondary 純色面積比 > 30% |
| TEXTURE_SEAM | warn | 平鋪貼圖左右／上下邊緣差異過大 |

## 8. Visual QA v2（reference 有 surfaces 時）

每個 surface region 比較 reference 與正面渲染：Lab 直方圖距離（材質相似度）、中位數 ΔE、Sobel 細節密度比（0.6～1.5）、主週期換算公尺（紋理比例 ±25%）；全資產的風格指紋（飽和度、明度對比）。只有 warn，不推翻輪廓／位置 IoU 的判定。

## 9. 測試與驗證策略

- 純 Python（`tests/test_surface_pure.py`，Blender 內外都能跑）：noise 無縫、painter 決定性、PNG 往返、postprocess、cache、ComfyUI client（本機 mock HTTP server）、schema、metrics
- Blender（`tests/test_surface.py`、`tests/test_texture_qa.py`）：UV 策略數值、material 節點與 color space、bake 輸出、decal、QA 每條規則正反例、GLB 內容
- Three.js（`tests/threejs_plan_check.mjs` 擴充）：map／normalMap／aoMap、colorSpace、channel
- e2e：Test C（crate_pile、grilled_corn、test02_cottage）
- `npm run build`
