# BufferGeometryUtils 註解筆記

對照檔案：`node_modules/@types/three/examples/jsm/utils/BufferGeometryUtils.d.ts`（@types/three 0.186）
實作原始碼：`node_modules/three/examples/jsm/utils/BufferGeometryUtils.js`

> 不直接在 `node_modules` 裡加註解：重新 `npm install` 或升級時會被覆蓋，且不進 git。

## 先備知識：BufferGeometry 是什麼

形狀（Geometry）在 Three.js 裡就是一堆「頂點資料陣列」：

| 名稱 | 內容 | 每個頂點幾個數字（itemSize） |
| --- | --- | --- |
| `position` | 頂點座標 x, y, z | 3 |
| `normal` | 法線（面朝哪個方向，光照計算用） | 3 |
| `uv` | 貼圖座標（貼圖要貼在哪） | 2 |
| `index` | 哪 3 個頂點組成一個三角形（可省略） | 1 |

每一種資料是一個 **BufferAttribute**（屬性），實際存在 `Float32Array` 之類的 TypedArray 裡。下面的工具函式，都是在對這些陣列做合併、拆分、清理。

## 逐行註解

```ts
// 官方文件
// https://threejs.org/docs/?q=buffergeome#examples/en/utils/BufferGeometryUtils

import {
    BufferAttribute,            // 一種頂點資料（如 position），內含 TypedArray
    BufferGeometry,             // 形狀 = 多個 BufferAttribute 的集合
    InterleavedBufferAttribute, // 「交錯式」屬性：多種資料共用同一個陣列（見 interleaveAttributes）
    Line,                       // 線物體
    Mesh,                       // 面物體（我們的方塊、座位）
    Points,                     // 點雲物體
    TrianglesDrawModes,         // 三角形的排列方式（一般 / strip / fan）
} from "three";

// ── 合併類 ──────────────────────────────────────────

// ⭐ 把多個形狀合併成「一個」形狀（電影院座位：椅墊 + 椅背 → 一個座位形狀）
// - 好處：合併後只算 1 個 Mesh → 1 次 draw call（靜態場景常用的效能優化）
// - 限制：所有形狀要「規格相同」：
//     都有 index 或都沒有；屬性種類一致（例：都有 uv 或都沒 uv）
// - useGroups = true：記錄「哪一段來自第幾個形狀」，就能搭配材質陣列讓每段不同顏色
//     例：new Mesh(merged, [布料材質, 木頭材質]) → 椅墊是布、椅背是木頭
// - ⚠️ 型別寫回傳 BufferGeometry，但原始碼失敗時會 console.error 並回傳 null
export function mergeGeometries(geometries: BufferGeometry[], useGroups?: boolean): BufferGeometry;

// 把多個「同一種」屬性頭尾接起來（mergeGeometries 內部就是用它合併每一種屬性）
// 要求：陣列型別、itemSize、normalized 都要一致，否則回傳 null
export function mergeAttributes(attributes: BufferAttribute[]): BufferAttribute;

// 合併「位置幾乎一樣」的重複頂點，產生 index，減少頂點數
// - tolerance：多近算同一點，預設 1e-4（0.0001）
// - 常見用途：模型頂點過多時瘦身；或合併後讓表面法線變平滑
// - 注意：只有 position、normal、uv 等「所有屬性都相同」的頂點才會被合併
export function mergeVertices(geometry: BufferGeometry, tolerance?: number): BufferGeometry;

// 把 geometry.groups 裡「同一個材質」的分段合併在一起，減少 draw call
// 沒有 groups 時會警告並原樣回傳
export function mergeGroups(geometry: BufferGeometry): BufferGeometry;

// ── 交錯 / 拆開類（記憶體排列方式） ─────────────────

// 交錯（interleave）：把多種資料塞進同一個陣列，按頂點輪流排
//   一般：   position [x y z x y z …]   normal [nx ny nz nx ny nz …]
//   交錯後： [x y z nx ny nz | x y z nx ny nz | …]   ← 同一個頂點的資料靠在一起
// GPU 讀取某個頂點時資料都在附近，某些情況較快
// ⚠️ 型別寫回傳單一個，但原始碼實際回傳「陣列」（每個輸入屬性對應一個）；型別不同時回傳 null
export function interleaveAttributes(attributes: BufferAttribute[]): InterleavedBufferAttribute;

// 上面的反向：把「一個」交錯屬性拆回獨立的 BufferAttribute
// ⚠️ 型別寫參數是 geometry、回傳 void；原始碼實際參數是交錯屬性，回傳拆好的新屬性
export function deinterleaveAttribute(geometry: BufferGeometry): void;

// 把整個 geometry 裡所有交錯屬性都拆回一般屬性（直接修改傳入的 geometry）
export function deinterleaveGeometry(geometry: BufferGeometry): void;

// ── 複製 / 估算 ────────────────────────────────────

// 深拷貝一個屬性：連底層 TypedArray 都複製一份
// 改拷貝的數值不會影響原本的形狀（淺拷貝則是兩者共用同一個陣列）
export function deepCloneAttribute(attribute: BufferAttribute): BufferAttribute;

// 估算這個形狀佔多少 bytes（所有屬性 + index）
// 例：除錯時比較「共用 geometry」和「每個物體各 new 一份」差多少記憶體
export function estimateBytesUsed(geometry: BufferGeometry): number;

// ── 轉換 / 計算 ────────────────────────────────────

// 把 TriangleStrip / TriangleFan 排列轉成一般三角形清單（TrianglesDrawMode）
// 主要給 GLTFLoader 等載入器處理特殊格式的模型用，平常很少直接呼叫
export function toTrianglesDrawMode(geometry: BufferGeometry, drawMode: TrianglesDrawModes): BufferGeometry;

// 算出「變形後」的實際頂點位置
// 有 morph（表情、變形動畫）或骨架動畫的模型，畫面上的形狀 ≠ geometry 原始資料
// 要對「當下看到的形狀」做 Raycast、貼花（Decal）時，需要用這個拿到變形後的座標
export function computeMorphedAttributes(object: Mesh | Line | Points): object;

// 用 MikkTSpace 演算法計算切線（tangent）
// 使用法線貼圖（normal map）時需要切線；MikkTSpace 是 Blender 等建模軟體的業界標準，
// 結果與烘焙法線貼圖的軟體一致，可避免鏡像 UV 接縫處出現瑕疵
// - MikkTSpace：要另外載入的 wasm 模組（three/examples/jsm/libs/mikktspace.module.js），並等它 ready
// - negateSign：是否反轉切線的 w 分量，預設 true（glTF 格式需要）
// - 需要 position、normal、uv 三種屬性；有 index 的形狀會被轉成無 index
export function computeMikkTSpaceTangents(
    geometry: BufferGeometry,
    MikkTSpace: unknown,
    negateSign?: boolean,
): BufferGeometry;

/**
 * 重新計算法線：夾角小的面之間平滑過渡，夾角大於 creaseAngle 的地方保留銳利稜角
 * 例：圓柱側面看起來圓滑，但側面與頂面交界仍是清楚的直角邊
 *
 * - 傳入的 geometry 沒有 index → 直接修改它；有 index → 產生一個新的無 index 形狀
 *
 * @param geometry 要處理的形狀
 * @param creaseAngle 折角門檻（弧度），預設 Math.PI / 3 = 60°
 */
export function toCreasedNormals(geometry: BufferGeometry, creaseAngle?: number): BufferGeometry;
```

## 型別宣告與實作不一致（@types/three 0.186）

| 函式 | 型別宣告 | 實際行為 |
| --- | --- | --- |
| `mergeGeometries` | 回傳 `BufferGeometry` | 失敗回傳 `null`（並 console.error） |
| `mergeAttributes` | 回傳 `BufferAttribute` | 失敗回傳 `null` |
| `interleaveAttributes` | 回傳單一 `InterleavedBufferAttribute` | 回傳陣列；失敗回傳 `null` |
| `deinterleaveAttribute` | 參數 `BufferGeometry`、回傳 `void` | 參數是交錯屬性，回傳新的 `BufferAttribute` |

TypeScript 不會提醒這些情況，合併來源不確定時（例如載入的外部模型）要自己檢查 `null`：

```ts
const merged = mergeGeometries([a, b])
if (!merged) throw new Error('geometry 規格不一致，無法合併')
```

## 本專案用到的地方

- `src/cinema/main.ts` 第 5 段：`mergeGeometries([cushion, backrest])` 把椅墊和椅背合併成座位形狀。兩個都是 `BoxGeometry`，規格一致，不會回傳 `null`。
