"""依 AssetPlan 建模（背景模式，不會碰到正在使用的 Blender）：

    Blender --background --factory-startup --python-exit-code 1 \\
        --python tools/blender/scripts/build_from_plan.py -- <plan.json> [--export] [--preset preview] [--render 目錄]

- --export：全部驗證通過後匯出到 plan 的 export.path
- --render：輸出預覽與 Visual QA 到指定目錄（不進版控）
  - 有正面參考圖時執行 Visual QA：front／silhouette／overlay／compare.png、visual_report.json
  - three_quarter.png：3/4 透視視角（棚燈打光，看立體感）
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
from lowpoly_kit.build.orchestrator import summary_table  # noqa: E402
from lowpoly_kit.qa.visual import SceneState, _setup, _uses_atlas  # noqa: E402


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not argv:
        raise SystemExit("用法：... -- <plan.json> [--export] [--preset 名稱] [--render 目錄]")
    args = {"plan": argv[0], "export": "--export" in argv, "preset": None, "render": None}
    for flag in ("--preset", "--render"):
        if flag in argv:
            args[flag[2:]] = argv[argv.index(flag) + 1]
    return args


def render_three_quarter(plan, root, path):
    scene = bpy.context.scene
    state = SceneState(scene)
    try:
        _setup(scene, state, (0.93, 0.92, 0.88))
        shading = scene.display.shading
        shading.light = "STUDIO"
        shading.color_type = "TEXTURE" if _uses_atlas(root) else "MATERIAL"
        shading.show_shadows = True
        shading.show_cavity = True
        dims = plan["dimensions"]
        size = max(dims["w"], dims["d"], dims["h"])
        origin = Vector(root.matrix_world.translation)
        location = origin + Vector((size * 1.1, -size * 1.5, size * 0.75))
        target = origin + Vector((0.0, 0.0, dims["h"] * 0.42))
        data = bpy.data.cameras.new("LPK_Preview")
        data.lens = 40
        camera = bpy.data.objects.new("LPK_Preview", data)
        scene.collection.objects.link(camera)
        state.temp_objects.append(camera)
        camera.location = location
        camera.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()
        scene.camera = camera
        scene.render.resolution_x, scene.render.resolution_y = 900, 1100
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
    finally:
        state.restore()


def main():
    args = parse_args()
    plan_path = os.path.abspath(args["plan"])
    with open(plan_path, encoding="utf-8") as handle:
        plan = json.load(handle)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = api.build_asset_from_plan(plan_path, export=args["export"], preset=args["preset"])
    print(summary_table(result))
    for error in result["errors"]:
        print("ERROR", error["code"], error["message"])
    geometry = (result.get("report") or {}).get("geometry") or {}
    for issue in geometry.get("issues", []):
        print("GEOMETRY", issue["level"], issue["message"])
    if result["changes"].get("export"):
        print("匯出：", result["changes"]["filepath"])
        print(json.dumps(result["changes"]["export"], ensure_ascii=False))

    if args["render"] and result["changes"].get("root"):
        out = os.path.abspath(args["render"])
        os.makedirs(out, exist_ok=True)
        root = bpy.data.objects[result["changes"]["root"]]
        visual = api.validate_visual(plan_path, out, root=root)
        report = visual.get("report") or {}
        if report.get("status") == "skipped":
            print("Visual QA：略過 —", report.get("reason"))
        else:
            print(f"Visual QA：{report.get('status')}  輪廓 IoU {report.get('silhouette_iou')}  "
                  f"元件位置 IoU 平均 {report.get('component_mean')}")
            for issue in report.get("issues", []):
                print("VISUAL", issue["level"], issue["message"])
        for error in visual["errors"]:
            print("ERROR", error["code"], error["message"])
        render_three_quarter(plan, root, os.path.join(out, "three_quarter.png"))
        print("預覽：", out)

    if not result["ok"]:
        sys.exit(1)


main()
