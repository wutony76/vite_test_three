"""Low Poly 小屋：示範用 Custom Mesh + Extrude / Inset + Boolean Union 建出連續拓撲。

座標（Blender，+Z 朝上，正面朝 -Y，1 單位 = 1 公尺）：

            ridge z=4.28
              /\\         ← Roof（Λ 形厚板，兩片斜面共用屋脊）＋ Chimney（Union 進屋頂）
        _____/  \\_____
       |   □   ▭   □  |  ← Body（五邊形柱：牆 + 山牆三角形，同一個封閉幾何）
       |______▯______|  ← Door / Window_*：獨立 Object（Three.js 可單獨點擊、做動畫）
     [__________________] ← Foundation（長方體，頂面 inset + extrude 做出台階）

階層：House_Root（Empty）底下放所有零件，匯出後是 Three.js 裡的一個 Group。
"""

from .. import api, mesh_builder
from ..result import KitError

# 材質：(名稱, 顏色)
MATERIALS = {
    "stone": ("LPK_Stone", (0.45, 0.45, 0.48)),
    "wall": ("LPK_Wall", (0.93, 0.87, 0.75)),
    "roof": ("LPK_Roof", (0.70, 0.22, 0.18)),
    "brick": ("LPK_Brick", (0.55, 0.30, 0.25)),
    "wood": ("LPK_Wood", (0.45, 0.28, 0.15)),
    "frame": ("LPK_Frame", (0.95, 0.95, 0.95)),
    "glass": ("LPK_Glass", (0.55, 0.75, 0.90)),
}

# 尺寸（公尺）
WIDTH = 4.0          # X 方向牆寬
DEPTH = 3.0          # Y 方向牆深
FOUNDATION_TOP = 0.38
WALL_TOP = 3.08
RIDGE = 4.28
ROOF_OVERHANG = 0.4  # 屋簷往外伸出
ROOF_THICKNESS = 0.18


def _check(result, step):
    """每一步都檢查回傳值；失敗就中止，不要在壞掉的模型上繼續疊東西。"""
    if not result["ok"]:
        raise KitError(result["errors"][0]["code"], f"{step}：{result['errors'][0]['message']}")
    return result


def _material(key):
    name, color = MATERIALS[key]
    return mesh_builder.get_or_create_material(name, color, roughness=0.15 if key == "glass" else 0.8)


def _slope():
    return (RIDGE - WALL_TOP) / (WIDTH / 2)


def build_foundation(root, collection, prefix):
    hw, hd = WIDTH / 2 + 0.3, DEPTH / 2 + 0.3
    verts, faces = mesh_builder.box((-hw, -hd, 0.0), (hw, hd, 0.3))
    name = f"{prefix}Foundation"
    _check(api.create_connected_mesh(name, verts, faces, collection=collection, profile="building_shell",
                                     materials=[_material("stone")], parent=root), name)
    # 頂面往內縮 12cm 再往上推 8cm：同一個 Mesh 長出台階，而不是另外疊一塊
    _check(api.extrude_mesh_region(name, {"normal": [0, 0, 1]}, mode="inset_extrude",
                                   thickness=0.12, depth=FOUNDATION_TOP - 0.3), f"{name} 台階")
    return name


def build_body(root, collection, prefix):
    hw, hd = WIDTH / 2, DEPTH / 2
    # 五邊形輪廓：0-1 底、1-2 右牆、2-3-4 山牆、4-0 左牆
    outline = [(-hw, FOUNDATION_TOP), (hw, FOUNDATION_TOP), (hw, WALL_TOP), (0.0, RIDGE), (-hw, WALL_TOP)]
    # 端面切成「牆面四邊形 + 山牆三角形」，避免產生 ngon
    verts, faces = mesh_builder.prism_from_outline(outline, -hd, hd, cap_faces=[[0, 1, 2, 4], [4, 2, 3]])
    name = f"{prefix}Body"
    _check(api.create_connected_mesh(name, verts, faces, collection=collection, profile="building_shell",
                                     materials=[_material("wall")], parent=root), name)
    return name


