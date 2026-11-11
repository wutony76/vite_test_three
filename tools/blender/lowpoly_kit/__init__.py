"""lowpoly_kit：Blender Low Poly 建模與拓撲驗證工具。

在 MCP 的 execute_blender_code 裡這樣用：

    import sys
    sys.path.insert(0, "<repo>/tools/blender")
    import lowpoly_kit
    lowpoly_kit = lowpoly_kit.reload_all()   # 程式碼有改過時才需要
    print(lowpoly_kit.api.validate_mesh_topology("Body", profile="building_shell"))

在 Blender 外（一般 Python）也可以 import，但只能用不依賴 bpy 的部分：

    from lowpoly_kit.pipeline import validate_plan
"""

import importlib
import sys

try:
    import bpy  # noqa: F401 — 只用來判斷是不是在 Blender 裡執行
except ImportError:
    # 不在 Blender 裡：api／presets 需要 bpy，import 會直接失敗，
    # 連帶讓純 Python 的 pipeline（plan 驗證）也無法使用，所以這裡略過它們。
    bpy = None

if bpy is not None:
    from . import api, presets

__all__ = ["api", "presets", "reload_all"]


def reload_all():
    """清掉所有已載入的子模組再重新 import。

    Blender 的 Python 會一直開著，同一個模組只會 import 一次；
    少了這步，改完程式碼後呼叫到的還是舊版本。
    """
    for name in [n for n in sys.modules if n == __name__ or n.startswith(__name__ + ".")]:
        del sys.modules[name]
    return importlib.import_module(__name__)
