"""依 ScenePlan 組裝場景（背景模式）：

    Blender --background --factory-startup --python-exit-code 1 \\
        --python tools/blender/scripts/build_scene.py -- <scene.json> [--export] [--render 目錄]

- --export：Scene QA 通過時匯出到 plan 的 export.path
- --render：輸出 top.png（俯視正交）與 three_quarter.png（3/4 透視）到指定目錄，給 AI 或人工檢視
"""

import json
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from lowpoly_kit import api  # noqa: E402
from lowpoly_kit.qa.visual import SceneState, _setup  # noqa: E402


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not argv:
        raise SystemExit("用法：... -- <scene.json> [--export] [--render 目錄]")
    return {"plan": argv[0], "export": "--export" in argv,
            "render": argv[argv.index("--render") + 1] if "--render" in argv else None}


def render_views(plan, out):
    scene = bpy.context.scene
    state = SceneState(scene)
    try:
        _setup(scene, state, (0.80, 0.88, 0.95))
        shading = scene.display.shading
        shading.light, shading.color_type = "STUDIO", "TEXTURE"
        shading.show_shadows = shading.show_cavity = True
        sx, sy = plan["terrain"]["size"]
        views = {
            "top": dict(location=(0, 0, 80), rotation=(0, 0, 0), ortho=max(sx, sy) * 1.02, size=(1000, 1000)),
            "three_quarter": dict(location=(sx * 0.62, -sy * 0.78, sx * 0.48), target=(0, 0, 0), lens=32, size=(1400, 900)),
        }
        for name, view in views.items():
            data = bpy.data.cameras.new(f"LPK_{name}")
            camera = bpy.data.objects.new(f"LPK_{name}", data)
            scene.collection.objects.link(camera)
            state.temp_objects.append(camera)
            camera.location = view["location"]
            data.clip_end = 500
            if "ortho" in view:
                data.type, data.ortho_scale = "ORTHO", view["ortho"]
                camera.rotation_euler = view["rotation"]
            else:
                data.lens = view["lens"]
                camera.rotation_euler = (Vector(view["target"]) - Vector(view["location"])).to_track_quat("-Z", "Y").to_euler()
            scene.camera = camera
            scene.render.resolution_x, scene.render.resolution_y = view["size"]
            scene.render.filepath = os.path.join(out, f"{name}.png")
            bpy.ops.render.render(write_still=True)
    finally:
        state.restore()


def main():
    args = parse_args()
    path = os.path.abspath(args["plan"])
    with open(path, encoding="utf-8") as handle:
        plan = json.load(handle)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = api.build_scene_from_plan(path, export=args["export"])
    report = result.get("report") or {}
    changes = result.get("changes", {})
    print(f"Scene QA：{report.get('status')}  三角面 {changes.get('triangles')}  draw call 約 {changes.get('draw_calls')}  "
          f"物件 {report.get('sharing', {}).get('objects')}／mesh {report.get('sharing', {}).get('meshes')}")
    print("擺放：", json.dumps(changes.get("placements"), ensure_ascii=False))
    for issue in report.get("issues", []):
        print("SCENE", issue["level"], issue["code"], issue["message"])
    for error in result["errors"]:
        print("ERROR", error["code"], error["message"])
    if changes.get("export"):
        print("匯出：", changes["filepath"])
        print(json.dumps(changes["export"], ensure_ascii=False))
    if args["render"]:
        out = os.path.abspath(args["render"])
        os.makedirs(out, exist_ok=True)
        render_views(plan, out)
        print("預覽：", out)
    if not result["ok"]:
        sys.exit(1)


main()
