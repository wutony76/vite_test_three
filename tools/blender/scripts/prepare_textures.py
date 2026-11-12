"""建模前生成外部 provider 的貼圖（host 端，不需要 Blender）：

    python3 tools/blender/scripts/prepare_textures.py tools/blender/plans/<id>.plan.json [--force]

- 只處理 surface.source 是 provider:<名稱> 的材質（目前支援本機 ComfyUI）
- 結果寫進 tools/blender/textures/cache/<key>/（base／orm／normal.png + provenance.json），請 commit
- 已有快取時略過；--force 重新生成
- ComfyUI 沒有開啟時回報錯誤；之後建模會自動退回 procedural 並給 warning
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from lowpoly_kit.surface.prepare import prepare_plan  # noqa: E402


def main():
    args = sys.argv[1:]
    if not args:
        raise SystemExit("用法：prepare_textures.py <plan.json> [--force]")
    result = prepare_plan(os.path.abspath(args[0]), force="--force" in args)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result["ok"]:
        sys.exit(1)


main()
