"""插畫風窄店面（較高還原）。不走 lowpoly_kit；可用 primitive、倒角、曲線。

正面 -Y，+Z 上，1 單位 = 1 公尺。
匯出：public/models/lime_shop/lime_shop_art.glb
"""

import math
import os

import bpy
from mathutils import Vector

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(REPO, "public", "models", "lime_shop", "lime_shop_art.glb")
COL = "LimeShopArt"
ROOT = "LimeShopArt"

HW, HD = 1.62, 1.22
YF = -HD
TOP = 7.35
GROUND = 0.1


def clear_previous():
    for obj in list(bpy.data.objects):
        if obj.name == ROOT or obj.name.startswith("LimeArt_"):
            bpy.data.objects.remove(obj, do_unlink=True)
    if bpy.data.collections.get(COL):
        bpy.data.collections.remove(bpy.data.collections[COL])


def collection():
    c = bpy.data.collections.get(COL)
    if not c:
        c = bpy.data.collections.new(COL)
        bpy.context.scene.collection.children.link(c)
    return c


def link(obj):
    collection().objects.link(obj)


def mat(name, color, rough=0.75, emit=0.0, metallic=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    rgba = (*color, 1.0)
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
  # don't assign to m.diffuse_color in bulk
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = rgba
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = emit
    return m


def box(name, loc, scale, material, parent=None):
    bpy.ops.mesh.primitive_cube_add(location=loc, scale=scale)
    obj = bpy.context.active_object
    obj.name = name
    for col in obj.users_collection:
        col.objects.unlink(obj)
    link(obj)
    if material:
        if obj.data.materials:
            obj.data.materials[0] = material
        else:
            obj.data.materials.append(material)
    if parent:
        obj.parent = parent
    bpy.ops.object.shade_smooth()
    return obj


def bevel(obj, width=0.018, seg=2):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = seg
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(35)


def parent_all(root):
    for obj in collection().objects:
        if obj != root and obj.parent is None:
            obj.parent = root


def build():
    clear_previous()
    bpy.ops.object.select_all(action="DESELECT")

    m_lime = mat("LimeArt_Plaster", (0.62, 0.80, 0.28), 0.82)
    m_brick = mat("LimeArt_Brick", (0.58, 0.32, 0.22), 0.92)
    m_roof = mat("LimeArt_Roof", (0.42, 0.22, 0.14), 0.8)
    m_yellow = mat("LimeArt_Yellow", (0.98, 0.86, 0.22), 0.65)
    m_wood = mat("LimeArt_Wood", (0.45, 0.28, 0.14), 0.78)
    m_frame = mat("LimeArt_Frame", (0.93, 0.93, 0.9), 0.55)
    m_glass = mat("LimeArt_Glass", (0.42, 0.58, 0.68), 0.05)
    m_metal = mat("LimeArt_Metal", (0.08, 0.08, 0.1), 0.4, metallic=0.9)
    m_glow = mat("LimeArt_Glow", (1.0, 0.88, 0.55), 0.2, emit=3.5)
    m_leaf = mat("LimeArt_Leaf", (0.22, 0.48, 0.18), 0.9)
    m_pot = mat("LimeArt_Pot", (0.52, 0.36, 0.26), 0.85)
    m_black = mat("LimeArt_Black", (0.04, 0.04, 0.05), 0.95)
    m_conc = mat("LimeArt_Concrete", (0.58, 0.56, 0.54), 0.88)
    m_post = mat("LimeArt_Poster", (0.85, 0.82, 0.75), 0.7)

    root = bpy.data.objects.new(ROOT, None)
    root.empty_display_size = 0.5
    link(root)

    # 人行道
    sw = box("LimeArt_Sidewalk", (0.15, YF - 0.38, GROUND / 2), (HW + 0.55, 0.55, GROUND / 2), m_conc, root)

    # 主牆（略厚，稍不方正）
    body = box(
        "LimeArt_Body",
        (0, 0, (TOP + GROUND) / 2),
        (HW, HD, (TOP - GROUND) / 2),
        m_lime,
        root,
    )
    bevel(body, 0.022)

    # 紅磚剝落（不規則多塊）
    brick_specs = [
        (-1.35, -1.48, 1.05, 0.35), (-1.25, -1.42, 1.85, 0.42), (-1.42, -1.38, 2.9, 0.38),
        (-1.18, -1.45, 3.75, 0.32), (-1.38, -1.4, 4.55, 0.45), (-1.22, -1.43, 5.35, 0.4),
        (-1.3, -1.41, 6.15, 0.5), (-1.15, -1.44, 6.75, 0.35),
        (-0.85, -1.46, 1.25, 0.28), (-0.72, -1.44, 2.55, 0.22),
    ]
    for i, (x, y, z, h) in enumerate(brick_specs):
        w = abs(x + HW) * 0.55 + 0.15
        b = box(f"LimeArt_Brick{i}", (x, y, z + h / 2), (w / 2, 0.06, h / 2), m_brick, root)
        b.rotation_euler = (0, 0, math.radians((i % 3 - 1) * 4))

    # 屋簷
    box("LimeArt_Roof", (0, 0, TOP + 0.04), (HW + 0.06, HD + 0.08, 0.055), m_roof, root)

    # 二樓分格窗
    win_c = (-0.08, YF - 0.06, 5.18)
    box("LimeArt_WinFrame", win_c, (0.48, 0.06, 0.58), m_frame, root)
    for dx, dz in ((-0.22, 0.22), (0.22, 0.22), (-0.22, -0.22), (0.22, -0.22)):
        box(f"LimeArt_WinGlass_{dx}_{dz}", (win_c[0] + dx, YF - 0.1, win_c[2] + dz), (0.2, 0.02, 0.24), m_glass, root)
    box("LimeArt_Planter", (-0.08, YF - 0.12, 4.62), (0.52, 0.05, 0.08), m_metal, root)
    for px in (-0.28, 0, 0.28):
        box(f"LimeArt_PlanterLeaf{px}", (px, YF - 0.16, 4.78), (0.14, 0.08, 0.12), m_leaf, root)

    # 壁燈
    box("LimeArt_WallLampArm", (0.88, YF - 0.12, 5.05), (0.06, 0.12, 0.14), m_metal, root)
    box("LimeArt_WallLampGlass", (0.98, YF - 0.08, 5.08), (0.1, 0.08, 0.14), m_glow, root)

    # 雨篷
    aw = box("LimeArt_Awning", (0.12, YF - 0.32, 2.35), (HW - 0.1, 0.22, 0.14), m_yellow, root)
    bevel(aw, 0.015)
    box("LimeArt_AwningLip", (0.12, YF - 0.52, 2.24), (HW - 0.08, 0.04, 0.02), m_yellow, root)

    # 腰線 + 貓
    box("LimeArt_Ledge", (0.05, YF - 0.14, 3.68), (HW - 0.02, 0.09, 0.06), m_wood, root)
    cat_parts = [
        ((0.25, YF - 0.17, 3.82), (0.16, 0.06, 0.1)),
        ((0.2, YF - 0.19, 3.95), (0.05, 0.04, 0.09)),
        ((0.32, YF - 0.19, 3.95), (0.05, 0.04, 0.09)),
        ((0.26, YF - 0.17, 3.88), (0.08, 0.05, 0.05)),
    ]
    for i, (loc, sc) in enumerate(cat_parts):
        box(f"LimeArt_Cat{i}", loc, sc, m_black, root)

    # 門 + 玻璃
    box("LimeArt_Door", (0.78, YF - 0.05, 1.12), (0.42, 0.055, 0.92), m_yellow, root)
    box("LimeArt_DoorFrame", (0.78, YF - 0.065, 1.12), (0.46, 0.04, 0.96), m_frame, root)
    box("LimeArt_DoorGlass", (0.78, YF - 0.1, 1.55), (0.28, 0.02, 0.32), m_glass, root)
    for i in range(3):
        box(f"LimeArt_Step{i}", (0.78, YF - 0.08 - i * 0.11, GROUND + 0.04 + i * 0.06), (0.55, 0.16 - i * 0.02, 0.03), m_conc, root)

    # 櫥窗凹槽與海報
    box("LimeArt_DisplayNiche", (-0.82, YF - 0.04, 1.05), (0.58, 0.12, 0.88), m_lime, root)
    bpy.context.active_object.data.materials.clear()
    bpy.context.active_object.data.materials.append(m_wood)
    for i, (px, pz, hue) in enumerate(((-1.05, 0.55, 0.9), (-0.95, 1.15, 0.3), (-0.65, 0.75, 0.55))):
        pm = mat(f"LimeArt_Poster{i}", (hue, 0.4, 0.35), 0.65)
        p = box(f"LimeArt_Poster{i}", (px, YF - 0.16, pz), (0.14, 0.01, 0.18), pm, root)
        p.rotation_euler = (math.radians(4), math.radians(-8 + i * 6), math.radians(-3 + i * 4))

    # 路燈
    box("LimeArt_LampPole", (HW + 0.28, YF - 0.05, 1.7), (0.04, 0.04, 1.55), m_metal, root)
    box("LimeArt_LampHead", (HW + 0.28, YF - 0.05, 3.42), (0.14, 0.14, 0.18), m_metal, root)
    box("LimeArt_LampBulb", (HW + 0.28, YF - 0.02, 3.38), (0.09, 0.08, 0.1), m_glow, root)

    # 盆栽
    for i, (x, s) in enumerate(((-1.05, 0.13), (HW + 0.15, 0.11), (1.0, 0.12))):
        box(f"LimeArt_Pot{i}", (x, YF - 0.22, GROUND + s), (0.11, 0.1, s), m_pot, root)
        box(f"LimeArt_Plant{i}", (x, YF - 0.26, GROUND + s * 2 + 0.12), (0.16, 0.12, 0.22), m_leaf, root)

    # A 字板
    box("LimeArt_Board", (-HW + 0.22, YF - 0.35, 0.85), (0.22, 0.08, 0.38), m_black, root)

    # 電線（曲線）
    curve = bpy.data.curves.new("LimeArt_WireCurve", type="CURVE")
    curve.bevel_depth = 0.008
    curve.resolution_u = 6
    spline = curve.splines.new("POLY")
    pts = [(-1.4, YF + 0.2, 6.5), (-0.5, YF + 0.35, 6.65), (0.3, YF + 0.15, 6.45), (1.1, YF + 0.3, 6.7)]
    spline.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        spline.points[i].co = (*p, 1)
    wire = bpy.data.objects.new("LimeArt_Wires", curve)
    wire.data.materials.append(m_black)
    link(wire)
    wire.parent = root

    # 招牌掛點（Three.js 可載 denpa_sign）
    anchor = bpy.data.objects.new("LimeArt_SignAnchor", None)
    anchor.empty_display_size = 0.22
    anchor.location = (0.0, YF - 0.45, 2.52)
    anchor["attach_model"] = "denpa_sign/denpa_sign.glb"
    anchor["sign_name"] = "電 • 波 • 町"
    link(anchor)
    anchor.parent = root

    denpa = bpy.data.objects.get("DenpaSign")
    if denpa:
        scale = 0.07
        for child in denpa.children:
            if child.type != "MESH":
                continue
            if not (child.name.startswith("Denpa_Neon_") or child.name.startswith("Denpa_Metal_")):
                continue
            dup = child.copy()
            dup.data = child.data.copy()
            dup.name = f"LimeArt_{child.name}"
            link(dup)
            dup.parent = anchor
            dup.location = (0, 0, 0.05)
            dup.rotation_euler = (math.radians(85), 0, math.radians(180))
            dup.scale = (scale, scale, scale)
            if child.get("neon_channel"):
                dup["neon_channel"] = child["neon_channel"]

    return root


def export_glb(root):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, *root.children_recursive]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_extras=True)
    return OUT


if __name__ == "__main__" or "exec" in dir():
    bpy.ops.object.mode_set(mode="OBJECT")
    r = build()
    path = export_glb(r)
    print("EXPORT", path, "children", len(r.children_recursive))