def build_roof(root, collection, prefix):
    s = _slope()
    x = WIDTH / 2 + ROOF_OVERHANG
    eave = RIDGE - s * x
    t = ROOF_THICKNESS
    # Λ 形厚板的截面：下緣貼著山牆斜邊，上緣往上加厚 t
    outline = [(-x, eave), (0.0, RIDGE), (x, eave), (x, eave + t), (0.0, RIDGE + t), (-x, eave + t)]
    hd = DEPTH / 2 + ROOF_OVERHANG
    # 端面切成左右兩片四邊形，共用屋脊那條邊
    verts, faces = mesh_builder.prism_from_outline(outline, -hd, hd, cap_faces=[[0, 1, 4, 5], [1, 2, 3, 4]])
    name = f"{prefix}Roof"
    _check(api.create_connected_mesh(name, verts, faces, collection=collection, profile="building_shell",
                                     materials=[_material("roof")], parent=root), name)
    return name


def build_chimney(root, collection, prefix):
    """煙囪底部沿著屋頂斜面切齊在屋頂板的中間，Union 後交界才乾淨。"""
    s = _slope()
    x0, x1, y0, y1, top = 0.9, 1.4, 0.2, 0.7, 4.75

    def mid(x):
        return RIDGE + ROOF_THICKNESS / 2 - s * x

    verts = [
        (x0, y0, mid(x0)), (x1, y0, mid(x1)), (x1, y1, mid(x1)), (x0, y1, mid(x0)),
        (x0, y0, top), (x1, y0, top), (x1, y1, top), (x0, y1, top),
    ]
    _, faces = mesh_builder.box((0, 0, 0), (1, 1, 1))  # 拓撲和長方體相同，只是底面是斜的
    name = f"{prefix}Chimney"
    _check(api.create_connected_mesh(name, verts, faces, collection=collection, profile="building_shell",
                                     materials=[_material("brick")], parent=root), name)
    # 頂面 inset 再往下推：煙囪口
    _check(api.extrude_mesh_region(name, {"normal": [0, 0, 1]}, mode="inset_extrude",
                                   thickness=0.08, depth=-0.35), f"{name} 煙囪口")
    return name


def build_opening(root, collection, name, min_corner, max_corner, facing, materials, inner_material_index,
                  inset=0.07, recess=-0.03):
    """門或窗框：長方體，正面 inset 出邊框後往內推，內側的面換成門板／玻璃材質。"""
    verts, faces = mesh_builder.box(min_corner, max_corner)
    _check(api.create_connected_mesh(name, verts, faces, collection=collection, profile="opening",
                                     materials=materials, parent=root), name)
    _check(api.extrude_mesh_region(name, {"normal": facing}, mode="inset_extrude", thickness=inset,
                                   depth=recess, material_index=inner_material_index), f"{name} 內凹")
    return name


def build_house(prefix="", collection=None, location=(0.0, 0.0, 0.0)):
    """建立整棟小屋，回傳 {"root", "objects", "reports"}。任何一步失敗都會丟 KitError。"""
    root = mesh_builder.create_empty(f"{prefix}House_Root", collection=collection, location=location)
    names = [
        build_foundation(root, collection, prefix),
        build_body(root, collection, prefix),
    ]
    roof = build_roof(root, collection, prefix)
    chimney = build_chimney(root, collection, prefix)
    # 煙囪穿進屋頂板：Union 成同一個連續的幾何，煙囪材質一起帶過來
    _check(api.boolean_union_objects(roof, [chimney]), f"{roof} ∪ {chimney}")
    names.append(roof)

    hd = DEPTH / 2
    door = build_opening(
        root, collection, f"{prefix}Door",
        (-0.45, -hd - 0.08, FOUNDATION_TOP), (0.45, -hd, 2.0), [0, -1, 0],
        [_material("wood")], None, inset=0.08,
    )
    names.append(door)

    window_materials = [_material("frame"), _material("glass")]
    windows = [
        ("Window_FrontL", (-1.65, -hd - 0.06, 1.3), (-0.95, -hd, 2.1), [0, -1, 0]),
        ("Window_FrontR", (0.95, -hd - 0.06, 1.3), (1.65, -hd, 2.1), [0, -1, 0]),
        ("Window_SideR", (WIDTH / 2, -0.45, 1.3), (WIDTH / 2 + 0.06, 0.45, 2.1), [1, 0, 0]),
        ("Window_SideL", (-WIDTH / 2 - 0.06, -0.45, 1.3), (-WIDTH / 2, 0.45, 2.1), [-1, 0, 0]),
    ]
    for label, mn, mx, facing in windows:
        names.append(build_opening(root, collection, f"{prefix}{label}", mn, mx, facing, window_materials, 1))

    reports = {}
    for name in names:
        result = api.validate_mesh_topology(name)
        reports[name] = result["report"]["status"] if result["report"] else "error"
        _check(result, f"{name} 最終驗證")
    return {"root": root.name, "objects": names, "reports": reports}
