import * as THREE from 'three';

/**
 * GameHall（電 • 波 • 町 遊樂中心）背後的 4 層同心霓虹燈環。
 *
 * - 掛在 GameHall 的長方體底下（座標用長方體自己的單位：寬 1.25、高 1.4、深 0.91），
 *   所以拖曳、縮放、入場長大都會跟著建築一起動
 * - 模型正面是 +Z，所以「背後」是 −Z：燈環立在建築後面、面向前方，從正面看會在建築四周露出一圈圈光
 * - 4 層由外到內，每層再往後退一點，側看有層次
 * - 動畫：亮度一層一層輪流往內跑（像遊樂場招牌的跑馬燈）
 */
export type GameHallRingsSettings = {
  enabled: boolean;
  /** 最外圈半徑（長方體單位；建築寬 1.25） */
  outerRadius: number;
  /** 每圈往內縮多少 */
  spacing: number;
  /** 燈管粗細（半徑） */
  tube: number;
  /** 燈環中心離地多高 */
  centerHeight: number;
  /** 離建築背面多遠 */
  backOffset: number;
  /** 每一層再往後退多少 */
  layerDepth: number;
  /** 發光強度 */
  glow: number;
  /** 跑馬燈速度（0 = 不閃） */
  speed: number;
  /** 跑馬燈明暗差（0 = 一直全亮，1 = 暗到熄滅） */
  pulse: number;
  color1: string;
  color2: string;
  color3: string;
  color4: string;
};

export const GAME_HALL_RINGS_DEFAULT: GameHallRingsSettings = {
  enabled: true,
  outerRadius: 0.95,
  spacing: 0.17,
  tube: 0.022,
  centerHeight: 0.95,
  backOffset: -0.08,
  layerDepth: 0.06,
  glow: 1.6,
  speed: 1.2,
  pulse: 0.55,
  // 遊樂中心霓虹配色：青、洋紅、黃、紫（由外到內）
  color1: '#5ff2e6',
  color2: '#ff5fd8',
  color3: '#ffd84a',
  color4: '#a24df5',
};

const RING_COUNT = 4;
/**
 * 燈環最低點至少要離地這麼高：長方體的子物件會被「貼球面」，
 * 離地很近的頂點會被拉去貼地，燈環底部就會被壓扁。
 * 注意貼球面只看「幾何本身的座標」、不看 mesh.position，所以位置要直接寫進幾何（見 rebuild）
 */
const MIN_CLEARANCE = 0.12;

export function createGameHallRings(houseDepth: () => number) {
  const settings: GameHallRingsSettings = { ...GAME_HALL_RINGS_DEFAULT };
  const group = new THREE.Group();
  group.name = 'game_hall_rings';

  const rings: Array<{ mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; base: THREE.Color }> = [];
  let builtKey = '';

  for (let i = 0; i < RING_COUNT; i++) {
    // MeshBasicMaterial 不受光照影響、toneMapped 關掉：顏色乘上強度後可以超過 1，看起來是「發光」的燈管
    // 少了 toneMapped = false，再亮也會被色調映射壓回去，像塗了螢光漆而不是燈
    const material = new THREE.MeshBasicMaterial({ toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.name = `game_hall_ring_${i + 1}`;
    // 燈管不投影子：細細一圈的影子落在建築背面只會像髒污
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    rings.push({ mesh, material, base: new THREE.Color() });
  }

  function colorOf(i: number) {
    return [settings.color1, settings.color2, settings.color3, settings.color4][i];
  }

  /**
   * 形狀或位置有變才重建幾何（重建要花時間，拖滑桿時每一格都會跑）。
   * 位置直接 translate 進幾何、mesh 留在原點：
   * 貼球面看的是幾何座標，圓環幾何中心在原點時下半圈 y < 0，會被當成「貼地的部分」拉成一片。
   * 每次都換新的幾何：貼球面會把第一次看到的頂點存起來當原始值，沿用舊幾何的話位置改了也會被還原回去
   */
  function rebuild() {
    // 中心要夠高，最外圈的底部才不會碰到地面被貼球面壓扁
    const centerY = Math.max(settings.centerHeight, settings.outerRadius + settings.tube + MIN_CLEARANCE);
    const backZ = -houseDepth() / 2 - settings.backOffset;
    const key = [settings.outerRadius, settings.spacing, settings.tube, centerY, backZ, settings.layerDepth].join(',');
    if (key === builtKey) return;
    builtKey = key;
    rings.forEach(({ mesh }, i) => {
      const radius = Math.max(settings.tube * 2, settings.outerRadius - settings.spacing * i);
      mesh.geometry.dispose();
      // TorusGeometry 預設躺在 XY 平面、面向 +Z：剛好是「立著、面向前方」
      const geometry = new THREE.TorusGeometry(radius, settings.tube, 8, 64);
      geometry.translate(0, centerY, backZ - settings.layerDepth * i);
      mesh.geometry = geometry;
    });
  }

  function applySettings() {
    rebuild();
    group.visible = settings.enabled;
    rings.forEach(({ base }, i) => base.set(colorOf(i)));
  }

  /** 跑馬燈：亮度從外圈往內圈輪流變亮 */
  function update(time: number) {
    if (!settings.enabled) return;
    rings.forEach(({ material, base }, i) => {
      const phase = time * settings.speed * Math.PI * 2 * 0.5 - i * (Math.PI / 2);
      const wave = 0.5 + 0.5 * Math.sin(phase);
      const level = settings.glow * (1 - settings.pulse + settings.pulse * wave);
      material.color.copy(base).multiplyScalar(level);
    });
  }

  applySettings();
  update(0);

  return { object: group, settings, applySettings, update };
}

export type GameHallRings = ReturnType<typeof createGameHallRings>;

export function formatGameHallRingsSettingsForPaste(s: GameHallRingsSettings) {
  return (
    `// 貼回 src/world/objects/gameHallRings.ts 的 GAME_HALL_RINGS_DEFAULT\n` +
    `export const GAME_HALL_RINGS_DEFAULT: GameHallRingsSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  outerRadius: ${s.outerRadius.toFixed(3)},\n` +
    `  spacing: ${s.spacing.toFixed(3)},\n` +
    `  tube: ${s.tube.toFixed(3)},\n` +
    `  centerHeight: ${s.centerHeight.toFixed(3)},\n` +
    `  backOffset: ${s.backOffset.toFixed(3)},\n` +
    `  layerDepth: ${s.layerDepth.toFixed(3)},\n` +
    `  glow: ${s.glow.toFixed(2)},\n` +
    `  speed: ${s.speed.toFixed(2)},\n` +
    `  pulse: ${s.pulse.toFixed(2)},\n` +
    `  color1: '${s.color1}',\n` +
    `  color2: '${s.color2}',\n` +
    `  color3: '${s.color3}',\n` +
    `  color4: '${s.color4}',\n` +
    `};`
  );
}
