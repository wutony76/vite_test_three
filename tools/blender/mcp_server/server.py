"""lowpoly MCP server：把 lowpoly_kit 的建模流程包成正式的 MCP 工具（mcp 2.x 的 MCPServer）。

    uv run --no-project --with "mcp>=2,<3" python tools/blender/mcp_server/server.py

和 mcp-for-blender 的分工：
- mcp-for-blender：操作使用者「正在使用」的 Blender（即時檢視、手動調整）
- lowpoly（本伺服器）：每個工具都在「背景執行」的 Blender 子行程裡跑，不碰使用者的 Blender；
  結果可以重現，適合批次建模、匯出、測試
AI 不需要記得 sys.path、reload_all 這些步驟，參數也有型別，用錯會在呼叫前就被擋下。
"""

import glob
import json
import os
import subprocess
import sys
import tempfile

from mcp.server.mcpserver import MCPServer

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.dirname(HERE)
REPO_ROOT = os.path.abspath(os.path.join(BLENDER_DIR, "..", ".."))
PLANS_DIR = os.path.join(BLENDER_DIR, "plans")
RUNNER = os.path.join(BLENDER_DIR, "scripts", "mcp_runner.py")
TESTS = os.path.join(BLENDER_DIR, "tests", "run.py")
MARKER = "@@LPK_RESULT@@"
sys.path.insert(0, BLENDER_DIR)

from lowpoly_kit.pipeline import load_plan, validate_plan  # noqa: E402

server = MCPServer(
    "lowpoly",
    instructions=(
        "Stylized Low Poly 資產與場景建模工具（背景 Blender，不影響使用者正在使用的 Blender）。"
        "流程：lowpoly_list_plans → lowpoly_validate_plan → 使用者確認 plan → lowpoly_build_asset／lowpoly_build_scene。"
        "完整規範見 tools/blender/WORKFLOW.md。"
    ),
)


def _blender():
    candidates = [os.environ.get("LPK_BLENDER"), os.path.expanduser("~/Applications/Blender.app/Contents/MacOS/Blender"),
                  "/Applications/Blender.app/Contents/MacOS/Blender", "blender"]
    for candidate in candidates:
        if candidate and (os.path.isfile(candidate) or candidate == "blender"):
            return candidate
    raise RuntimeError("找不到 Blender，請設定環境變數 LPK_BLENDER")


def _inside(path, roots):
    path = os.path.realpath(path)
    return any(path == os.path.realpath(r) or path.startswith(os.path.realpath(r) + os.sep) for r in roots)


def _plan_path(path):
    """plan 可以寫檔名（在 plans/ 裡找）或 repo 內的路徑；不允許 repo 以外的檔案。"""
    for candidate in (os.path.join(PLANS_DIR, path), os.path.join(REPO_ROOT, path), path):
        if os.path.isfile(candidate):
            if not _inside(candidate, [REPO_ROOT]):
                raise ValueError(f"plan 必須在專案內：{path}")
            return os.path.abspath(candidate)
    raise FileNotFoundError(f"找不到 plan：{path}（可以只寫檔名，會在 {PLANS_DIR} 裡找）")


def _out_dir(path):
    """輸出目錄只允許在專案或系統暫存目錄內：伺服器不寫使用者的其他資料夾。"""
    if path is None:
        return None
    full = os.path.abspath(path)
    if not _inside(full, [REPO_ROOT, tempfile.gettempdir(), "/tmp", "/private/tmp"]):
        raise ValueError(f"輸出目錄必須在專案或暫存目錄內：{path}")
    return full


def run_runner(args, timeout=900):
    command = [_blender(), "--background", "--factory-startup", "--python-exit-code", "1", "--python", RUNNER,
               "--", json.dumps(args, ensure_ascii=False)]
    proc = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    for line in reversed(proc.stdout.splitlines()):
        if line.startswith(MARKER):
            return json.loads(line[len(MARKER):])
    return {"ok": False, "errors": [{"code": "RUNNER_NO_RESULT", "message": "Blender 沒有回傳結果"}],
            "stderr": proc.stderr[-2000:], "stdout": proc.stdout[-2000:]}


