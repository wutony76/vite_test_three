"""把圖樣欄位畫成手繪風貼圖：base color、ORM、normal。

手繪遊戲貼圖和照片貼圖最大的差別：
1. 顏色只在少數幾個色票之間變化（陰影／基底／高光），而且有一點「分階」（posterize），像顏料一筆一筆塗
2. 光影是「畫上去的」：凸起的上緣畫亮、下緣與縫隙畫暗。即使場景光很平，表面也有立體感
3. 邊緣有磨損的亮色、凹處有髒污的暗色

這三件事就是本檔案做的事。陣列約定同 patterns：第 0 列在最上面（v 最大）。
"""

import numpy as np

from ..spec import hex_to_rgb
from . import noise

# 「畫上去的光」從左上方來（圖片座標 y 向下，所以 y 分量是負的）
LIGHT = np.array([-0.45, -0.55, 0.70], dtype=np.float32)
LIGHT /= np.linalg.norm(LIGHT)

# accents 沒有指定顏色時的預設值
DEFAULT_ACCENTS = {"char": "#3A2418"}


def _knots(palette):
    """值域 0～1 對應到色票：0 最深的陰影、0.35 陰影、0.55 基底、0.85 高光、1 最亮。"""
    shadow, base, light = (np.array(hex_to_rgb(h), dtype=np.float32) for h in palette)
    return np.array([0.0, 0.35, 0.55, 0.85, 1.0], dtype=np.float32), np.stack(
        [shadow * 0.72, shadow, base, light, np.minimum(light * 1.08 + 0.02, 1.0)])


def _map_palette(value, palette):
    positions, colors = _knots(palette)
    flat = value.ravel()
    channels = [np.interp(flat, positions, colors[:, c]).reshape(value.shape) for c in range(3)]
    return np.stack(channels, axis=2).astype(np.float32)


def soft_posterize(value, steps=4, amount=0.3):
    """分階但不完全量化：完全量化會出現鋸齒色帶，混一半原值保留筆觸感。"""
    quantized = np.floor(np.clip(value, 0, 0.9999) * steps) / (steps - 1)
    return value * (1 - amount) + np.clip(quantized, 0, 1) * amount


def height_to_normal(height, strength):
    """高度 → tangent-space 法線貼圖（OpenGL 慣例：綠色 = +v，glTF 與 Blender 相同）。

    圖片第 0 列是 v 最大處，所以 d/dv = -d/d(列)。編碼成 0～1：n × 0.5 + 0.5。
    少了編碼（直接把 -1～1 寫進圖片），負值會被截成 0，法線全部歪向同一邊。
    """
    gx, gy = noise.gradient(height)
    k = strength * 6.0 * height.shape[0] / 512.0
    nx, ny, nz = -gx * k, gy * k, np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack([nx / length, ny / length, nz / length], axis=2)
    return normal * 0.5 + 0.5


