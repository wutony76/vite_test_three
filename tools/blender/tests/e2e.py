"""Test A／Test B 端到端驗收：一條指令跑完所有測試，並逐條判定原始需求的驗收條件。

    python3 tools/blender/tests/e2e.py [--skip-units] [--silhouette 0.85]

步驟：
1. 純 Python 測試  2. headless Blender 測試套件
3. Test A：建 test01_shop（含 Visual QA），匯出到暫存目錄
4. Test B：組裝 sample_town，匯出到暫存目錄
5. Three.js 檢查  6. 驗收條件逐條判定 → e2e_report.json；任一條不通過就以 1 結束

所有輸出（GLB、manifest、預覽圖、e2e_report.json）都在暫存目錄並保留下來，不會改到 public/models。
--silhouette：輪廓 IoU 門檻。調到 0.99 可以確認判定真的會失敗（自我檢查）。
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.dirname(HERE)
REPO_ROOT = os.path.abspath(os.path.join(BLENDER_DIR, "..", ".."))
PLANS = os.path.join(BLENDER_DIR, "plans")
RUNNER = os.path.join(BLENDER_DIR, "scripts", "mcp_runner.py")
MARKER = "@@LPK_RESULT@@"
sys.path.insert(0, BLENDER_DIR)

from lowpoly_kit.export.glb_stats import read_glb_json  # noqa: E402

UNIT_FILES = ("test_plan_schema.py", "test_shapes.py", "test_visual_metrics.py", "test_scene_terrain.py")
BLENDER = os.environ.get("LPK_BLENDER") or os.path.expanduser("~/Applications/Blender.app/Contents/MacOS/Blender")


def log(message):
    print(message, flush=True)


def run(command, timeout=1800):
    started = time.time()
    proc = subprocess.run(command, capture_output=True, text=True, timeout=timeout, cwd=REPO_ROOT)
    return proc, round(time.time() - started, 1)


def runner(args):
    proc, seconds = run([BLENDER, "--background", "--factory-startup", "--python-exit-code", "1", "--python", RUNNER,
                         "--", json.dumps(args)])
    for line in reversed(proc.stdout.splitlines()):
        if line.startswith(MARKER):
            return json.loads(line[len(MARKER):]), seconds
    return {"ok": False, "errors": [{"code": "RUNNER_NO_RESULT", "message": proc.stderr[-800:]}]}, seconds


def load(name):
    with open(os.path.join(PLANS, name), encoding="utf-8") as handle:
        return json.load(handle)


def mesh_triangles(gltf):
    """每個 glTF mesh 的三角面數（壓縮不會改變 accessor 的 count）。"""
    accessors = gltf.get("accessors", [])
    result = {}
    for mesh in gltf.get("meshes", []):
        total = 0
        for primitive in mesh["primitives"]:
            index = primitive.get("indices", primitive["attributes"]["POSITION"])
            total += accessors[index]["count"] // 3
        result[mesh["name"]] = total
    return result


# ---------------------------------------------------------------------------
# 驗收條件
# ---------------------------------------------------------------------------

class Criteria:
    def __init__(self):
        self.items = []

    def add(self, test, requirement, ok, measured):
        self.items.append({"test": test, "requirement": requirement, "ok": bool(ok), "measured": measured})
        log(f"  {'PASS' if ok else 'FAIL'}  [{test}] {requirement}：{measured}")


def judge_test_a(c, plan, built, three_ok, silhouette_min):
    objects = built.get("objects", {})
    kinds = {info["kind"] for info in objects.values()}
    plan_kinds = {comp["kind"] for comp in plan["components"]}
    chimney = next((comp for comp in plan["components"] if comp["kind"] == "chimney"), None)
    parts = {
        "房屋主體": "wall_block" in kinds,
        "屋頂": bool({"roof_flat", "roof_hip", "roof_gable"} & plan_kinds) and built["ok"],
        "地基": "foundation" in kinds,
        "煙囪": chimney is not None and (chimney.get("union_into") is None or built["ok"]),
        "門": "door" in kinds,
        "窗戶": bool({"window", "shop_window"} & kinds),
        "樑柱": bool({"pillar", "beam"} & kinds),
        "屋瓦": any(comp["kind"] == "awning" and comp.get("params", {}).get("corrugated") or
                    comp["kind"] in ("roof_hip", "roof_gable", "roof_tiles") for comp in plan["components"]),
        "燈具": bool({"wall_lamp", "street_lamp", "wall_light", "lantern"} & kinds),
        "裝飾品": sum(1 for info in objects.values() if info["profile"] == "decoration") >= 3,
    }
    c.add("A", "必要部件（主體、屋頂、地基、煙囪、門、窗、樑柱、屋瓦、燈具、裝飾品）", all(parts.values()),
          "缺少：" + ("、".join(k for k, v in parts.items() if not v) or "無"))
    visual = built.get("visual") or {}
    c.add("A", "外型比例合理", (visual.get("silhouette_iou") or 0) >= silhouette_min and (visual.get("component_mean") or 0) >= 0.7,
          f"輪廓 IoU {visual.get('silhouette_iou')}（≥ {silhouette_min}）、元件位置 IoU {visual.get('component_mean')}（≥ 0.7）")
    statuses = [info["status"] for info in objects.values()]
    geometry = (built.get("geometry") or {}).get("status")
    c.add("A", "結構完整", built["ok"] and "fail" not in statuses and geometry != "fail",
          f"{len(statuses)} 個 Object、Geometry QA {geometry}、錯誤 {len(built.get('errors', []))}")
    tertiary = sum(1 for info in objects.values() if info["tier"] == "tertiary")
    c.add("A", "足夠的細節", tertiary >= 8 and (built.get("triangles") or 0) >= 2000,
          f"tertiary 元件 {tertiary}（≥ 8）、三角面 {built.get('triangles')}（≥ 2000）")
    c.add("A", "拓撲符合物件規格", statuses and all(s in ("pass", "warn") for s in statuses),
          f"pass {statuses.count('pass')}、warn {statuses.count('warn')}、fail {statuses.count('fail')}")
    colors = visual.get("colors") or []
    worst = max((col["delta_e"] for col in colors), default=None)
    c.add("A", "卡通遊戲風格材質", (built.get("appearance") or {}).get("mode") == "palette_vc" and worst is not None and worst <= 30,
          f"材質模式 {(built.get('appearance') or {}).get('mode')}、最大色差 ΔE {worst}（≤ 30）")
    c.add("A", "GLB 可以正常匯入 Three.js", three_ok and built.get("filepath") and os.path.exists(built["filepath"]),
          f"threejs_plan_check {'通過' if three_ok else '失敗'}")


def judge_test_b(c, scene, built, three_ok):
    assets = {a["asset_id"]: load(a["plan"]) for a in scene["assets"]}

    def is_building(asset_id):
        kinds = {comp["kind"] for comp in assets[asset_id]["components"]}
        return {"wall_block", "door"} <= kinds

    gltf = read_glb_json(built["filepath"]) if built.get("filepath") and os.path.exists(built["filepath"]) else {}
    names = {node.get("name") for node in gltf.get("nodes", [])}
    with open(built["manifest"], encoding="utf-8") as handle:
        manifest = json.load(handle) if built.get("manifest") else {}

    c.add("B", "地形", f"{scene['id']}_terrain" in names, "terrain 節點存在" if f"{scene['id']}_terrain" in names else "沒有 terrain 節點")
    roads = [r["id"] for r in scene.get("roads", []) if f"{scene['id']}_{r['id']}" in names]
    c.add("B", "道路", len(roads) >= 1, f"{len(roads)} 條：{', '.join(roads)}")
    buildings = [p for p in scene["placements"] if not p.get("instance") and is_building(p["asset_id"])]
    kinds = {p["asset_id"] for p in buildings}
    c.add("B", "多棟建築", len(buildings) >= 4 and len(kinds) >= 2, f"{len(buildings)} 棟、{len(kinds)} 種造型（{', '.join(sorted(kinds))}）")
    trees = [i for i in manifest.get("instanced", []) if i["asset"] == "tree_round"]
    c.add("B", "植物", len(trees) >= 5, f"{len(trees)} 棵 instanced 樹")
    props = [p for p in scene["placements"] if p["group"] == "Props"]
    c.add("B", "裝飾物", len(props) >= 1, f"Props 群組 {len(props)} 個擺放")
    light_types = {light["type"] for light in manifest.get("lights", [])}
    c.add("B", "場景燈光", "sun" in light_types and bool({"hemisphere", "ambient"} & light_types),
          f"manifest 燈光：{', '.join(sorted(light_types)) or '無'}")
    qa = built.get("scene_qa") or {}
    c.add("B", "物件配置合理", qa.get("status") == "pass", f"Scene QA {qa.get('status')}（{len(qa.get('issues') or [])} 個 issue）")
    roots = {p["id"]: p for p in manifest.get("placements", [])}
    independent = all(b["id"] in roots and roots[b["id"]]["clickable"] for b in buildings)
    c.add("B", "資產可以獨立管理", independent and three_ok, f"{len(buildings)} 棟建築都有根節點與可點擊的門" if independent else "有建築缺少根節點或可點擊元件")
    materials = [m["name"] for m in gltf.get("materials", [])]
    building_mats = [m for m in materials if any(m.startswith(f"LPK_{aid}_") for aid in kinds)]
    consistent = building_mats and all(m.endswith(("_atlas", "_atlas_emissive", "_glass")) for m in building_mats)
    c.add("B", "視覺一致性", consistent, f"建築材質：{', '.join(sorted(set(building_mats)))}")
    triangles = mesh_triangles(gltf)
    total = sum(triangles.values()) or 1
    largest = max(triangles.items(), key=lambda kv: kv[1]) if triangles else ("", 0)
    c.add("B", "不會融合成單一 Mesh", len(triangles) > 10 and largest[1] / total < 0.4,
          f"{len(triangles)} 個 mesh；最大的 {largest[0]} 佔 {largest[1] / total:.0%}（< 40%）")
    c.add("B", "能夠匯出完整場景", bool(built.get("filepath")) and bool(built.get("manifest")),
          f"GLB {os.path.basename(built.get('filepath') or '無')}、manifest {os.path.basename(built.get('manifest') or '無')}")
    c.add("B", "Three.js 可以正常載入", three_ok, f"threejs_scene_check {'通過' if three_ok else '失敗'}")


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--skip-units", action="store_true", help="略過純 Python 與 headless 測試套件（只跑 Test A／B）")
    parser.add_argument("--silhouette", type=float, default=0.85, help="輪廓 IoU 門檻（預設 0.85）")
    args = parser.parse_args()

    out = tempfile.mkdtemp(prefix="lpk_e2e_")
    report = {"started": time.strftime("%Y-%m-%d %H:%M:%S"), "out_dir": out, "steps": {}, "criteria": []}
    steps_ok = True

    if not args.skip_units:
        log("1. 純 Python 測試")
        for name in UNIT_FILES:
            proc, seconds = run([sys.executable, "-m", "unittest", "discover", "-s", HERE, "-p", name])
            ok = proc.returncode == 0
            steps_ok &= ok
            summary = (proc.stderr.strip().splitlines() or [""])[-1]
            report["steps"][name] = {"ok": ok, "summary": summary, "seconds": seconds}
            log(f"  {'PASS' if ok else 'FAIL'}  {name}：{summary}（{seconds}s）")
        log("2. headless Blender 測試套件")
        proc, seconds = run([BLENDER, "--background", "--factory-startup", "--python-exit-code", "1", "--python",
                             os.path.join(HERE, "run.py")])
        summary = next((line for line in reversed(proc.stdout.splitlines()) if "passed" in line), "")
        report["steps"]["headless"] = {"ok": proc.returncode == 0, "summary": summary, "seconds": seconds}
        steps_ok &= proc.returncode == 0
        log(f"  {'PASS' if proc.returncode == 0 else 'FAIL'}  {summary}（{seconds}s）")

    log("3. Test A：test01_shop")
    plan_a = load("test01_shop.plan.json")
    built_a, seconds = runner({"action": "build_asset", "plan": os.path.join(PLANS, "test01_shop.plan.json"), "export": True,
                               "out_root": out, "render_dir": os.path.join(out, "test_a")})
    report["steps"]["test_a_build"] = {"ok": built_a["ok"], "seconds": seconds, "errors": built_a.get("errors")}
    log(f"  {'PASS' if built_a['ok'] else 'FAIL'}  建模、QA、匯出（{seconds}s）")

    log("4. Test B：sample_town")
    scene = load("sample_town.scene.json")
    built_b, seconds = runner({"action": "build_scene", "scene": os.path.join(PLANS, "sample_town.scene.json"), "export": True,
                               "out_root": out, "render_dir": os.path.join(out, "test_b")})
    report["steps"]["test_b_build"] = {"ok": built_b["ok"], "seconds": seconds, "errors": built_b.get("errors")}
    log(f"  {'PASS' if built_b['ok'] else 'FAIL'}  組裝、Scene QA、匯出（{seconds}s）")

    log("5. Three.js 檢查")
    three = {}
    for key, script, plan_path, glb in (
        ("a", "threejs_plan_check.mjs", os.path.join(PLANS, "test01_shop.plan.json"), built_a.get("filepath")),
        ("b", "threejs_scene_check.mjs", os.path.join(PLANS, "sample_town.scene.json"), built_b.get("filepath")),
    ):
        if not glb:
            three[key] = False
            log(f"  FAIL  {script}：沒有 GLB")
            continue
        proc, seconds = run(["node", os.path.join(HERE, script), plan_path, glb])
        three[key] = proc.returncode == 0
        fails = [line for line in proc.stdout.splitlines() if line.startswith("FAIL")]
        report["steps"][script] = {"ok": three[key], "fails": fails, "seconds": seconds}
        log(f"  {'PASS' if three[key] else 'FAIL'}  {script}（{seconds}s）" + ("".join(f"\n        {f}" for f in fails)))

    log("6. 驗收條件")
    criteria = Criteria()
    judge_test_a(criteria, plan_a, built_a, three["a"], args.silhouette)
    if built_b.get("manifest"):
        judge_test_b(criteria, scene, built_b, three["b"])
    else:
        criteria.add("B", "能夠匯出完整場景", False, "場景沒有匯出")
    report["criteria"] = criteria.items
    report["visual_a"] = {k: (built_a.get("visual") or {}).get(k) for k in ("silhouette_iou", "component_mean")}
    report["scene_b"] = (built_b.get("scene_qa") or {}).get("budget")
    report["images"] = {"test_a": (built_a.get("visual") or {}).get("images"), "test_b": built_b.get("preview")}

    passed = steps_ok and all(item["ok"] for item in criteria.items)
    report["ok"] = passed
    path = os.path.join(out, "e2e_report.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    failed = [f"[{i['test']}] {i['requirement']}" for i in criteria.items if not i["ok"]]
    log(f"\n{'E2E PASS' if passed else 'E2E FAIL'}：驗收條件 {len(criteria.items) - len(failed)}/{len(criteria.items)}"
        + (f"；未通過：{'、'.join(failed)}" if failed else ""))
    log(f"報告：{path}")
    sys.exit(0 if passed else 1)


main()