@server.tool()
def lowpoly_list_plans() -> dict:
    """列出 tools/blender/plans/ 裡的所有 plan（reference／asset／scene），含 schema、id 與檔名。"""
    plans = []
    for path in sorted(glob.glob(os.path.join(PLANS_DIR, "*.json"))):
        doc, error = load_plan(path)
        plans.append({"file": os.path.basename(path), "schema": (doc or {}).get("schema"), "id": (doc or {}).get("id"),
                      "error": error})
    return {"plans": plans}


@server.tool()
def lowpoly_validate_plan(path: str) -> dict:
    """驗證 plan（不需要 Blender）。path 可以只寫檔名，例如 test01_shop.plan.json。回傳 ok、errors（含 JSON path）、warnings。"""
    result = validate_plan(_plan_path(path))
    return {"ok": result["ok"], "errors": result["errors"], "warnings": (result["report"] or {}).get("warnings", []),
            "report": {k: v for k, v in (result["report"] or {}).items() if k != "warnings"}}


@server.tool()
def lowpoly_build_asset(plan: str, export: bool = False, preset: str | None = None, render_dir: str | None = None,
                        out_root: str | None = None) -> dict:
    """在背景 Blender 依 AssetPlan 建模並執行拓撲與 Geometry QA。

    export：通過後匯出 GLB（meshopt 壓縮）與 manifest 到 plan 的 export.path（相對 out_root，預設為專案根目錄）。
    preset：暫時改用其他 DetailConfig 等級（例如 preview）。
    render_dir：執行 Visual QA 並輸出預覽圖（front／overlay／compare／three_quarter.png）。
    """
    args = {"action": "build_asset", "plan": _plan_path(plan), "export": export, "preset": preset,
            "render_dir": _out_dir(render_dir), "out_root": _out_dir(out_root)}
    return run_runner(args)


@server.tool()
def lowpoly_build_scene(scene: str, export: bool = False, render_dir: str | None = None, out_root: str | None = None) -> dict:
    """在背景 Blender 依 ScenePlan 組裝場景並執行 Scene QA。export、render_dir、out_root 的意義同 lowpoly_build_asset。"""
    args = {"action": "build_scene", "scene": _plan_path(scene), "export": export, "render_dir": _out_dir(render_dir),
            "out_root": _out_dir(out_root)}
    return run_runner(args)


@server.tool()
def lowpoly_prepare_textures(plan: str, force: bool = False) -> dict:
    """建模前生成外部 provider（本機 ComfyUI）的貼圖並寫入快取（不需要 Blender）。

    只處理 surface.source 為 provider:<名稱> 的材質；已有快取時略過，force=True 重新生成。
    ComfyUI 位址用環境變數 LPK_COMFYUI_URL（預設 http://127.0.0.1:8188）。
    """
    from lowpoly_kit.surface.prepare import prepare_plan
    return prepare_plan(_plan_path(plan), force=force)


@server.tool()
def lowpoly_run_tests(keyword: str = "") -> dict:
    """執行 headless Blender 測試套件（可用 keyword 只跑名稱含該字串的測試）。回傳通過與失敗的數量與失敗清單。"""
    command = [_blender(), "--background", "--factory-startup", "--python-exit-code", "1", "--python", TESTS]
    if keyword:
        command += ["--", keyword]
    proc = subprocess.run(command, capture_output=True, text=True, timeout=1800)
    lines = proc.stdout.splitlines()
    summary = next((line for line in reversed(lines) if "passed" in line and "failed" in line), "")
    return {"ok": proc.returncode == 0, "summary": summary,
            "failures": [line[6:] for line in lines if line.startswith("FAIL  ")]}


if __name__ == "__main__":
    server.run("stdio")
