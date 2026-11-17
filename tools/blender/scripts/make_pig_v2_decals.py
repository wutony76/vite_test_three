"""產生 pig_v2（紅色存錢筒小豬）身體兩側的 decal 圖片：白色櫻花。
（原本還有「希希」字樣，畫面上太小看不到，已移除。）

用法：python3 tools/blender/scripts/make_pig_v2_decals.py
輸出：tools/blender/textures/manual/pig_v2/decals/*.png（RGBA，透明底；decal 用 alpha MASK 切掉背景）

為什麼用程式畫：改字、改顏色重跑一次就好，結果可以重現。
小豬在畫面上只有幾十個像素，圖不用大：256 px 左右就夠，太大只會吃貼圖預算。
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "textures" / "manual" / "pig_v2" / "decals"


def sakura(size=256):
    """五瓣櫻花：每片花瓣是一個橢圓，尖端挖一個小 V 缺口（櫻花和梅花的差別就在這個缺口）。"""
    scale = 4  # 先畫 4 倍大再縮小，邊緣才平滑（PIL 畫圖沒有反鋸齒）
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    c = s / 2
    petal_len, petal_w = s * 0.25, s * 0.17
    for k in range(5):
        a = -math.pi / 2 + k * math.tau / 5
        # 花瓣中心在離花心 petal_len 的地方
        px, py = c + math.cos(a) * petal_len, c + math.sin(a) * petal_len
        petal = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        pd = ImageDraw.Draw(petal)
        pd.ellipse([c - petal_w, c - petal_len * 0.95, c + petal_w, c + petal_len * 0.95], fill=(255, 255, 255, 255))
        # 缺口：在花瓣尖端挖一個小三角形
        notch = petal_w * 0.42
        tip = c - petal_len * 0.95
        pd.polygon([(c - notch, tip - 2), (c + notch, tip - 2), (c, tip + notch * 1.1)], fill=(0, 0, 0, 0))
        petal = petal.rotate(-math.degrees(a + math.pi / 2), center=(c, c))
        img.alpha_composite(petal, (int(px - c), int(py - c)))
    # 花心：淡粉色圓＋幾根花蕊
    r = s * 0.07
    draw.ellipse([c - r, c - r, c + r, c + r], fill=(255, 190, 205, 255))
    for k in range(5):
        a = -math.pi / 2 + (k + 0.5) * math.tau / 5
        draw.line([(c, c), (c + math.cos(a) * r * 1.9, c + math.sin(a) * r * 1.9)], fill=(255, 150, 175, 255),
                  width=int(s * 0.012))
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    sakura().save(OUT / "sakura.png")
    print("ok", sorted(f"{p.name} {Image.open(p).size}" for p in OUT.glob("*.png")))