def paint(fields, spec):
    """fields：patterns 的輸出；spec：spec.resolve_surface 的結果。回傳 base／orm／normal 三張 RGBA。"""
    height, tone, gap, detail = fields["height"], fields["tone"], fields["gap"], fields["detail"]
    size = height.shape[0]
    seed = spec["seed"]

    # 1. 畫上去的光：用高度的斜率算「朝向左上方」的程度
    gx, gy = noise.gradient(height)
    slope = size / 64.0
    lambert = (-gx * slope * LIGHT[0] - gy * slope * LIGHT[1] + LIGHT[2]) / np.sqrt(
        (gx * slope) ** 2 + (gy * slope) ** 2 + 1.0)
    lit = lambert - LIGHT[2]  # 平面 = 0，朝光 > 0，背光 < 0

    # 2. 凹處（cavity）：模糊後的高度比自己高 → 周圍比較高 → 是凹處
    cavity = np.clip((noise.blur(height, max(1, size // 128)) - height) * 3.0, 0, 1)

    gap_k = float(spec.get("gap_shade", 0.42))
    is_corn = spec.get("pattern") == "corn_kernels"
    is_yolk = spec.get("pattern") == "fried_egg_yolk"
    if is_corn:
        on_kernel = np.clip((height - 0.28) / 0.40, 0, 1)
        bump = np.clip((height - 0.38) / 0.42, 0, 1)
        value = (
            0.52 + 0.14 * tone * bump
            + 0.26 * (height - 0.5)
            + 0.14 * detail * bump
            + 0.72 * lit * bump
        )
        seam = np.power(gap, 1.65)
        value -= gap_k * seam
        value -= 0.12 * cavity * seam
    elif is_yolk:
        dome = np.clip((height - 0.35) / 0.55, 0, 1)
        value = 0.54 + 0.16 * tone * dome + 0.22 * (height - 0.5) + 0.08 * detail + 0.78 * lit * dome
        value -= gap_k * gap * 0.6 + 0.22 * cavity
    else:
        value = 0.56 + 0.13 * tone + 0.18 * (height - 0.5) + 0.07 * detail + 0.55 * lit
        value -= gap_k * gap + 0.35 * cavity

    # 3. 磨損：邊緣（斜率大的地方）在雜訊遮罩內提亮
    edge = np.clip(np.sqrt(gx * gx + gy * gy) * size / 24.0, 0, 1)
    wear_mask = noise.fbm(size, 6, seed + 101, octaves=3)
    value += spec["wear"] * 0.3 * edge * np.clip((wear_mask - 0.35) * 3, 0, 1)
    # 4. 髒污：低處與雜訊交集壓暗，並在上色後偏向褐色
    dirt_mask = noise.fbm(size, 3, seed + 202, octaves=4)
    dirt = spec["dirt"] * np.clip((0.55 - height) * 2.2 + (dirt_mask - 0.5), 0, 1)
    value -= 0.22 * dirt

    posterize_steps = int(spec.get("posterize_steps", 4))
    posterize_mix = float(spec.get("posterize_mix", 0.3))
    value = soft_posterize(np.clip(value, 0, 1), steps=posterize_steps, amount=posterize_mix)
    rgb = _map_palette(value, spec["palette"])
    if is_corn:
        seam = np.power(gap, 1.2)[..., None]
        bump = np.clip((height - 0.36) / 0.44, 0, 1)[..., None]
        rgb = np.clip(rgb * (0.82 + 0.34 * bump + 0.10 * lit[..., None] * bump) * (1 - 0.12 * seam), 0, 1)
    rgb = rgb * (1 - 0.25 * dirt[..., None]) + np.array([0.24, 0.18, 0.12], np.float32) * 0.25 * dirt[..., None]

    # 5. accents：第四種顏色（烤焦、條紋），一樣跟著明暗走。
    # 鮭魚排的肉、白筋、魚皮要對上指定色碼，不再乘明暗。
    accent_colors = {**DEFAULT_ACCENTS, **spec.get("accents", {})}
    exact_flat = spec.get("pattern") in ("salmon_marbling", "lemon_slice")
    if exact_flat:
        flesh = np.array(hex_to_rgb(spec["palette"][1]), dtype=np.float32)
        rgb = np.empty((size, size, 3), dtype=np.float32)
        rgb[:] = flesh
    for name, mask in fields.get("accents", {}).items():
        if name not in accent_colors:
            continue
        color = np.array(hex_to_rgb(accent_colors[name]), dtype=np.float32)
        if exact_flat:
            shaded = color[None, None, :]
        else:
            shaded = color[None, None, :] * (0.65 + 0.7 * value[..., None])
        rgb = rgb * (1 - mask[..., None]) + np.clip(shaded, 0, 1) * mask[..., None]

    # 6. ORM：R = 小尺度 AO（縫隙與凹處），G = roughness，B = metallic
    gap_orm = np.power(gap, 2.0) if is_corn else gap
    rough = spec["roughness"] + spec["roughness_variation"] * (gap_orm * 1.2 + cavity - lit * 2 + detail * 0.3)
    if is_corn:
        sauce_m = fields.get("accents", {}).get("sauce")
        if sauce_m is not None:
            rough = rough - sauce_m * 0.24
    elif is_yolk:
        hi = fields.get("accents", {}).get("highlight")
        if hi is not None:
            rough = rough - hi * 0.42
    elif spec.get("pattern") == "lemon_slice":
        lemon = fields.get("accents", {})
        rough = (
            rough
            + lemon.get("pith", 0) * 0.40
            + lemon.get("rind", 0) * 0.16
            + lemon.get("membrane", 0) * 0.08
        )
    occlusion = 1.0 - np.clip(cavity * (0.2 if is_corn else 0.6) + gap_orm * 0.35 * (gap_k / 0.42), 0, 0.8)
    metallic = np.full_like(height, spec["metallic"]) * (1 - gap_orm * 0.7)

    ones = np.ones((size, size, 1), dtype=np.float32)
    base = np.concatenate([np.clip(rgb, 0, 1), ones], axis=2)
    orm = np.stack([occlusion, np.clip(rough, 0.04, 1.0), np.clip(metallic, 0, 1)], axis=2)
    orm = np.concatenate([orm.astype(np.float32), ones], axis=2)
    normal = np.concatenate([height_to_normal(height, spec["normal_strength"]).astype(np.float32), ones], axis=2)
    return {"base": base.astype(np.float32), "orm": orm, "normal": normal}
