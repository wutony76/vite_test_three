"""背景模式產生萊姆綠店面 GLB：

    Blender --background --factory-startup --python-exit-code 1 \\
        --python tools/blender/scripts/build_lime_shop.py
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

from lowpoly_kit import api  # noqa: E402
from lowpoly_kit.presets import lime_shop  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
output = argv[0] if argv else os.path.join(REPO_ROOT, "public", "models", "lime_shop", "lime_shop.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
built = lime_shop.build()
result = api.prepare_for_gltf(built["root"], output)
print(json.dumps({"built": built, "export": result}, ensure_ascii=False, indent=2))
if not result["ok"]:
    sys.exit(1)
