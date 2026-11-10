import * as THREE from 'three';

/** 鏡頭本地偏移（負 Z = 前方遠景，負 X = 畫面左） */
const RAINBOW_CAM_X = -3.1;
const RAINBOW_CAM_Y = 2.4;
/** 鏡頭本地 −Z，愈負愈遠（要在綠球後方須比球心深） */
const RAINBOW_CAM_Z = -15.5;
const RAINBOW_SCALE = 0.9;
const RAINBOW_BOB = 0.05;
const RAINBOW_ARC_RADIUS = 2.42;
/** 環帶徑向厚度：越大彩虹越寬 */
const RAINBOW_BAND_THICKNESS = 1.4;
const RAINBOW_MESH_OPACITY = 0.52;

const CLOUD_OPACITY = 0.48;

const cloudVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const cloudFragmentShader = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uOpacity;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  p.x *= 1.12;
  float d = length(p);
  float soft = exp(-d * d * 2.6);
  float edge = 1.0 - smoothstep(0.35, 1.05, d);
  float a = mix(soft, edge, 0.35) * uOpacity;
  if (a < 0.003) discard;
  vec3 col = mix(uColor, vec3(1.0), soft * 0.35);
  gl_FragColor = vec4(col, a);
}
`;

function createSoftCloudMaterial(opacity = CLOUD_OPACITY) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xf4f8ff) },
      uOpacity: { value: opacity },
    },
    vertexShader: cloudVertexShader,
    fragmentShader: cloudFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: false,
  });
}

const DEFAULT_RAINBOW_COLORS = [
  '#c9a7eb',
  '#dda5d5',
  '#f6a6c1',
  '#ffafae',
  '#ffbda3',
  '#ffd0a5',
  '#ffe0ad',
] as const;

const rainbowVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const rainbowFragmentShader = /* glsl */ `
varying vec2 vUv;
uniform float uOpacity;
uniform float uIntroReveal;
uniform vec3 uColors[7];

vec3 rainbowAt(float v) {
  v = clamp(v, 0.0, 1.0);
  float seg = v * 6.0;
  int idx = int(floor(seg));
  if (idx > 5) return uColors[6];
  float f = seg - float(idx);
  return mix(uColors[idx], uColors[idx + 1], f);
}

float edgeAlpha(vec2 uv) {
  float featherU = 0.16;
  float featherV = 0.19;
  float edgeU = smoothstep(0.0, featherU, uv.x) * smoothstep(0.0, featherU, 1.0 - uv.x);
  float edgeV = smoothstep(0.0, featherV, uv.y) * smoothstep(0.0, featherV, 1.0 - uv.y);
  return edgeU * edgeV;
}

