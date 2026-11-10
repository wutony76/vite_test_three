"""用頂點與面直接建立 Mesh（Custom Mesh），以及常用的形狀產生器。

和 primitive_cube_add 堆疊的差別：這裡由我們決定每個頂點與每個面，
相鄰的面共用同一個頂點，所以幾何天生就是連在一起的。
"""

import bmesh
import bpy

from .result import KitError


# ---------------------------------------------------------------------------
# 材質
# ---------------------------------------------------------------------------

def get_or_create_material(name, color=(0.8, 0.8, 0.8), roughness=0.8):
    """建立純色材質。顏色要寫在 Principled BSDF 節點上，glTF 匯出才會帶到 Three.js。"""
    material = bpy.data.materials.get(name)
    if material is not None:
        return material
    material = bpy.data.materials.new(name)
    if material.node_tree is None:
        # Blender 5.x 新材質預設就有節點；舊版需要手動開啟
        material.use_nodes = True
    rgba = (*color[:3], 1.0)
    # 用節點類型找，不用名稱找：節點名稱會隨 Blender 介面語言改變
    bsdf = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = roughness
    # diffuse_color 只影響 viewport 的 Solid 模式顯示
    material.diffuse_color = rgba
    return material


def _resolve_material(item):
    if isinstance(item, bpy.types.Material):
        return item
    if isinstance(item, str):
        material = bpy.data.materials.get(item)
        if material is None:
            raise KitError("INVALID_ARGUMENT", f"找不到材質：{item!r}")
        return material
    if isinstance(item, dict):
        return get_or_create_material(item["name"], item.get("color", (0.8, 0.8, 0.8)), item.get("roughness", 0.8))
    raise KitError("INVALID_ARGUMENT", f"無法辨識的材質描述：{item!r}")


def _resolve_collection(collection):
    if collection is None:
        return bpy.context.scene.collection
    if isinstance(collection, bpy.types.Collection):
        return collection
    found = bpy.data.collections.get(collection)
    if found is None:
        found = bpy.data.collections.new(collection)
        bpy.context.scene.collection.children.link(found)
    return found


# ---------------------------------------------------------------------------
# 建立 Object
# ---------------------------------------------------------------------------

def create_mesh_object(
    name,
    verts,
    faces,
    collection=None,
    materials=None,
    material_indices=None,
    parent=None,
    location=(0.0, 0.0, 0.0),
    recalc_normals=True,
):
    """from_pydata 建立 Mesh，回傳 (obj, info)。

    - recalc_normals：封閉 Mesh 時統一把法線轉成朝外。
      手寫頂點順序很容易寫反，少了這步，Three.js 開啟 backface culling 時面會消失。
    - material_indices：每個面使用第幾個材質（對應 materials 的順序）。
    """
    if not verts or not faces:
        raise KitError("INVALID_GEOMETRY", f"{name}：verts 與 faces 不能是空的")
    vert_count = len(verts)
    for face in faces:
        if len(face) < 3 or any(i < 0 or i >= vert_count for i in face):
            raise KitError("INVALID_GEOMETRY", f"{name}：面 {list(face)} 的頂點索引不合法")

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    # validate() 會修掉重複的面、指向不存在頂點的索引等錯誤資料，回傳 True 代表有修正
    corrected = mesh.validate(verbose=False)

    bm = bmesh.new()
    bm.from_mesh(mesh)
    closed = len(bm.edges) > 0 and all(len(e.link_faces) == 2 for e in bm.edges)
    if recalc_normals and closed:
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.faces.ensure_lookup_table()
    for face in bm.faces:
        # Low Poly 預設 Flat Shading：每個面一個法線，稜角才會清楚
        face.smooth = False
    if material_indices:
        for face, index in zip(bm.faces, material_indices):
            face.material_index = index
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    for item in materials or []:
        mesh.materials.append(_resolve_material(item))

    obj = bpy.data.objects.new(name, mesh)
    _resolve_collection(collection).objects.link(obj)
    if parent is not None:
        obj.parent = bpy.data.objects[parent] if isinstance(parent, str) else parent
    obj.location = location
    return obj, {"closed": closed, "validate_corrected": bool(corrected)}


def create_empty(name, collection=None, location=(0.0, 0.0, 0.0)):
    """建立 Empty 當作一棟建築的根節點，匯出後就是 Three.js 裡可以整組操作的 Group。"""
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    _resolve_collection(collection).objects.link(empty)
    empty.location = location
    return empty


# ---------------------------------------------------------------------------
# 形狀產生器（只回傳 verts / faces，不建立 Object）
# ---------------------------------------------------------------------------

def box(min_corner, max_corner):
    """長方體：8 個頂點、6 個四邊形。"""
    (x0, y0, z0), (x1, y1, z1) = min_corner, max_corner
    verts = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
    ]
    faces = [
        (0, 3, 2, 1),  # 底
        (4, 5, 6, 7),  # 頂
        (0, 1, 5, 4),  # 前（-Y）
        (1, 2, 6, 5),  # 右（+X）
        (2, 3, 7, 6),  # 後（+Y）
        (3, 0, 4, 7),  # 左（-X）
    ]
    return verts, faces


def prism_from_outline(outline_xz, y0, y1, cap_faces=None):
    """把 XZ 平面上的輪廓沿 Y 軸擠出成柱體。

    - outline_xz：依序排列的 (x, z) 點，構成一個封閉多邊形
    - cap_faces：前後兩端的面要怎麼切，元素是輪廓點的索引清單。
      預設整個輪廓是一個面；凹多邊形或五邊形以上建議自己切成四邊形／三角形，
      避免產生 ngon。
    側面每一段都是一個四邊形，和前後兩端共用頂點，所以整個柱體是一個連續的封閉幾何。
    """
    count = len(outline_xz)
    if count < 3:
        raise KitError("INVALID_GEOMETRY", "輪廓至少需要 3 個點")
    caps = cap_faces or [list(range(count))]
    verts = [(x, y0, z) for x, z in outline_xz] + [(x, y1, z) for x, z in outline_xz]
    faces = []
    for cap in caps:
        faces.append(tuple(cap))
        faces.append(tuple(i + count for i in reversed(cap)))
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, j + count, i + count))
    return verts, faces
