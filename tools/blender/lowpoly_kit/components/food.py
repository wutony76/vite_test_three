"""食物道具：整隻烤雞、焦糖布丁、鮭魚排等。"""

import math

from .. import shapes
from ..surface.painter.patterns import salmon_outline_ring
from . import register


@register("roast_chicken_meat")
def build_roast_chicken_meat(ctx):
    """雞身 + 雙腿：多顆橢球種子，orchestrator Voxel Remesh 融成單一有機體。"""
    data = shapes.MeshData()
    seg = ctx.segments(1.0, minimum=6)
    jitter = 0.035

    body_rx = min(ctx.hw * 0.92, 0.10)
    body_ry = min(ctx.hd * 0.82, 0.078)
    body_rz = min(ctx.h * 0.48, 0.082)
    data.extend(
        shapes.blob((0.0, -ctx.hd * 0.12, body_rz * 0.82), (body_rx, body_ry, body_rz), ctx.material,
                    segments=seg, rings=5, jitter=jitter, rng=ctx.rng)
    )

    lobe_r = body_rx * 0.52
    for sx in (-1.0, 1.0):
        data.extend(
            shapes.blob(
                (sx * body_rx * 0.48, -ctx.hd * 0.55, body_rz * 0.88),
                (lobe_r, lobe_r * 0.78, body_rz * 0.92),
                ctx.material,
                segments=seg,
                rings=4,
                jitter=jitter,
                rng=ctx.rng,
            )
        )

    leg_rx, leg_ry, leg_rz = 0.034, 0.030, 0.058
    for sx in (-1.0, 1.0):
        cx = sx * min(ctx.hw * 0.82, 0.10)
        cz = min(ctx.h * 0.88, 0.122)
        data.extend(
            shapes.blob((cx, 0.0, cz), (leg_rx, leg_ry, leg_rz), ctx.material,
                        segments=max(5, seg - 1), rings=4, jitter=jitter * 0.5, rng=ctx.rng)
        )
    return data


@register("chicken_bone")
def build_chicken_bone(ctx):
    """卡通雞腿骨：細軸 + 雙球節。"""
    h = ctx.h
    r_base = min(ctx.hw, ctx.hd) * 0.55
    shaft = r_base * 0.38
    knob = r_base * 0.95
    z1 = h * 0.58
    z2 = h * 0.78
    z3 = h * 0.96
    profile = [
        (0.0, 0.0),
        (shaft, 0.0),
        (shaft, z1),
        (knob, z2),
        (shaft * 0.85, (z1 + z2) * 0.5),
        (knob * 1.05, z3),
        (knob * 0.7, h),
        (0.0, h),
    ]
    return shapes.lathe(profile, ctx.segments(0.6, minimum=5), ctx.material, axis="z", phase=ctx.rng.random() * math.tau * 0.05)


@register("caramel_pudding")
def build_caramel_pudding(ctx):
    """日式布丁：底寬頂窄的肋狀圓台，頂部焦糖帶（custard + caramel 雙材質）。"""
    flutes = int(ctx.param("flutes", 10))
    seg = max(flutes * 2, ctx.segments(1.15, minimum=20))
    rings = max(5, ctx.segments(0.55, minimum=6))
    r_bottom = min(ctx.hw * 0.94, 0.052)
    r_top = min(ctx.hw * 0.70, 0.038)
    cap = ctx.mat(ctx.param("caramel_material", "caramel"))
    body = ctx.material
    phase = ctx.rng.random() * math.tau / flutes
    depth = float(ctx.param("flute_depth", 0.085))
    return shapes.fluted_frustum(
        r_bottom,
        r_top,
        ctx.h,
        body,
        cap,
        flutes=flutes,
        flute_depth=depth,
        rings=rings,
        segments=seg,
        cap_fraction=float(ctx.param("cap_fraction", 0.16)),
        phase=phase,
    )


@register("grilled_corn_body")
def build_grilled_corn_body(ctx):
    """實心玉米棒：單一旋轉體，底部芯帶 + 錐台棒身（細節交給貼圖）。"""
    seg = max(3, int(ctx.param("sides", 6)))
    r_bot = ctx.hw * 1.02
    r_top = ctx.hw * 0.72
    h = ctx.h
    pith = ctx.mat(ctx.param("pith_material", "cob_pith"))
    kernel = ctx.material
    pith_h = max(h * 0.065, 0.007)
    r_cap = r_top * 0.90
    profile = [
        (0.0, 0.0),
        (r_bot, 0.0),
        (r_bot, pith_h),
        (r_bot * 0.99, h * 0.86),
        (r_cap, h),
    ]
    bands = [pith, pith, kernel, kernel]
    return shapes.lathe(profile, seg, bands, axis="z")


