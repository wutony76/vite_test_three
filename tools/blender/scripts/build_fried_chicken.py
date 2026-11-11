"""產生炸雞塊 GLB：

    Blender --background --factory-startup --python-exit-code 1 \\
        --python tools/blender/scripts/build_fried_chicken.py [-- 輸出路徑]
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

from lowpoly_kit import api  # noqa: E402
from lowpoly_kit.presets import fried_chicken  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
output = (
    argv[0]
    if argv
    else os.path.join(REPO_ROOT, "public", "models", "fried_chicken", "fried_chicken.glb")
)

bpy.ops.wm.read_factory_settings(use_empty=True)
built = fried_chicken.build(export=False)
result = api.prepare_for_gltf(built["root"], output)
print(json.dumps({"built": built, "export": result}, ensure_ascii=False, indent=2))
if not result["ok"]:
    sys.exit(1)
