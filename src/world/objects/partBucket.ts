import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 程式建模的共用小工具（豬豬樹屋、芭蕉葉叢都用）：
 *   - createRng：可重現的亂數（同一個 seed 每次都一樣）
 *   - PartBucket：同一種材質的零件收集起來，最後合併成一個 mesh（減少 draw call），顏色存頂點色
 */

/** mulberry32：同一個 seed 每次得到一樣的亂數序列 */
export function createRng(seed: number) {
  let a = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 同一種材質的零件收集在一起，最後合併成一個 mesh */
export class PartBucket {
  private geometries: THREE.BufferGeometry[] = [];

  /**
   * 把一個零件「烤」進 bucket：套上矩陣、塗上頂點色。
   * 合併時每個幾何的屬性要一模一樣，所以統一轉成非索引、刪掉 uv（我們不用貼圖）。
   */
  add(source: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.ColorRepresentation | null) {
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    source.dispose();
    // color 傳 null：零件自己已經有逐頂點顏色（例如芭蕉葉的葉脈漸層），保留它
    const keepColor = color === null && !!geometry.attributes.color;
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal' && !(keepColor && name === 'color')) geometry.deleteAttribute(name);
    }
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    geometry.applyMatrix4(matrix);
    if (keepColor) {
      this.geometries.push(geometry);
      return;
    }
    const c = new THREE.Color(color ?? 0xffffff);
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometries.push(geometry);
  }

  build() {
    if (this.geometries.length === 0) return null;
    const merged = mergeGeometries(this.geometries, false);
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries = [];
    merged?.computeBoundingSphere();
    return merged;
  }
}
