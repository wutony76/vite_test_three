"""用背景模式重新產生霓虹招牌 GLB：

    Blender --background --factory-startup --python-exit-code 1 \\
        --python tools/blender/scripts/build_denpa_sign.py [-- 輸出路徑]

預設輸出到 public/models/denpa_sign/denpa_sign.glb。
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

from lowpoly_kit import api  # noqa: E402
from lowpoly_kit.presets import denpa_sign  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
output = argv[0] if argv else os.path.join(REPO_ROOT, "public", "models", "denpa_sign", "denpa_sign.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
built = denpa_sign.build()
result = api.prepare_for_gltf(built["root"], output)
print(json.dumps({"built": built, "export": result}, ensure_ascii=False, indent=2))
if not result["ok"]:
    sys.exit(1)
