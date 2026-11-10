"""lowpoly_kit：Blender Low Poly 建模與拓撲驗證工具。

在 MCP 的 execute_blender_code 裡這樣用：

    import sys
    sys.path.insert(0, "<repo>/tools/blender")
    import lowpoly_kit
    lowpoly_kit = lowpoly_kit.reload_all()   # 程式碼有改過時才需要
    print(lowpoly_kit.api.validate_mesh_topology("Body", profile="building_shell"))
"""

import importlib
import sys

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
