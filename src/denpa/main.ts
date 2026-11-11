// 霓虹招牌「電 • 波 • 町」：載入 GLB，用右側面板或 setDenpaLights 改每一盞燈
import './style.scss'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import GUI from 'three/addons/libs/lil-gui.module.min.js'
import {
  DENPA_CHANNELS,
  DENPA_CHANNEL_LABEL,
  channelEnvelope,
  createDenpaLightState,
  patchDenpaLights,
  type DenpaChannelId,
  type DenpaLightPatch,
  type DenpaLightState,
} from './lights'

const MODEL_URL = `${import.meta.env.BASE_URL}models/denpa_sign/denpa_sign.glb`

const NAME_CHANNEL: Record<string, DenpaChannelId> = {
  Denpa_Neon_Den: 'den',
  Denpa_Neon_Ha: 'ha',
  Denpa_Neon_Machi: 'machi',
  Denpa_Neon_Dot: 'dot',
  Denpa_Neon_Outer: 'outer',
  Denpa_Neon_Trim: 'trim',
  Denpa_Bay: 'bay',
}

const BASE_INTENSITY: Record<DenpaChannelId, number> = {
  den: 1.7,
  ha: 1.7,
  machi: 1.7,
  dot: 2,
  outer: 1.45,
  trim: 1.25,
  bay: 0.22,
}

interface NeonBinding {
  materials: THREE.MeshStandardMaterial[]
  lights: THREE.PointLight[]
  baseIntensity: number
}

const app = document.querySelector<HTMLDivElement>('#app')!
const errorText = document.querySelector<HTMLElement>('[data-ref="error"]')
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const state = createDenpaLightState()
const bindings = new Map<DenpaChannelId, NeonBinding>()

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.setSize(window.innerWidth, window.innerHeight)
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x07080c)

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.05, 80)
camera.position.set(1.35, 2.7, 6.4)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.target.set(0, 2.6, 0)
controls.minDistance = 2.2
controls.maxDistance = 16

scene.add(new THREE.AmbientLight(0xfff2e4, 0.08))
const hemi = new THREE.HemisphereLight(0x2c3d40, 0x1a0c06, 0.22)
scene.add(hemi)
const fill = new THREE.DirectionalLight(0xffe2c4, 0.28)
fill.position.set(-2.2, 4.5, 3.4)
scene.add(fill)

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(9, 48),
  new THREE.MeshStandardMaterial({ color: 0x100e0c, roughness: 0.94, metalness: 0.02 }),
)
floor.rotation.x = -Math.PI / 2
floor.position.y = -0.01
floor.receiveShadow = true
scene.add(floor)

const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
const composer = new EffectComposer(renderer, target)
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), state.bloom, 0.38, 0.92)
composer.addPass(bloom)
composer.addPass(new OutputPass())
composer.setSize(window.innerWidth, window.innerHeight)

const clock = new THREE.Timer()
clock.connect(document)

function channelOf(object: THREE.Object3D): DenpaChannelId | null {
  const stored = object.userData?.neon_channel
  if (typeof stored === 'string' && (DENPA_CHANNELS as readonly string[]).includes(stored)) {
    return stored as DenpaChannelId
  }
  return NAME_CHANNEL[object.name] ?? null
}

function bindingFor(id: DenpaChannelId) {
  let binding = bindings.get(id)
  if (!binding) {
    binding = { materials: [], lights: [], baseIntensity: BASE_INTENSITY[id] }
    bindings.set(id, binding)
  }
  return binding
}

function placeCharacterLight(mesh: THREE.Mesh, id: DenpaChannelId) {
  if (id !== 'den' && id !== 'ha' && id !== 'machi' && id !== 'trim' && id !== 'outer') return
  const box = new THREE.Box3().setFromObject(mesh)
  const wide = id === 'trim' || id === 'outer'
  const light = new THREE.PointLight(state.channels[id].color, 0, wide ? 5.5 : 3.2, 2)
  light.position.copy(box.getCenter(new THREE.Vector3()))
  light.position.z += wide ? 0.55 : 0.28
  scene.add(light)
  bindingFor(id).lights.push(light)
}

