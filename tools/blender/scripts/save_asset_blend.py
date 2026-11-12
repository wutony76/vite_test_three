"""依 plan 建模 + 上 Surface 材質，存成 .blend（給互動 Blender 預覽用）。

    Blender --background --factory-startup --python \\
        tools/blender/scripts/save_asset_blend.py -- <plan.json> <輸出.blend>
"""

import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from lowpoly_kit import api  # noqa: E402
from lowpoly_kit.qa.preview import _camera  # noqa: E402
from lowpoly_kit.qa.visual import SceneState, _setup  # noqa: E402


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(argv) < 2:
        raise SystemExit("用法：... -- <plan.json> <輸出.blend>")
    return os.path.abspath(argv[0]), os.path.abspath(argv[1])


def main():
    plan_path, out_blend = parse_args()
    with open(plan_path, encoding="utf-8") as handle:
        plan = __import__("json").load(handle)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = api.build_asset_from_plan(plan_path, export=False)
    if not result["ok"]:
        for error in result["errors"]:
            print("ERROR", error["code"], error["message"])
        sys.exit(1)

    root_name = result["changes"]["root"]
    root = bpy.data.objects[root_name]
    scene = bpy.context.scene
    state = SceneState(scene)

    _setup(scene, state, (0.93, 0.92, 0.88))
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_shadows = shading.show_cavity = True

    dims = plan["dimensions"]
    size = max(dims["w"], dims["d"], dims["h"])
    origin = Vector(root.matrix_world.translation)
    camera = _camera(
        state,
        "PreviewCamera",
        origin + Vector((size * 1.05, -size * 1.45, size * 0.72)),
        target=origin + Vector((0.0, 0.0, dims["h"] * 0.45)),
        lens=50,
    )
    scene.camera = camera

    for img in bpy.data.images:
        if img.source in {"FILE", "GENERATED"} and img.has_data and not img.packed_file:
            try:
                img.pack()
            except RuntimeError:
                pass
    try:
        bpy.ops.file.pack_all()
    except RuntimeError:
        pass

    os.makedirs(os.path.dirname(out_blend), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out_blend)
    print("saved", out_blend, "root", root_name, "materials", len(bpy.data.materials))


main()
