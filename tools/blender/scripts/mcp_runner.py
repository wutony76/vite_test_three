"""MCP server 與 e2e 共用的 Blender 端執行器（背景模式，每次都是乾淨的 factory 設定）：

    Blender --background --factory-startup --python-exit-code 1 \\
        --python tools/blender/scripts/mcp_runner.py -- '<JSON 參數>'

JSON 參數：
- {"action": "build_asset", "plan": 路徑, "export": bool, "preset": 名稱|null, "render_dir": 目錄|null, "out_root": 目錄|null}
- {"action": "build_scene", "scene": 路徑, "export": bool, "render_dir": 目錄|null, "out_root": 目錄|null}

最後一行輸出 `@@LPK_RESULT@@{JSON}`：呼叫端只讀這一行，Blender 自己的 log 都忽略。
out_root：匯出路徑的根目錄（預設是 repo）。e2e 會指到暫存目錄，才不會改到 public/models。
"""

import json
import os
import sys
import traceback

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from lowpoly_kit import api  # noqa: E402
from lowpoly_kit.qa.preview import render_asset, render_scene  # noqa: E402

MARKER = "@@LPK_RESULT@@"


def _summary(result):
    return {"ok": result["ok"], "errors": [{"code": e["code"], "message": e["message"]} for e in result["errors"]]}


def build_asset(args):
    plan_path = os.path.abspath(args["plan"])
    with open(plan_path, encoding="utf-8") as handle:
        plan = json.load(handle)
    result = api.build_asset_from_plan(plan_path, export=args.get("export", False), preset=args.get("preset"),
                                       repo_root=args.get("out_root"))
    report = result.get("report") or {}
    out = _summary(result)
    out.update({
        "id": plan["id"],
        "triangles": result["changes"].get("triangles"),
        "primitives": result["changes"].get("primitives"),
        "objects": {name: {k: info.get(k) for k in ("component", "kind", "tier", "profile", "status", "components",
                                                     "non_manifold", "triangles", "bevel_width")}
                    for name, info in report.get("objects", {}).items()},
        "geometry": {"status": (report.get("geometry") or {}).get("status"),
                     "issues": (report.get("geometry") or {}).get("issues", [])},
        "appearance": report.get("appearance"),
        "detail": report.get("detail"),
        "export": result["changes"].get("export"),
        "filepath": result["changes"].get("filepath"),
        "manifest": result["changes"].get("manifest"),
    })
    if args.get("render_dir") and result["changes"].get("root"):
        render_dir = os.path.abspath(args["render_dir"])
        os.makedirs(render_dir, exist_ok=True)
        root = bpy.data.objects[result["changes"]["root"]]
        visual = api.validate_visual(plan_path, render_dir, root=root)
        rep = visual.get("report") or {}
        out["visual"] = {k: rep.get(k) for k in ("status", "reason", "silhouette_iou", "component_mean", "component_iou",
                                                  "colors", "issues", "images")}
        out["preview"] = render_asset(plan, root, render_dir)
        if not visual["ok"]:
            out["ok"] = False
            out["errors"] += [{"code": e["code"], "message": e["message"]} for e in visual["errors"]]
    return out


def build_scene(args):
    scene_path = os.path.abspath(args["scene"])
    with open(scene_path, encoding="utf-8") as handle:
        scene = json.load(handle)
    result = api.build_scene_from_plan(scene_path, export=args.get("export", False), repo_root=args.get("out_root"))
    out = _summary(result)
    report = result.get("report") or {}
    out.update({
        "id": scene["id"],
        "scene_qa": {k: report.get(k) for k in ("status", "issues", "budget", "sharing", "assets")},
        "placements": result["changes"].get("placements"),
        "export": result["changes"].get("export"),
        "filepath": result["changes"].get("filepath"),
        "manifest": result["changes"].get("manifest"),
    })
    if args.get("render_dir") and result["changes"].get("root"):
        render_dir = os.path.abspath(args["render_dir"])
        os.makedirs(render_dir, exist_ok=True)
        out["preview"] = render_scene(scene, render_dir)
    return out


ACTIONS = {"build_asset": build_asset, "build_scene": build_scene}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    try:
        args = json.loads(argv[0])
        output = ACTIONS[args["action"]](args)
    except Exception as exc:  # noqa: BLE001 — 任何錯誤都要回報成 JSON，呼叫端才知道發生什麼事
        output = {"ok": False, "errors": [{"code": "RUNNER_FAILED", "message": f"{type(exc).__name__}: {exc}"}],
                  "traceback": traceback.format_exc(limit=6)}
    print(MARKER + json.dumps(output, ensure_ascii=False, default=str))


main()
