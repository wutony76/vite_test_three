"""測試進入點。用背景模式的 Blender 執行，不會碰到正在使用的 Blender：

    Blender --background --factory-startup --python-exit-code 1 \\
        --python tools/blender/tests/run.py [-- 關鍵字]

- --factory-startup：不載入使用者的偏好設定與附加元件，每次環境都一樣
- --python-exit-code 1：腳本出錯時 Blender 回傳 1，CI 或指令列才判斷得出失敗
- 每個 test_* 函式執行前都重置成空場景，測試之間互不影響
"""

import importlib
import os
import sys
import traceback

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))  # tools/blender，才能 import lowpoly_kit
sys.path.insert(0, HERE)                   # tests，才能 import fixtures


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def collect(keyword):
    tests = []
    for filename in sorted(os.listdir(HERE)):
        if not (filename.startswith("test_") and filename.endswith(".py")):
            continue
        module = importlib.import_module(filename[:-3])
        for name in sorted(dir(module)):
            if name.startswith("test_") and callable(getattr(module, name)):
                full = f"{filename[:-3]}.{name}"
                if not keyword or keyword in full:
                    tests.append((full, getattr(module, name)))
    return tests


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    keyword = argv[0] if argv else ""
    tests = collect(keyword)
    failures = []
    for full, fn in tests:
        reset_scene()
        try:
            fn()
            print(f"PASS  {full}")
        except Exception:  # noqa: BLE001
            failures.append(full)
            print(f"FAIL  {full}\n{traceback.format_exc()}")
    print(f"\n{len(tests) - len(failures)} passed, {len(failures)} failed, {len(tests)} total")
    if failures or not tests:
        sys.exit(1)


main()
