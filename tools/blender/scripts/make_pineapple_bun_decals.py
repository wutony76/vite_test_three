"""產生 pineapple_bun（菠蘿麵包木牌）的 decal 圖片：木牌上的「Welcome / HFYY world.」。

用法：python3 tools/blender/scripts/make_pineapple_bun_decals.py
輸出：tools/blender/textures/manual/pineapple_bun/decals/sign_text.png

風格：奶油色粗圓字＋深咖啡粗外框＋往右下的一層陰影（卡通木牌招牌常見的做法，像字是另外刻好釘上去的）。
圖片的長寬比要和 plan 裡 decal 的 rect 一樣（寬 1.0 ÷ 高 0.44），貼上去字才不會被拉扁。
背景透明：decal 用 alphaMode = MASK，透明的地方會露出底下的木板。
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "textures" / "manual" / "pineapple_bun" / "decals"
FONT = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"

CREAM = (255, 238, 196, 255)
OUTLINE = (58, 30, 14, 255)
SHADOW = (40, 20, 8, 200)

# rect 是 1.0 × 0.44（公尺）→ 1024 × 450
W, H = 1024, 450


def draw_line(img, text, cy, size, max_width):
    """畫一行字：先量字寬，太寬就縮小；再畫陰影、外框、本體三層。"""
    font = ImageFont.truetype(FONT, size)
    draw = ImageDraw.Draw(img)
    while draw.textlength(text, font=font) > max_width and size > 20:
        size -= 4
        font = ImageFont.truetype(FONT, size)
    width = draw.textlength(text, font=font)
    x = (W - width) / 2
    stroke = max(6, size // 9)
    # 陰影：往右下偏一點，用外框的粗細一起畫，看起來字有厚度
    draw.text((x + stroke * 0.8, cy + stroke * 0.9), text, font=font, fill=SHADOW, anchor="lm", stroke_width=stroke, stroke_fill=SHADOW)
    draw.text((x, cy), text, font=font, fill=CREAM, anchor="lm", stroke_width=stroke, stroke_fill=OUTLINE)


def sign_text():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # 兩行：上面 Welcome 大一點，下面 HFYY world. 小一點（兩片木板各一行）
    draw_line(img, "Welcome", H * 0.27, 190, W * 0.9)
    draw_line(img, "HFYY world.", H * 0.74, 150, W * 0.92)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "sign_text.png"
    sign_text().save(path)
    print(path)


if __name__ == "__main__":
    main()
