"""產生 earth_mamas 小店招牌的 decal 圖片：「Happy Fat」（使用者指定的招牌字）。

用法：python3 tools/blender/scripts/make_earth_mamas_decals.py
輸出：tools/blender/textures/manual/earth_mamas/decals/sign.png（RGBA，透明底，decal 用 alpha MASK 切掉背景）

字型用圓體粗字（Arial Rounded Bold）：圓圓的字跟香菇屋的軟萌風格比較搭；
白字＋深咖啡外框，貼在木頭招牌上才看得清楚。招牌在畫面上很小，圖不用大。
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "textures" / "manual" / "earth_mamas" / "decals"
FONT = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"


def sign(text_lines=("Happy", "Fat"), size=(560, 440)):
    scale = 2  # 先畫兩倍大再縮小，邊緣才平滑
    w, h = size[0] * scale, size[1] * scale
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, int(h * 0.36))
    stroke = int(h * 0.025)
    line_h = h * 0.42
    top = (h - line_h * len(text_lines)) / 2
    for i, line in enumerate(text_lines):
        bbox = draw.textbbox((0, 0), line, font=font, stroke_width=stroke)
        x = (w - (bbox[2] - bbox[0])) / 2 - bbox[0]
        y = top + line_h * i + (line_h - (bbox[3] - bbox[1])) / 2 - bbox[1]
        draw.text((x, y), line, font=font, fill=(255, 248, 236, 255), stroke_width=stroke,
                  stroke_fill=(74, 36, 20, 255))
    return img.resize(size, Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    sign().save(OUT / "sign.png")
    print("ok", OUT / "sign.png")
