"""Reference Analysis 與 Asset／Scene Planning 的資料契約。

整個 pipeline 都不依賴 bpy：在 Blender 外也能驗證 plan。

    from lowpoly_kit.pipeline import validate_plan
    result = validate_plan("tools/blender/plans/test01_shop.plan.json")
    print(result["ok"], result["errors"])
"""

import json
import os

from ..result import add_error, make_result
from .detail_config import PRESETS, DetailConfig, resolve_detail, seed_for
from .schema import validate_document

__all__ = ["validate_plan", "load_plan", "DetailConfig", "PRESETS", "resolve_detail", "seed_for"]


def load_plan(path):
    """讀 plan JSON。回傳 (doc, error)；成功時 error 是 None。"""
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle), None
    except FileNotFoundError:
        return None, f"找不到檔案 {path}"
    except json.JSONDecodeError as exc:
        return None, f"{path} 不是合法的 JSON：第 {exc.lineno} 行第 {exc.colno} 欄 {exc.msg}"


def validate_plan(plan_or_path, base_dir=None):
    """驗證 plan。plan_or_path 可以是 dict 或檔案路徑。

    回傳格式和 lowpoly_kit.api 一致：{"ok", "object", "changes", "report", "errors", "backup"}。
    report 內含 schema、counts、inferred_ratio、warnings，AssetPlan 另有解析後的 detail。
    """
    if isinstance(plan_or_path, (str, os.PathLike)):
        path = os.fspath(plan_or_path)
        doc, error = load_plan(path)
        if error:
            return add_error(make_result(path), "PLAN_FILE_INVALID", error)
        base_dir = base_dir or os.path.dirname(os.path.abspath(path))
    else:
        doc = plan_or_path

    outcome = validate_document(doc, base_dir)
    name = doc.get("id") if isinstance(doc, dict) else None
    result = make_result(name)
    result["report"] = {"schema": outcome["schema"], "warnings": outcome["warnings"], **(outcome["report"] or {})}
    for error in outcome["errors"]:
        add_error(result, error["code"], error["message"])
        result["errors"][-1]["path"] = error["path"]
    return result
