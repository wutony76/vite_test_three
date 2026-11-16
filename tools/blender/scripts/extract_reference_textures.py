"""從 reference 圖裁切手繪風貼圖，供 surface.source = manual:... 使用（ComfyUI 未開時）。"""

import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BLENDER_DIR = os.path.join(REPO, "tools", "blender")
sys.path.insert(0, BLENDER_DIR)

from lowpoly_kit.surface.pngio import write_png  # noqa: E402

REF = os.path.join(REPO, "tools", "img", "econoline_camper.jpg")
OUT_ROOT = os.path.join(REPO, "tools", "blender", "textures", "manual", "econoline_camper")
SIZE = 1024


def load_rgb(path):
    try:
        from PIL import Image
    except ImportError as exc:
        raise SystemExit("需要 Pillow：pip install pillow") from exc
    im = Image.open(path).convert("RGB")
    return np.asarray(im, dtype=np.float32) / 255.0


def crop_norm(img, box):
    h, w = img.shape[:2]
    x0, y0, x1, y1 = box
    ix0, iy0 = int(x0 * w), int(y0 * h)
    ix1, iy1 = int(x1 * w), int(y1 * h)
    return img[iy0:iy1, ix0:ix1]


def resize_tile(arr, size):
    from PIL import Image

    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    im = im.resize((size, size), Image.Resampling.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255.0


def make_orm(base):
    gray = base.mean(axis=2)
    ao = 1.0 - np.clip(gray * 0.35 + 0.15, 0, 1)
    rough = 0.35 + 0.55 * (1.0 - gray)
    metal = np.zeros_like(gray)
    return np.stack([ao, rough, metal], axis=2)


def pack(folder, base_rgb):
    os.makedirs(folder, exist_ok=True)
    write_png(os.path.join(folder, "base.png"), np.clip(base_rgb, 0, 1).astype(np.float32))
    write_png(os.path.join(folder, "orm.png"), np.clip(make_orm(base_rgb), 0, 1).astype(np.float32))
    with open(os.path.join(folder, "provenance.json"), "w", encoding="utf-8") as fh:
        json.dump({"source": "reference_crop", "image": "tools/img/econoline_camper.jpg"}, fh, indent=2)


def main():
    img = load_rgb(REF)
    # 參考 reference.json palette / surfaces 區域（略放大）
    body = resize_tile(crop_norm(img, [0.20, 0.30, 0.82, 0.74]), SIZE)
    camper = resize_tile(crop_norm(img, [0.28, 0.14, 0.76, 0.36]), SIZE)
    pack(os.path.join(OUT_ROOT, "body_gold"), body)
    pack(os.path.join(OUT_ROOT, "camper_white"), camper)
    print(json.dumps({"ok": True, "out": os.path.relpath(OUT_ROOT, REPO)}, indent=2))


if __name__ == "__main__":
    main()
