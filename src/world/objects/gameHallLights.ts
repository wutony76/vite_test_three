import * as THREE from 'three';
import {
  DENPA_CHANNELS,
  channelEnvelope,
  createDenpaLightState,
  type DenpaChannelId,
  type DenpaLightMode,
  type DenpaLightState,
} from '../../denpa/lights';

const DENPA_NAME_CHANNEL: Record<string, DenpaChannelId> = {
  Denpa_Neon_Den: 'den',
  Denpa_Neon_Ha: 'ha',
  Denpa_Neon_Machi: 'machi',
  Denpa_Neon_Dot: 'dot',
  Denpa_Neon_Outer: 'outer',
  Denpa_Neon_Trim: 'trim',
  Denpa_Bay: 'bay',
};

const NEON_BASE: Record<DenpaChannelId, number> = {
  den: 1.55,
  ha: 1.55,
  machi: 1.55,
  dot: 1.85,
  outer: 1.35,
  trim: 1.15,
  bay: 0.2,
};

const LAMP_COLOR = 0xffd59a;

export type GameHallLightSettings = {
  neonMaster: number;
  neonEmissive: number;
  neonPoint: number;
  lampMaster: number;
  lampEmissive: number;
  lampPoint: number;
  mode: DenpaLightMode;
  speed: number;
};

export function createDefaultGameHallLightSettings(): GameHallLightSettings {
  return {
    neonMaster: 0.04,
    neonEmissive: 0.38,
    neonPoint: 0.28,
    lampMaster: 0,
    lampEmissive: 0.16,
    lampPoint: 0.22,
    mode: 'breathe',
    speed: 0.65,
  };
}

type NeonBinding = {
  materials: THREE.MeshStandardMaterial[];
  lights: THREE.PointLight[];
  baseEmissive: number;
};

type LampBinding = {
  materials: THREE.MeshStandardMaterial[];
  lights: THREE.PointLight[];
  phase: number;
};

export type GameHallLights = {
  settings: GameHallLightSettings;
  bind: (root: THREE.Object3D) => void;
  update: (time: number) => void;
};

function stripBlenderSuffix(name: string) {
  return name.replace(/\.\d+$/, '');
}

function denpaChannelOf(object: THREE.Object3D): DenpaChannelId | null {
  const stored = object.userData?.neon_channel;
  if (typeof stored === 'string' && (DENPA_CHANNELS as readonly string[]).includes(stored)) {
    return stored as DenpaChannelId;
  }
  const base = stripBlenderSuffix(object.name);
  return DENPA_NAME_CHANNEL[base] ?? null;
}

function isShopLampName(name: string) {
  const base = stripBlenderSuffix(name);
  return /(?:^|_)wall_lamp$|(?:^|_)top_light$|(?:^|_)street_lamp$/i.test(base) || /wall_lamp|top_light|street_lamp/i.test(base);
}

function asStandardMaterials(mesh: THREE.Mesh) {
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const out: THREE.MeshStandardMaterial[] = [];
  for (const material of list) {
    if (material instanceof THREE.MeshStandardMaterial) out.push(material);
  }
  return out;
}

const _center = new THREE.Vector3();
const _lampColor = new THREE.Color();

function localGlowCenter(mesh: THREE.Mesh, target: THREE.Vector3) {
  mesh.updateWorldMatrix(true, false);
  new THREE.Box3().setFromObject(mesh).getCenter(target);
  mesh.worldToLocal(target);
  return target;
}

function bindNeonPoint(mesh: THREE.Mesh, id: DenpaChannelId, binding: NeonBinding) {
  if (id !== 'den' && id !== 'ha' && id !== 'machi' && id !== 'trim' && id !== 'outer') return;
  const wide = id === 'trim' || id === 'outer';
  const light = new THREE.PointLight(0xff6110, 0, wide ? 3.2 : 2, 2);
  light.position.copy(localGlowCenter(mesh, _center));
  mesh.add(light);
  binding.lights.push(light);
}

function bindLampPoint(mesh: THREE.Mesh, binding: LampBinding) {
  const light = new THREE.PointLight(LAMP_COLOR, 0, 2.4, 2);
  light.position.copy(localGlowCenter(mesh, _center));
  mesh.add(light);
  binding.lights.push(light);
}

/** gameHall.glb：電波町霓虹 + test01 店招燈（不改模型固有色，只驅動發光） */
export function createGameHallLights(): GameHallLights {
  const settings = createDefaultGameHallLightSettings();
  const denpaState: DenpaLightState = createDenpaLightState();
  const neon = new Map<DenpaChannelId, NeonBinding>();
  const lamps: LampBinding[] = [];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function scan(root: THREE.Object3D) {
    neon.clear();
    lamps.length = 0;
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;

      const channel = denpaChannelOf(mesh);
      if (channel) {
        const materials = asStandardMaterials(mesh);
        if (!materials.length) return;
        let binding = neon.get(channel);
        if (!binding) {
          binding = { materials: [], lights: [], baseEmissive: NEON_BASE[channel] };
          neon.set(channel, binding);
        }
        binding.materials.push(...materials);
        bindNeonPoint(mesh, channel, binding);
        return;
      }

      if (!isShopLampName(mesh.name)) return;
      const materials = asStandardMaterials(mesh);
      if (!materials.length) return;
      const binding: LampBinding = {
        materials,
        lights: [],
        phase: lamps.length * 1.4,
      };
      for (const material of materials) {
        material.emissive.set(LAMP_COLOR);
      }
      bindLampPoint(mesh, binding);
      lamps.push(binding);
    });
  }

  function update(time: number) {
    denpaState.master = 1;
    denpaState.mode = settings.mode;
    denpaState.speed = settings.speed;
    const neonScale = settings.neonMaster;

    for (const id of DENPA_CHANNELS) {
      const binding = neon.get(id);
      if (!binding) continue;
      const channel = denpaState.channels[id];
      const scale = channelEnvelope(id, denpaState, time, reducedMotion) * neonScale;
      for (const material of binding.materials) {
        material.color.set(channel.color);
        material.emissive.set(channel.color);
        material.emissiveIntensity = binding.baseEmissive * settings.neonEmissive * scale;
      }
      for (const light of binding.lights) {
        light.color.set(channel.color);
        const trim = id === 'trim' || id === 'outer' ? 0.45 : 0.75;
        light.intensity = scale * trim * settings.neonPoint;
      }
    }

    _lampColor.set(LAMP_COLOR);
    const lampPulse = reducedMotion ? 1 : 0.82 + 0.18 * Math.sin(time * 2.05);
    for (const binding of lamps) {
      const wave = reducedMotion ? 1 : 0.78 + 0.22 * Math.sin(time * 2.35 + binding.phase);
      const level = settings.lampMaster * lampPulse * wave;
      for (const material of binding.materials) {
        material.emissive.copy(_lampColor);
        material.emissiveIntensity = settings.lampEmissive * level;
      }
      for (const light of binding.lights) {
        light.color.copy(_lampColor);
        light.intensity = settings.lampPoint * level;
      }
    }
  }

  return {
    settings,
    bind(root) {
      scan(root);
      update(0);
    },
    update,
  };
}
