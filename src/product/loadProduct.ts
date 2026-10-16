// 載入商品模型（glTF）＋ 解析模型內建的配色（KHR_materials_variants）
import * as THREE from 'three'
// GLTFLoader：讀取 .glb / .gltf，業界最通用的 3D 模型格式（被稱為「3D 界的 JPEG」）
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
// 模型用 meshopt 壓縮過幾何資料（EXT_meshopt_compression），載入時需要對應的解碼器
// 這個解碼器已內嵌 wasm，不必另外放檔案到 public/
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

// glTF JSON 裡 KHR_materials_variants 的資料結構
// 根層：variants = 所有配色的名稱清單，例：[{ name: 'Beach' }, { name: 'Midnight' }, …]
// 每個 primitive：mappings = 「哪個材質 index」對應「哪幾個配色 index」
type VariantsRoot = { variants: { name: string }[] }
type VariantMapping = { material: number; variants: number[] }
type MeshWithStandardMaterial = THREE.Mesh<THREE.BufferGeometry, THREE.Material>

export type LoadedProduct = {
  model: THREE.Group
  variantNames: string[]
  applyVariant: (name: string) => Promise<void>
  dispose: () => void
}

/**
 * 載入商品模型
 * @param url 模型網址
 * @param onProgress 進度回報：0 ~ 1；伺服器沒提供檔案大小時傳 null（無法計算百分比）
 */
export async function loadProduct(url: string, onProgress: (ratio: number | null) => void): Promise<LoadedProduct> {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)

  const gltf = await loader.loadAsync(url, (event) => {
    onProgress(event.lengthComputable ? event.loaded / event.total : null)
  })

  const { parser } = gltf
  const root = parser.json.extensions?.KHR_materials_variants as VariantsRoot | undefined
  const variantNames = root?.variants.map((variant) => variant.name) ?? []

  // 找出「有配色設定」的 Mesh，記下它的原始材質與 mappings
  // parser.associations：three.js 物件 → glTF JSON 裡的 index，用來反查原始設定
  const targets: { mesh: MeshWithStandardMaterial; original: THREE.Material; mappings: VariantMapping[] }[] = []
  // 所有用過的材質（含切換後才載入的），dispose 時一起釋放
  const usedMaterials = new Set<THREE.Material>()

  gltf.scene.traverse((object) => {
    const mesh = object as MeshWithStandardMaterial
    if (!mesh.isMesh) return
    // 商品模型需要投射陰影到地面
    mesh.castShadow = true
    usedMaterials.add(mesh.material)

    const ref = parser.associations.get(mesh)
    if (ref?.meshes === undefined || ref.primitives === undefined) return
    const primitive = parser.json.meshes[ref.meshes].primitives[ref.primitives]
    const mappings = primitive.extensions?.KHR_materials_variants?.mappings as VariantMapping[] | undefined
    if (mappings) targets.push({ mesh, original: mesh.material, mappings })
  })

  // 連續快速點擊不同配色時，只採用「最後一次」的結果
  // （每次切換都是非同步的，先點的可能比後點的晚完成，會把畫面蓋回舊配色）
  let latestRequest = 0

  async function applyVariant(name: string) {
    // 不分大小寫比對（模型裡的名稱是小寫 midnight，官方 README 卻寫 Midnight，容易踩坑）
    const variantIndex = variantNames.findIndex((item) => item.toLowerCase() === name.toLowerCase())
    if (variantIndex === -1) console.warn(`[loadProduct] 模型沒有配色「${name}」，可用：${variantNames.join(', ')}`)
    const request = ++latestRequest

    // 先把所有材質準備好（第一次切換到某配色時，貼圖要解碼，需要時間）
    const materials = await Promise.all(
      targets.map(async ({ original, mappings }) => {
        const mapping = mappings.find((item) => item.variants.includes(variantIndex))
        // 這個 Mesh 在該配色沒有指定材質 → 用原始材質
        if (!mapping) return original
        // getDependency 內部有快取：同一個材質只會建立一次，之後切回來是即時的
        return (await parser.getDependency('material', mapping.material)) as THREE.Material
      }),
    )

    if (request !== latestRequest) return
    // 全部準備好才一次替換，避免畫面出現「一半新配色、一半舊配色」
    targets.forEach((target, index) => {
      target.mesh.material = materials[index]
      usedMaterials.add(materials[index])
    })
  }

  // 釋放 GPU 資源：幾何、材質、貼圖不會自動回收，換商品或離開頁面時要手動 dispose
  function dispose() {
    gltf.scene.traverse((object) => {
      const mesh = object as MeshWithStandardMaterial
      if (mesh.isMesh) mesh.geometry.dispose()
    })
    for (const material of usedMaterials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      material.dispose()
    }
  }

  return { model: gltf.scene, variantNames, applyVariant, dispose }
}
