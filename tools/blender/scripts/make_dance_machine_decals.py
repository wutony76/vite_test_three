"""產生 dance_machine（電波 STEP! 跳舞機）的 decal 圖片：頂上招牌字、螢幕上的箭頭譜面。

用法：python3 tools/blender/scripts/make_dance_machine_decals.py
輸出：tools/blender/textures/manual/dance_machine/decals/*.png

圖片的長寬比要和 plan 裡 decal 的 rect 一樣（寬 ÷ 高），貼上去才不會被拉扁。
網頁端會把名稱結尾是 _glow 的 decal 設成自發光，所以招牌、螢幕在暗處也是亮的。
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "textures" / "manual" / "dance_machine" / "decals"
CJK_FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"
LATIN_FONT = "/System/Library/Fonts/Supplemental/Arial Black.ttf"

MAGENTA = (255, 95, 216, 255)
YELLOW = (255, 216, 74, 255)
CYAN = (95, 242, 230, 255)
LIME = (190, 255, 120, 255)
SIGN_DARK = (30, 27, 75, 255)
SCREEN_BG = (24, 20, 52, 255)
# 箭頭顏色跟舞台上的踏板一樣：上、下、左、右
ARROW_COLORS = {"up": YELLOW, "down": CYAN, "left": MAGENTA, "right": LIME}


def font(path, size, index=0):
    return ImageFont.truetype(path, size, index=index)


def glow(base, layer, blur=10):
    """先貼一層模糊的（光暈），再貼清楚的：霓虹的感覺"""
    base = Image.alpha_composite(base, layer.filter(ImageFilter.GaussianBlur(blur)))
    return Image.alpha_composite(base, layer)


def arrow(draw, cx, cy, size, direction, color, width=0):
    """畫一個箭頭（尖端朝 direction）"""
    s = size / 2
    pts = [(0, -s), (-s, 0), (-s * 0.42, 0), (-s * 0.42, s), (s * 0.42, s), (s * 0.42, 0), (s, 0)]  # 朝上
    rot = {"up": lambda x, y: (x, y), "down": lambda x, y: (-x, -y), "left": lambda x, y: (y, -x), "right": lambda x, y: (-y, x)}[direction]
    poly = [(cx + rot(x, y)[0], cy + rot(x, y)[1]) for x, y in pts]
    if width:
        draw.polygon(poly, outline=color, width=width)
    else:
        draw.polygon(poly, fill=color)


def marquee():
    """頂上招牌：洋紅「電波」＋黃色「STEP!」（比例 1.0 : 0.26）"""
    w, h = 1000, 260
    img = Image.new("RGBA", (w, h), SIGN_DARK)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.text((w * 0.28, h / 2), "電波", font=font(CJK_FONT, 150, 1), fill=MAGENTA, anchor="mm")
    draw.text((w * 0.68, h / 2), "STEP!", font=font(LATIN_FONT, 140), fill=YELLOW, anchor="mm")
    img = glow(img, layer, 12)
    save(img, "marquee.png")


def screen():
    """螢幕：上方一排灰色判定箭頭（外框），下面四欄彩色箭頭往上捲（比例 1.0 : 0.82）"""
    w, h = 800, 656
    img = Image.new("RGBA", (w, h), SCREEN_BG)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    cols = ["left", "down", "up", "right"]
    xs = [w * (0.2 + 0.2 * i) for i in range(4)]
    size = 110
    # 判定線：外框箭頭
    for x, d in zip(xs, cols):
        arrow(draw, x, 95, size, d, (200, 200, 230, 255), width=8)
    # 往上捲的音符（固定一組，看起來像正在跳的譜面）
    notes = [(0, 230), (2, 310), (1, 400), (3, 400), (0, 500), (2, 590), (3, 250)]
    for col, y in notes:
        arrow(draw, xs[col], y, size, cols[col], ARROW_COLORS[cols[col]])
    # 下方分數條
    draw.rectangle([40, h - 40, w - 40, h - 22], fill=(255, 95, 216, 200))
    img = glow(img, layer, 8)
    save(img, "screen.png")


def save(img, name):
    img.convert("RGB").save(OUT / name)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    marquee()
    screen()
    # 縮成 50%：機台在畫面上很小，原尺寸只會吃掉貼圖預算
    for png in OUT.glob("*.png"):
        image = Image.open(png)
        image.resize((round(image.width * 0.5), round(image.height * 0.5)), Image.LANCZOS).save(png)
    print("ok", sorted(f"{p.name} {Image.open(p).size}" for p in OUT.glob("*.png")))
