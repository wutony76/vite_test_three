# profiles 只是規則資料，不依賴 Blender；plan 驗證（pipeline）在一般 Python 也要讀得到。
from .profiles import DEFAULT_PROFILE, PROFILES, get_profile, list_profiles

try:
    # checks／report 需要 bmesh，只有在 Blender 裡才能載入。
    # 少了這層判斷，在 Blender 外 import profiles 也會因為 bmesh 不存在而整個失敗。
    from .checks import run_all_checks
    from .report import evaluate, summarize
except ImportError:
    run_all_checks = evaluate = summarize = None

__all__ = [
    "run_all_checks",
    "DEFAULT_PROFILE",
    "PROFILES",
    "get_profile",
    "list_profiles",
    "evaluate",
    "summarize",
]
