"""統一回傳格式與錯誤處理。

所有對外函式都回傳同一種 dict，呼叫端（AI 或測試）只要看 `ok` 與 `errors`
就知道成功與否，不必解析 Blender 丟出來的例外字串。
少了這層：一個 bpy 例外會讓 execute_blender_code 整段失敗，AI 只看到 traceback，
不知道模型現在是「改到一半」還是「已經還原」。
"""

import functools
import traceback


class KitError(Exception):
    """可預期的錯誤：帶一個機器可判讀的 code，api 層會轉成 errors 項目。"""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def make_result(object_name=None):
    return {
        "ok": True,
        "object": object_name,
        "changes": {},
        "report": None,
        "errors": [],
        "backup": None,
    }


def add_error(result, code, message):
    result["ok"] = False
    result["errors"].append({"code": code, "message": message})
    return result


def safe_call(fn):
    """把函式包起來：任何例外都轉成 ok=False 的結果，不往外丟。"""

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except KitError as exc:
            return add_error(make_result(), exc.code, exc.message)
        except Exception as exc:  # noqa: BLE001 — 這裡就是要接住所有非預期錯誤
            detail = traceback.format_exc(limit=4)
            return add_error(make_result(), "UNEXPECTED", f"{type(exc).__name__}: {exc}\n{detail}")

    return wrapper
