"""預覽渲染（Blender 端）：資產的 3/4 視角、場景的俯視與 3/4 視角。

script、MCP runner、e2e 都用這裡的函式，渲染設定只有一份。設定在 finally 中還原（SceneState），
所以也可以在使用者正在使用的 Blender 裡呼叫。
"""

import os

import bpy
from mathutils import Vector

from .visual import SceneState, _setup, _uses_atlas


def _camera(state, name, location, target=None, lens=40, ortho=None, rotation=None):
    data = bpy.data.cameras.new(name)
    camera = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(camera)
    state.temp_objects.append(camera)
    camera.location = location
    data.clip_end = 500
    if ortho:
        data.type, data.ortho_scale = "ORTHO", ortho
        camera.rotation_euler = rotation
    else:
        data.lens = lens
        camera.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    return camera


def _render(scene, camera, path, size):
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def render_asset(plan, root, out_dir):
    """資產的 3/4 透視預覽（棚燈打光，看立體感）。回傳圖片路徑。"""
    scene = bpy.context.scene
    state = SceneState(scene)
    try:
        _setup(scene, state, (0.93, 0.92, 0.88))
        shading = scene.display.shading
        shading.light = "STUDIO"
        shading.color_type = "TEXTURE" if _uses_atlas(root) else "MATERIAL"
        shading.show_shadows = shading.show_cavity = True
        dims = plan["dimensions"]
        size = max(dims["w"], dims["d"], dims["h"])
        origin = Vector(root.matrix_world.translation)
        camera = _camera(state, "LPK_Preview", origin + Vector((size * 1.1, -size * 1.5, size * 0.75)),
                         target=origin + Vector((0.0, 0.0, dims["h"] * 0.42)))
        return _render(scene, camera, os.path.join(out_dir, "three_quarter.png"), (900, 1100))
    finally:
        state.restore()


def render_scene(plan, out_dir):
    """場景的俯視正交與 3/4 透視預覽。回傳 {名稱: 圖片路徑}。"""
    scene = bpy.context.scene
    state = SceneState(scene)
    try:
        _setup(scene, state, (0.80, 0.88, 0.95))
        shading = scene.display.shading
        shading.light, shading.color_type = "STUDIO", "TEXTURE"
        shading.show_shadows = shading.show_cavity = True
        sx, sy = plan["terrain"]["size"]
        top = _camera(state, "LPK_Top", (0, 0, 80), ortho=max(sx, sy) * 1.02, rotation=(0, 0, 0))
        quarter = _camera(state, "LPK_Quarter", (sx * 0.62, -sy * 0.78, sx * 0.48), target=(0, 0, 0), lens=32)
        return {"top": _render(scene, top, os.path.join(out_dir, "top.png"), (1000, 1000)),
                "three_quarter": _render(scene, quarter, os.path.join(out_dir, "three_quarter.png"), (1400, 900))}
    finally:
        state.restore()