void main() {
  float v = vUv.y;
  vec3 col =
    rainbowAt(v) * 0.46 +
    rainbowAt(v + 0.022) * 0.27 +
    rainbowAt(v - 0.022) * 0.27;
  float arcOn = 1.0;
  if (uIntroReveal < 0.998) {
    float arcLen = uIntroReveal * 1.07;
    arcOn = 1.0 - smoothstep(arcLen - 0.12, arcLen + 0.02, vUv.x);
  }
  float a = edgeAlpha(vUv) * arcOn * uOpacity;
  if (uIntroReveal < 0.998) a *= smoothstep(0.0, 0.25, uIntroReveal);
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}
`;

export type RainbowSettings = {
  enabled: boolean;
  camX: number;
  camY: number;
  camZ: number;
  scale: number;
  bob: number;
  /** 弧中心半徑（幾何用，非畫面 scale） */
  arcRadius: number;
  /** 色帶厚度，越大越寬 */
  bandThickness: number;
  opacity: number;
  color0: string;
  color1: string;
  color2: string;
  color3: string;
  color4: string;
  color5: string;
  color6: string;
};

function makeColorUniforms(hexColors: string[]) {
  return hexColors.map((hex) => new THREE.Color(hex));
}

function createSoftRainbowMaterial(colorUniforms: THREE.Color[], opacity: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: opacity },
      uIntroReveal: { value: 0 },
      uColors: { value: colorUniforms },
    },
    vertexShader: rainbowVertexShader,
    fragmentShader: rainbowFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: false,
  });
}

/** 半圓環帶（YZ 平面，UV.y = 內→外徑向漸層） */
function createRainbowRibbonGeometry(
  innerRadius: number,
  outerRadius: number,
  arcSegments = 72,
  radialSegments = 28,
) {
  const vertCount = (arcSegments + 1) * (radialSegments + 1);
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const row = radialSegments + 1;
  let p = 0;
  let u = 0;
  for (let i = 0; i <= arcSegments; i++) {
    const t = i / arcSegments;
    const angle = Math.PI * (1 - t);
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    for (let j = 0; j <= radialSegments; j++) {
      const radialT = j / radialSegments;
      const r = THREE.MathUtils.lerp(innerRadius, outerRadius, radialT);
      positions[p++] = 0;
      positions[p++] = sin * r;
      positions[p++] = cos * r;
      uvs[u++] = t;
      uvs[u++] = radialT;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < arcSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function bandRadii(settings: RainbowSettings) {
  const half = settings.bandThickness * 0.5;
  return {
    inner: settings.arcRadius - half,
    outer: settings.arcRadius + half,
  };
}

function collectHexColors(settings: RainbowSettings) {
  return [
    settings.color0,
    settings.color1,
    settings.color2,
    settings.color3,
    settings.color4,
    settings.color5,
    settings.color6,
  ];
}

export function createCartoonRainbow(camera: THREE.Camera) {
  const settings: RainbowSettings = {
    enabled: true,
    camX: RAINBOW_CAM_X,
    camY: RAINBOW_CAM_Y,
    camZ: RAINBOW_CAM_Z,
    scale: RAINBOW_SCALE,
    bob: RAINBOW_BOB,
    arcRadius: RAINBOW_ARC_RADIUS,
    bandThickness: RAINBOW_BAND_THICKNESS,
    opacity: RAINBOW_MESH_OPACITY,
    color0: DEFAULT_RAINBOW_COLORS[0],
    color1: DEFAULT_RAINBOW_COLORS[1],
    color2: DEFAULT_RAINBOW_COLORS[2],
    color3: DEFAULT_RAINBOW_COLORS[3],
    color4: DEFAULT_RAINBOW_COLORS[4],
    color5: DEFAULT_RAINBOW_COLORS[5],
    color6: DEFAULT_RAINBOW_COLORS[6],
  };

  const group = new THREE.Group();
  group.name = 'cartoonRainbow';
  group.frustumCulled = false;

  const { inner, outer } = bandRadii(settings);
  const material = createSoftRainbowMaterial(makeColorUniforms(collectHexColors(settings)), settings.opacity);
  const ribbon = new THREE.Mesh(createRainbowRibbonGeometry(inner, outer), material);
  ribbon.frustumCulled = false;
  ribbon.castShadow = false;
  ribbon.receiveShadow = false;
  ribbon.renderOrder = 0;
  group.add(ribbon);

  const cloudMaterial = createSoftCloudMaterial(CLOUD_OPACITY);
  const cloudPlane = new THREE.PlaneGeometry(1, 1, 1, 1);
  const puff = (x: number, y: number, z: number, rx: number, ry = rx * 0.88) => {
    const mesh = new THREE.Mesh(cloudPlane, cloudMaterial);
    mesh.position.set(x, y, z);
    mesh.scale.set(rx * 2.1, ry * 2.1, 1);
    mesh.rotation.y = Math.PI / 2;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 0;
    group.add(mesh);
  };
  puff(-1.05, -0.22, 0.35, 0.58);
  puff(0.15, -0.32, -0.15, 0.72);
  puff(1.15, -0.18, 0.22, 0.48);

  const faceCamera = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  const anchor = new THREE.Vector3();
  const viewOffset = new THREE.Vector3();
  let bobPhase = 0;
  let lastInner = inner;
  let lastOuter = outer;
  let introReveal = 0;
  let introFinished = false;

  function easeOutCubic(t: number) {
    return 1 - Math.pow(1 - THREE.MathUtils.clamp(t, 0, 1), 3);
  }

  function applyIntroUniforms() {
    const show = introFinished ? 1 : introReveal;
    material.uniforms.uIntroReveal.value = show;
    if (introFinished) {
      cloudMaterial.uniforms.uOpacity.value = CLOUD_OPACITY;
      for (const child of group.children) {
        if (child !== ribbon) child.visible = true;
      }
      return;
    }
    const cloudT = THREE.MathUtils.clamp((introReveal - 0.5) / 0.5, 0, 1);
    cloudMaterial.uniforms.uOpacity.value = CLOUD_OPACITY * easeOutCubic(cloudT);
    for (const child of group.children) {
      if (child === ribbon) continue;
      child.visible = cloudT > 0.08;
    }
  }

  function setIntroReveal(amount: number) {
    introReveal = THREE.MathUtils.clamp(amount, 0, 1);
    if (amount >= 1) introFinished = true;
    applyIntroUniforms();
  }

  function finishIntro() {
    introFinished = true;
    introReveal = 1;
    applyIntroUniforms();
  }

  function resetIntro() {
    introFinished = false;
    introReveal = 0;
    applyIntroUniforms();
  }

  function syncShaderColors() {
    const uniforms = material.uniforms.uColors.value as THREE.Color[];
    const hexes = collectHexColors(settings);
    for (let i = 0; i < 7; i++) uniforms[i].set(hexes[i]);
    material.uniforms.uOpacity.value = settings.opacity;
  }

  function rebuildRibbonIfNeeded() {
    const radii = bandRadii(settings);
    if (radii.inner === lastInner && radii.outer === lastOuter) return;
    lastInner = radii.inner;
    lastOuter = radii.outer;
    ribbon.geometry.dispose();
    ribbon.geometry = createRainbowRibbonGeometry(radii.inner, radii.outer);
  }

  function applyRainbowSettings() {
    syncShaderColors();
    rebuildRibbonIfNeeded();
  }

  function placeInView(bobY = 0) {
    camera.updateMatrixWorld();
    viewOffset.set(settings.camX, settings.camY + bobY, settings.camZ);
    anchor.copy(viewOffset).applyMatrix4(camera.matrixWorld);
    group.position.copy(anchor);
    group.quaternion.copy(camera.quaternion).multiply(faceCamera);
  }

  function syncToCamera() {
    if (!settings.enabled) {
      group.visible = false;
      return;
    }
    const showMesh = introFinished || introReveal > 0.001;
    group.visible = showMesh;
    group.scale.setScalar(settings.scale);
    if (showMesh) placeInView();
  }

  function update(deltaTime: number) {
    if (!settings.enabled) {
      group.visible = false;
      return;
    }
    const showMesh = introFinished || introReveal > 0.001;
    group.visible = showMesh;
    group.scale.setScalar(settings.scale);
    if (!showMesh) return;
    bobPhase += deltaTime;
    const bobY = settings.bob > 0 ? Math.sin(bobPhase * 0.5) * settings.bob : 0;
    placeInView(bobY);
  }

  applyRainbowSettings();
  setIntroReveal(0);
  syncToCamera();

  return { object: group, settings, applyRainbowSettings, setIntroReveal, finishIntro, resetIntro, update };
}
