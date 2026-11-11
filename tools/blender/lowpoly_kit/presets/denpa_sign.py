"""霓虹招牌「電 • 波 • 町」。

直式燈箱：青綠色金屬框，字由一條條橫向燈管組成，中間圓點分開。
正面朝 -Y，+Z 朝上，1 單位 = 1 公尺。
幾何用頂點與面一次建立，不用 primitive 堆疊再 Join。

Three.js 靠物件的 custom property `neon_channel` 調光（會進 userData）：
den 電、ha 波、machi 町、dot 圓點、outer 外框、trim 內框、bay 燈箱內壁。
每個通道是獨立材質，才能各自改顏色和亮度。
"""

import math
import os

import bmesh
import bpy

from .. import api, mesh_builder
from ..result import KitError

ROOT_NAME = "DenpaSign"
COLLECTION = "DenpaSign"
# 放到場景右側，不跟原點上的其他模型重疊
ROOT_LOCATION = (16.0, 0.0, 0.0)

# 每個字的取樣格數。橫向每一列會變成一根燈管，列數就是燈管密度
COLS = 22
ROWS = 18
CHAR_HEIGHT = 1.46
WALL = 0.16
INNER_PAD_X = 0.22
INNER_PAD_Z = 0.2

# 深度：越小的 Y 越靠近鏡頭
Y_FRONT = -0.02
Y_BACK = 0.5
POCKET_Y = 0.22
METAL_Y = (0.05, 0.16)
NEON_Y = (-0.08, 0.055)
TRIM_Y = (-0.015, 0.045)
# 外框燈條比金屬正面再往鏡頭凸一點，外側留一圈金屬邊
OUTER_Y = (-0.078, -0.012)
BAY_Y = (0.175, 0.205)
DOT_Y = (-0.07, 0.04)

METAL = ("LPK_Denpa_Metal", (0.16, 0.42, 0.40), 0.78, 0.08, 0.0)
CABINET = ("LPK_Denpa_Cabinet", (0.11, 0.30, 0.30), 0.84, 0.06, 0.0)
# name, base/emission rgb, roughness, metallic, emission strength
NEON = {
    "den": ("LPK_Denpa_Neon_Den", (1.0, 0.38, 0.06), 0.35, 0.0, 4.0),
    "ha": ("LPK_Denpa_Neon_Ha", (1.0, 0.38, 0.06), 0.35, 0.0, 4.0),
    "machi": ("LPK_Denpa_Neon_Machi", (1.0, 0.38, 0.06), 0.35, 0.0, 4.0),
    "dot": ("LPK_Denpa_Neon_Dot", (1.0, 0.46, 0.12), 0.3, 0.0, 4.5),
    "outer": ("LPK_Denpa_Neon_Outer", (1.0, 0.42, 0.08), 0.32, 0.0, 3.6),
    "trim": ("LPK_Denpa_Neon_Trim", (1.0, 0.32, 0.05), 0.32, 0.0, 3.2),
    "bay": ("LPK_Denpa_Neon_Bay", (0.45, 0.12, 0.03), 0.6, 0.0, 0.45),
}

# 由下往上排，直式閱讀由上往下是 電 • 波 • 町
STACK = (
    ("machi", "町"),
    ("dot", None),
    ("ha", "波"),
    ("dot", None),
    ("den", "電"),
)


def _check(result, step):
    if not result["ok"]:
        raise KitError(result["errors"][0]["code"], f"{step}：{result['errors'][0]['message']}")
    return result


def _font_path():
    folder = "/System/Library/Fonts"
    matches = [name for name in os.listdir(folder) if name.endswith("W8.ttc")]
    if matches:
        return os.path.join(folder, matches[0])
    fallback = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
    if os.path.exists(fallback):
        return fallback
    raise KitError("INVALID_ARGUMENT", "找不到可載入的中文黑體")


def _material(spec):
    name, color, roughness, metallic, emission = spec
    material = mesh_builder.get_or_create_material(name, color, roughness=roughness)
    bsdf = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    rgba = (*color, 1.0)
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Emission Color"].default_value = rgba
    bsdf.inputs["Emission Strength"].default_value = emission
    material.diffuse_color = rgba
    return material


def _point_in_tri(px, py, a, b, c):
    v0x, v0y = c[0] - a[0], c[1] - a[1]
    v1x, v1y = b[0] - a[0], b[1] - a[1]
    v2x, v2y = px - a[0], py - a[1]
    dot00 = v0x * v0x + v0y * v0y
    dot01 = v0x * v1x + v0y * v1y
    dot02 = v0x * v2x + v0y * v2y
    dot11 = v1x * v1x + v1y * v1y
    dot12 = v1x * v2x + v1y * v2y
    inv = dot00 * dot11 - dot01 * dot01
    if abs(inv) < 1e-14:
        return False
    u = (dot11 * dot02 - dot01 * dot12) / inv
    v = (dot00 * dot12 - dot01 * dot02) / inv
    return u >= -1e-7 and v >= -1e-7 and u + v <= 1 + 1e-7