function applyLights(time: number) {
  bloom.strength = state.bloom
  for (const id of DENPA_CHANNELS) {
    const binding = bindings.get(id)
    if (!binding) continue
    const channel = state.channels[id]
    const scale = channelEnvelope(id, state, time, reducedMotion)
    for (const material of binding.materials) {
      material.color.set(channel.color)
      material.emissive.set(channel.color)
      material.emissiveIntensity = binding.baseIntensity * scale
    }
    for (const light of binding.lights) {
      light.color.set(channel.color)
      light.intensity = scale * (id === 'trim' || id === 'outer' ? 0.6 : 1.1)
    }
  }
}

function frameSign(root: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  root.position.sub(center)
  root.position.y += size.y / 2
  root.updateMatrixWorld(true)
  const targetY = size.y * 0.48
  const vFov = THREE.MathUtils.degToRad(camera.fov)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
  const distance = Math.max(size.y / 2 / Math.tan(vFov / 2), size.x / 2 / Math.tan(hFov / 2)) * 1.45
  controls.target.set(0, targetY, 0)
  camera.position.set(distance * 0.22, targetY, distance)
  camera.lookAt(controls.target)
  controls.update()
}

const loader = new GLTFLoader()
loader.load(
  MODEL_URL,
  (gltf) => {
    const root = gltf.scene
    scene.add(root)
    frameSign(root)
    root.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      const id = channelOf(mesh)
      if (!id) return
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(
        (material): material is THREE.MeshStandardMaterial => material instanceof THREE.MeshStandardMaterial,
      )
      const binding = bindingFor(id)
      binding.baseIntensity = BASE_INTENSITY[id]
      binding.materials.push(...materials)
      placeCharacterLight(mesh, id)
    })
    applyLights(0)
  },
  undefined,
  () => {
    if (!errorText) return
    errorText.hidden = false
    errorText.textContent = '招牌載入失敗，請確認 public/models/denpa_sign/denpa_sign.glb'
  },
)

const gui = new GUI({ title: '電波町燈光' })
gui.add(state, 'master', 0, 2, 0.01).name('總亮度')
gui.addColor(state, 'color').name('燈管顏色').onChange((value: string) => {
  patchDenpaLights(state, { color: value })
  gui.controllersRecursive().forEach((controller) => controller.updateDisplay())
})
gui.add(state, 'mode', { 恆亮: 'steady', 呼吸: 'breathe', 追逐: 'chase', 閃爍: 'flicker' }).name('變化')
gui.add(state, 'speed', 0.2, 3, 0.05).name('速度')
gui.add(state, 'bloom', 0, 1.6, 0.01).name('光暈')

const channelFolder = gui.addFolder('各盞燈')
for (const id of DENPA_CHANNELS) {
  const folder = channelFolder.addFolder(DENPA_CHANNEL_LABEL[id])
  const channel = state.channels[id]
  folder.add(channel, 'enabled').name('開')
  folder.add(channel, 'intensity', 0, 2, 0.01).name('亮度')
  folder.addColor(channel, 'color').name('顏色')
  folder.close()
}

/** 改招牌燈光。顏色用 #rrggbb，mode 可以是 steady、breathe、chase、flicker。 */
export function setDenpaLights(patch: DenpaLightPatch) {
  patchDenpaLights(state, patch)
  gui.controllersRecursive().forEach((controller) => controller.updateDisplay())
  applyLights(clock.getElapsed())
}

export function getDenpaLights(): DenpaLightState {
  return structuredClone(state)
}

declare global {
  interface Window {
    setDenpaLights: typeof setDenpaLights
    getDenpaLights: typeof getDenpaLights
  }
}

window.setDenpaLights = setDenpaLights
window.getDenpaLights = getDenpaLights

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
})

renderer.setAnimationLoop((timestamp) => {
  clock.update(timestamp)
  const delta = Math.min(clock.getDelta(), 0.1)
  controls.update(delta)
  applyLights(clock.getElapsed())
  composer.render()
})