@register("grilled_corn_kernels")
def build_grilled_corn_kernels(ctx):
    """烤玉米：錐台表面排列的圓角粒，部分區域烤焦（雙材質）。"""
    rows = int(ctx.param("rows", 10))
    cols = int(ctx.param("cols", 12))
    char_mat = ctx.mat(ctx.param("char_material", "char"))
    body_mat = ctx.material
    char_prob = float(ctx.param("char_probability", 0.16))
    char_y0 = float(ctx.param("char_y_min", -0.014))
    char_y1 = float(ctx.param("char_y_max", 0.016))

    data = shapes.MeshData()
    z0 = ctx.h * 0.06
    z1 = ctx.h * 0.94
    r_bot = ctx.hw * 0.90
    r_top = ctx.hw * 0.58

    for row in range(rows):
        t = row / max(rows - 1, 1)
        z = z0 + (z1 - z0) * t
        r = r_bot + (r_top - r_bot) * t
        stagger = (math.pi / cols) if row % 2 else 0.0
        for col in range(cols):
            angle = stagger + math.tau * col / cols
            shell = r * 0.90
            cx = math.cos(angle) * shell
            cy = math.sin(angle) * shell
            jitter = 1.0 + ctx.rng.uniform(-0.10, 0.10)
            kr = min(0.0078, ctx.hw * 0.24) * jitter
            kz = kr * (1.05 + ctx.rng.uniform(-0.05, 0.12))
            mat = char_mat if (char_y0 <= cy <= char_y1 and ctx.rng.random() < char_prob) else body_mat
            kcx, kcy, kcz = cx, cy, z + kz * 0.15
            seg = max(4, min(5, ctx.segments(0.35, minimum=4)))
            data.extend(
                shapes.blob(
                    (kcx, kcy, kcz),
                    (kr, kr * 0.86, kz * 0.52),
                    mat,
                    segments=seg,
                    rings=3,
                    jitter=0.035,
                    rng=ctx.rng,
                )
            )
    return data


@register("grilled_corn_end")
def build_grilled_corn_end(ctx):
    """玉米棒底部露出的芯。"""
    r = ctx.hw * 0.72
    h = max(ctx.h * 0.55, 0.004)
    profile = [(0.0, 0.0), (r, 0.0), (r * 0.97, h), (0.0, h)]
    return shapes.lathe(profile, ctx.segments(0.65, minimum=8), ctx.material, axis="z")


@register("fried_egg_white")
def build_fried_egg_white(ctx):
    """荷包蛋白：不規則圓盤（圓周 ≤16 段），略帶起伏。"""
    seg = min(16, max(6, int(ctx.param("sides", 16))))
    wobble = float(ctx.param("wobble", 0.11))
    aspect = ctx.hd / ctx.hw if ctx.hw > 1e-9 else 1.0
    h = max(ctx.h, 0.0025)
    r0 = ctx.hw * 0.96

    def ring(z, bulge=0.0):
        pts = []
        for k in range(seg):
            angle = math.tau * k / seg
            w = 1.0 + wobble * math.sin(angle * 2.3 + 0.4) + wobble * 0.55 * math.cos(angle * 5.1 + 1.2)
            x = math.cos(angle) * r0 * w
            y = math.sin(angle) * r0 * w * aspect
            zz = z + bulge * math.sin(angle * 3.0 + 0.8)
            pts.append((x, y, zz))
        return pts

    return shapes.loft([ring(0.0), ring(h, h * 0.12)], ctx.material, cap_start=True, cap_end=True)


@register("fried_egg_yolk")
def build_fried_egg_yolk(ctx):
    """蛋黃：半球頂（圓周 ≤16 段）。"""
    seg = min(16, max(6, int(ctx.param("sides", 16))))
    r = min(ctx.hw, ctx.hd) * 0.94
    h = max(ctx.h, 0.004)
    steps = max(3, min(8, int(ctx.param("dome_steps", 4))))
    ratio = h / r if r > 1e-9 else 1.0
    profile = []
    for i in range(steps):
        theta = (i / (steps - 1)) * (math.pi / 2)
        profile.append((r * math.cos(theta), r * math.sin(theta) * ratio))
    return shapes.lathe(profile, seg, ctx.material, axis="z")


@register("salmon_steak")
def build_salmon_steak(ctx):
    """鮭魚排切面：參考圖外框的厚片。白筋與魚皮在貼圖上，輪廓點不抽稀，腹尖才不會被吃掉。"""
    h = max(ctx.h, 0.002)
    return shapes.loft(
        [salmon_outline_ring(0.0, ctx.hw, ctx.hd), salmon_outline_ring(h, ctx.hw, ctx.hd)],
        ctx.material,
        cap_start=True,
        cap_end=True,
    )


@register("lemon_slice")
def build_lemon_slice(ctx):
    """檸檬片：厚圓盤。瓣數、白瓤、黃皮都在切面貼圖上，側面採貼圖底部的黃皮帶。"""
    sides = max(6, min(24, int(ctx.param("sides", 8))))
    radius = min(ctx.hw, ctx.hd)
    height = max(ctx.h, 0.002)
    profile = [(0.0, 0.0), (radius, 0.0), (radius, height), (0.0, height)]
    return shapes.lathe(profile, sides, ctx.material, axis="z")


@register("salmon_vertebra")
def build_salmon_vertebra(ctx):
    """中央脊椎骨：略扁的橢球，填在 bounds 裡。"""
    seg = max(8, min(16, int(ctx.param("sides", 12))))
    return shapes.blob(
        (0.0, 0.0, ctx.h * 0.5),
        (ctx.hw * 0.92, ctx.hd * 0.92, ctx.h * 0.46),
        ctx.material,
        segments=seg,
        rings=4,
        jitter=0.0,
    )


@register("bamboo_skewer")
def build_bamboo_skewer(ctx):
    """竹籤：細軸 + 一端尖頭（plan 可設 tip_at: top／bottom）。"""
    h = ctx.h
    r = min(ctx.hw, ctx.hd) * 0.88
    tip_tail = h * 0.06
    if ctx.param("tip_at", "top") == "bottom":
        profile = [(0.0, 0.0), (r, tip_tail), (r, h)]
    else:
        profile = [(0.0, 0.0), (r, 0.0), (r, h - tip_tail), (0.0, h)]
    seg = max(3, int(ctx.param("sides", 6)))
    return shapes.lathe(profile, seg, ctx.material, axis="z")