def _rasterize(char, font):
    """把字體填色面取樣成點陣。字洞（田、電的中空）會保持空的。"""
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.object.text_add()
    text = bpy.context.active_object
    curve_name = text.data.name
    text.data.body = char
    text.data.font = font
    text.data.size = 1.0
    text.data.extrude = 0.0
    text.data.fill_mode = "FRONT"
    text.data.align_x = "CENTER"
    text.data.align_y = "CENTER"
    text.data.resolution_u = 8
    bpy.ops.object.convert(target="MESH")
    text = bpy.context.active_object
    bm = bmesh.new()
    try:
        bm.from_mesh(text.data)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        tris = [tuple((vert.co.x, vert.co.y) for vert in face.verts) for face in bm.faces]
        xs = [point[0] for tri in tris for point in tri]
        ys = [point[1] for tri in tris for point in tri]
        minx, maxx = min(xs), max(xs)
        miny, maxy = min(ys), max(ys)
        pad_x = (maxx - minx) * 0.035
        pad_y = (maxy - miny) * 0.035
        x0, x1 = minx - pad_x, maxx + pad_x
        y0, y1 = miny - pad_y, maxy + pad_y
        mask = []
        for row in range(ROWS):
            cy = y1 - (row + 0.5) * (y1 - y0) / ROWS
            bits = []
            for col in range(COLS):
                cx = x0 + (col + 0.5) * (x1 - x0) / COLS
                bits.append(any(_point_in_tri(cx, cy, *tri) for tri in tris))
            mask.append(bits)
    finally:
        bm.free()
        mesh = text.data
        bpy.data.objects.remove(text, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
        curve = bpy.data.curves.get(curve_name)
        if curve is not None and curve.users == 0:
            bpy.data.curves.remove(curve)
    width = maxx - minx + 2 * pad_x
    height = maxy - miny + 2 * pad_y
    return mask, width / height


def _append(verts, faces, more_verts, more_faces):
    base = len(verts)
    verts.extend(more_verts)
    faces.extend(tuple(index + base for index in face) for face in more_faces)


def _extrude_mask(mask, x_left, z_top, cell_w, cell_h, y_front, y_back):
    """把點陣擠成一塊封閉實體。相鄰格子共用頂點，字洞有內壁。"""
    rows = len(mask)
    cols = len(mask[0])
    verts = []
    faces = []
    index = {}

    def on(col, row):
        return 0 <= col < cols and 0 <= row < rows and mask[row][col]

    def group_at(ix, iz, col, row):
        """斜對角只碰到一個點時，兩塊不能共用那個頂點，否則直邊會接上四面。"""
        nw = on(ix, iz)
        ne = on(ix - 1, iz)
        sw = on(ix, iz - 1)
        se = on(ix - 1, iz - 1)
        pinch = (nw and se and not ne and not sw) or (ne and sw and not nw and not se)
        if pinch and row == iz - 1:
            return 1
        return 0

    def vid(ix, iz, side, col, row):
        group = group_at(ix, iz, col, row)
        key = (ix, iz, side, group)
        found = index.get(key)
        if found is None:
            found = len(verts)
            index[key] = found
            nudge = 0.0004 if group else 0.0
            verts.append((
                x_left + ix * cell_w + nudge,
                y_front if side == 0 else y_back,
                z_top - iz * cell_h + nudge,
            ))
        return found

    for row in range(rows):
        for col in range(cols):
            if not mask[row][col]:
                continue
            sw, se = vid(col, row + 1, 0, col, row), vid(col + 1, row + 1, 0, col, row)
            ne, nw = vid(col + 1, row, 0, col, row), vid(col, row, 0, col, row)
            swb, seb = vid(col, row + 1, 1, col, row), vid(col + 1, row + 1, 1, col, row)
            neb, nwb = vid(col + 1, row, 1, col, row), vid(col, row, 1, col, row)
            faces.append((sw, se, ne, nw))
            faces.append((swb, nwb, neb, seb))
            if not on(col - 1, row):
                faces.append((nw, sw, swb, nwb))
            if not on(col + 1, row):
                faces.append((se, ne, neb, seb))
            if not on(col, row - 1):
                faces.append((nw, ne, neb, nwb))
            if not on(col, row + 1):
                faces.append((se, sw, swb, seb))
    return verts, faces


def _slat_boxes(mask, x_left, z_top, cell_w, cell_h, y_front, y_back):
    """每一列的連續筆畫變成一根橫向燈管，上下左右留一點金屬邊。"""
    verts = []
    faces = []
    lip_x = cell_w * 0.08
    lip_z = cell_h * 0.18
    for row, bits in enumerate(mask):
        col = 0
        width = len(bits)
        while col < width:
            if not bits[col]:
                col += 1
                continue
            start = col
            while col < width and bits[col]:
                col += 1
            run = (col - start) * cell_w
            inset_x = min(lip_x, run * 0.22)
            x0 = x_left + start * cell_w + inset_x
            x1 = x_left + col * cell_w - inset_x
            z1 = z_top - row * cell_h - lip_z
            z0 = z_top - (row + 1) * cell_h + lip_z
            if x1 - x0 < 1e-4 or z1 - z0 < 1e-4:
                continue
            box_verts, box_faces = mesh_builder.box((x0, y_front, z0), (x1, y_back, z1))
            _append(verts, faces, box_verts, box_faces)
    return verts, faces


def _pocket_cabinet(x0, x1, z0, z1, wall):
    """厚燈箱：外殼封閉，正面凹進一個口袋，字放在口袋裡。"""
    y0, y1, yp = Y_FRONT, Y_BACK, POCKET_Y
    ix0, ix1 = x0 + wall, x1 - wall
    iz0, iz1 = z0 + wall, z1 - wall
    # 0-3 外框正面，4-7 外框背面，8-11 開口，12-15 口袋底
    verts = [
        (x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1),
        (x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1),
        (ix0, y0, iz0), (ix1, y0, iz0), (ix1, y0, iz1), (ix0, y0, iz1),
        (ix0, yp, iz0), (ix1, yp, iz0), (ix1, yp, iz1), (ix0, yp, iz1),
    ]
    faces = [
        (0, 1, 9, 8), (1, 2, 10, 9), (2, 3, 11, 10), (3, 0, 8, 11),
        (8, 9, 13, 12), (9, 10, 14, 13), (10, 11, 15, 14), (11, 8, 12, 15),
        (12, 13, 14, 15),
        (4, 7, 6, 5),
        (0, 4, 5, 1), (2, 1, 5, 6), (3, 2, 6, 7), (0, 3, 7, 4),
    ]
    return verts, faces


def _picture_frame(x0, x1, z0, z1, border, y0, y1):
    """矩形燈管框，中間挖空，封閉且只有一個幾何島。"""
    ix0, ix1 = x0 + border, x1 - border
    iz0, iz1 = z0 + border, z1 - border
    verts = [
        (x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1),
        (x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1),
        (ix0, y0, iz0), (ix1, y0, iz0), (ix1, y0, iz1), (ix0, y0, iz1),
        (ix0, y1, iz0), (ix1, y1, iz0), (ix1, y1, iz1), (ix0, y1, iz1),
    ]
    faces = [
        (0, 8, 9, 1), (1, 9, 10, 2), (2, 10, 11, 3), (3, 11, 8, 0),
        (4, 5, 13, 12), (5, 6, 14, 13), (6, 7, 15, 14), (7, 4, 12, 15),
        (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
        (8, 12, 13, 9), (9, 13, 14, 10), (10, 14, 15, 11), (11, 15, 12, 8),
    ]
    return verts, faces


def _dot(cx, cz, radius=0.085):
    verts = []
    faces = []
    y0, y1 = DOT_Y
    sides = 8
    ring = []
    for side in range(sides):
        angle = math.tau * side / sides
        ring.append((cx + radius * math.cos(angle), cz + radius * math.sin(angle)))
    base = 0
    for y in (y0, y1):
        for x, z in ring:
            verts.append((x, y, z))
    for index in range(1, sides - 1):
        faces.append((base, base + index, base + index + 1))
        faces.append((base + sides, base + sides + index + 1, base + sides + index))
    for index in range(sides):
        nxt = (index + 1) % sides
        faces.append((base + index, base + nxt, base + sides + nxt, base + sides + index))
    return verts, faces


def _remove_previous():
    for obj in list(bpy.data.objects):
        if obj.name != ROOT_NAME and not obj.name.startswith("Denpa_"):
            continue
        mesh = obj.data if obj.type == "MESH" else None
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh is not None and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    collection = bpy.data.collections.get(COLLECTION)
    if collection is not None:
        bpy.data.collections.remove(collection)


def _place(name, verts, faces, profile, material, parent, channel=None):
    result = _check(api.create_connected_mesh(
        name, verts, faces,
        collection=COLLECTION,
        profile=profile,
        materials=[material],
        parent=parent,
        validate=True,
    ), name)
    obj = bpy.data.objects[name]
    obj["sign_name"] = "電 • 波 • 町"
    if channel:
        obj["neon_channel"] = channel
    _check(api.repair_mesh_topology(obj, profile=profile), f"{name} repair")
    report = _check(api.validate_mesh_topology(obj, profile=profile), f"{name} validate")
    checks = report["report"]["checks"]
    return {
        "name": name,
        "profile": profile,
        "channel": channel or "",
        "status": report["report"]["status"],
        "components": checks["components"],
        "non_manifold": checks["non_manifold_edges"],
        "faces": checks["faces"],
        "ngons": checks["ngons"],
        "created": result["ok"],
    }


def build():
    """建立招牌並掛在 DenpaSign 底下。回傳每個零件的拓撲摘要。"""
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    _remove_previous()
    font = bpy.data.fonts.load(_font_path(), check_existing=True)

    glyphs = {}
    for _channel, char in (("den", "電"), ("ha", "波"), ("machi", "町")):
        mask, aspect = _rasterize(char, font)
        glyphs[char] = {
            "mask": mask,
            "aspect": aspect,
            "height": CHAR_HEIGHT,
            "width": CHAR_HEIGHT * aspect,
        }
    max_width = max(glyph["width"] for glyph in glyphs.values())
    half_inner = max_width / 2 + INNER_PAD_X
    z = WALL + INNER_PAD_Z
    placements = []
    for kind, char in STACK:
        if kind == "dot":
            z += 0.05
            placements.append(("dot", None, z + 0.085))
            z += 0.17 + 0.05
            continue
        glyph = glyphs[char]
        placements.append((kind, glyph, z))
        z += glyph["height"]
    z_top = z + INNER_PAD_Z + WALL
    half_outer = half_inner + WALL

    root = mesh_builder.create_empty(ROOT_NAME, collection=COLLECTION, location=ROOT_LOCATION)
    root["sign_name"] = "電 • 波 • 町"
    root.empty_display_size = 0.4

    reports = []
    cabinet_verts, cabinet_faces = _pocket_cabinet(-half_outer, half_outer, 0.0, z_top, WALL)
    reports.append(_place(
        "Denpa_Cabinet", cabinet_verts, cabinet_faces, "building_shell", _material(CABINET), root,
    ))

    outer_lip = 0.028
    outer_verts, outer_faces = _picture_frame(
        -half_outer + outer_lip, half_outer - outer_lip, outer_lip, z_top - outer_lip, 0.052, *OUTER_Y,
    )
    reports.append(_place(
        "Denpa_Neon_Outer", outer_verts, outer_faces, "decoration", _material(NEON["outer"]), root, "outer",
    ))

    bay_verts, bay_faces = mesh_builder.box(
        (-half_inner + 0.05, BAY_Y[0], WALL + 0.05),
        (half_inner - 0.05, BAY_Y[1], z_top - WALL - 0.05),
    )
    reports.append(_place(
        "Denpa_Bay", bay_verts, bay_faces, "decoration", _material(NEON["bay"]), root, "bay",
    ))

    trim_verts, trim_faces = _picture_frame(
        -half_inner + 0.02, half_inner - 0.02, WALL + 0.02, z_top - WALL - 0.02, 0.05, *TRIM_Y,
    )
    reports.append(_place(
        "Denpa_Neon_Trim", trim_verts, trim_faces, "decoration", _material(NEON["trim"]), root, "trim",
    ))

    dot_verts = []
    dot_faces = []
    for kind, glyph, origin_z in placements:
        if kind == "dot":
            more_verts, more_faces = _dot(0.0, origin_z)
            _append(dot_verts, dot_faces, more_verts, more_faces)
            continue
        cell_w = glyph["width"] / COLS
        cell_h = glyph["height"] / ROWS
        x_left = -glyph["width"] / 2
        z_top_glyph = origin_z + glyph["height"]
        metal_verts, metal_faces = _extrude_mask(
            glyph["mask"], x_left, z_top_glyph, cell_w, cell_h, *METAL_Y,
        )
        neon_verts, neon_faces = _slat_boxes(
            glyph["mask"], x_left, z_top_glyph, cell_w, cell_h, *NEON_Y,
        )
        reports.append(_place(
            f"Denpa_Metal_{kind.title()}", metal_verts, metal_faces,
            "decoration", _material(METAL), root,
        ))
        reports.append(_place(
            f"Denpa_Neon_{kind.title()}", neon_verts, neon_faces,
            "decoration", _material(NEON[kind]), root, kind,
        ))
    reports.append(_place(
        "Denpa_Neon_Dot", dot_verts, dot_faces, "decoration", _material(NEON["dot"]), root, "dot",
    ))
    for child in root.children_recursive:
        if child.type == "MESH":
            api.clear_backups(child)
    return {"root": root.name, "location": ROOT_LOCATION, "height": z_top, "reports": reports}
