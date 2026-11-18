"""產生 mushroom_arcade（香菇電子遊樂中心）的 decal 圖片：霓虹招牌字、窗內的店內畫面、像素圖示。

用法：python3 tools/blender/scripts/make_mushroom_arcade_decals.py
輸出：tools/blender/textures/manual/mushroom_arcade/decals/*.png

為什麼用程式畫：招牌字、顏色要改時重跑一次就好，結果可重現。
圖片的長寬比要和 plan 裡 decal 的 rect 一樣（寬 ÷ 高），貼上去才不會被拉扁。
網頁端會把名稱結尾是 _glow 的 decal 設成自發光（obj.ts 的 lightUpGlowDecals），所以這些圖在暗處也是亮的。
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "textures" / "manual" / "mushroom_arcade" / "decals"
CJK_FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"
LATIN_FONT = "/System/Library/Fonts/Supplemental/Arial Black.ttf"

MAGENTA = (255, 95, 216, 255)
YELLOW = (255, 216, 74, 255)
CYAN = (95, 242, 230, 255)
LIME = (190, 255, 120, 255)
SIGN_DARK = (43, 32, 51, 255)
PURPLE_BG = (60, 40, 120, 255)


def font(path, size, index=0):
    return ImageFont.truetype(path, size, index=index)


def neon_text(base, text, fnt, color, center, stroke=6, glow=1.6):
    """在 base 上畫一段霓虹字：光暈（粗字大模糊）＋燈管＋白芯。"""
    size = base.size
    probe = ImageDraw.Draw(base)
    bbox = probe.textbbox((0, 0), text, font=fnt, stroke_width=stroke)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pos = (center[0] - tw / 2 - bbox[0], center[1] - th / 2 - bbox[1])
    halo = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(halo).text(pos, text, font=fnt, fill=color, stroke_width=stroke * 2, stroke_fill=color)
    base = Image.alpha_composite(base, halo.filter(ImageFilter.GaussianBlur(stroke * glow)))
    tube = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(tube).text(pos, text, font=fnt, fill=color, stroke_width=stroke // 2, stroke_fill=color)
    base = Image.alpha_composite(base, tube.filter(ImageFilter.GaussianBlur(1.2)))
    core = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(core).text(pos, text, font=fnt, fill=(255, 250, 255, 255))
    return Image.alpha_composite(base, core.filter(ImageFilter.GaussianBlur(0.6)))


def pixel_frame(draw, w, h, color, cell=22):
    """一圈像素方格外框（參考圖窗戶的青色像素邊）"""
    for x in range(0, w, cell):
        for y in (0, h - cell):
            if (x // cell) % 2 == 0:
                draw.rectangle([x, y, x + cell - 3, y + cell - 3], fill=color)
    for y in range(0, h, cell):
        for x in (0, w - cell):
            if (y // cell) % 2 == 0:
                draw.rectangle([x, y, x + cell - 3, y + cell - 3], fill=color)


def interior(w, h, seed=0):
    """窗內的店內畫面：紫色燈光漸層＋格子地板＋一排遊戲機剪影（發光螢幕）"""
    img = Image.new("RGBA", (w, h), PURPLE_BG)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        draw.line([(0, y), (w, y)], fill=(int(70 + 50 * t), int(45 + 20 * t), int(140 + 40 * (1 - t)), 255))
    floor = int(h * 0.78)
    cell = max(18, w // 14)
    for x in range(0, w, cell):
        for y in range(floor, h, cell):
            if ((x // cell) + (y // cell)) % 2 == 0:
                draw.rectangle([x, y, x + cell, y + cell], fill=(110, 200, 230, 255))
    return img


def cabinets(img, count, top_frac=0.32, palette=None):
    """一排街機剪影：深色機身＋發光螢幕＋搖桿台"""
    w, h = img.size
    draw = ImageDraw.Draw(img)
    palette = palette or [(80, 220, 255), (255, 120, 220), (255, 220, 90), (140, 255, 160)]
    slot = w / count
    for i in range(count):
        x0 = int(i * slot + slot * 0.14)
        x1 = int((i + 1) * slot - slot * 0.14)
        y0 = int(h * top_frac)
        y1 = int(h * 0.86)
        draw.rounded_rectangle([x0, y0, x1, y1], radius=10, fill=(35, 28, 60, 255))
        sx0, sx1 = x0 + (x1 - x0) * 0.14, x1 - (x1 - x0) * 0.14
        sy0, sy1 = y0 + (y1 - y0) * 0.1, y0 + (y1 - y0) * 0.42
        color = palette[i % len(palette)]
        glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(glow).rectangle([sx0, sy0, sx1, sy1], fill=color + (255,))
        img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(8)))
        draw = ImageDraw.Draw(img)
        draw.rectangle([sx0, sy0, sx1, sy1], fill=color + (255,))
        # 螢幕上幾個像素點（遊戲畫面）
        for k in range(6):
            px = sx0 + (sx1 - sx0) * ((k * 37 + i * 11) % 90 + 5) / 100
            py = sy0 + (sy1 - sy0) * ((k * 53 + i * 29) % 80 + 10) / 100
            draw.rectangle([px, py, px + 8, py + 8], fill=(30, 20, 50, 255))
        # 操作台
        draw.rectangle([x0 - 4, y0 + (y1 - y0) * 0.5, x1 + 4, y0 + (y1 - y0) * 0.58], fill=(230, 220, 235, 255))
        draw.ellipse([x0 + 10, y0 + (y1 - y0) * 0.44, x0 + 26, y0 + (y1 - y0) * 0.52], fill=(230, 60, 60, 255))
    return img


def save(img, name):
    img.convert("RGB").save(OUT / name)


def main_sign():
    """大招牌：上排洋紅霓虹「電 • 波 • 町」（使用者指定，取代參考圖的「電子遊樂中心」）、下排黃色「ARCADE」（比例 2.75 : 0.9）"""
    w, h = 1650, 540
    img = Image.new("RGBA", (w, h), SIGN_DARK)
    img = neon_text(img, "電 • 波 • 町", font(CJK_FONT, 200, index=2), MAGENTA, (w / 2, h * 0.33), stroke=6)
    img = neon_text(img, "ARCADE", font(LATIN_FONT, 170), YELLOW, (w / 2, h * 0.76), stroke=6)
    save(img, "main_sign.png")


def door_inside():
    """門裡：店內紫光＋一台藍色遊戲機正對門口（比例 0.76，跟 plan 的 door_glow rect 一樣）"""
    w, h = 400, 526
    img = interior(w, h)
    cabinets(img, 1, top_frac=0.25, palette=[(80, 200, 255)])
    save(img, "door_inside.png")


def shop_window():
    """一樓大窗：夾娃娃機（粉紅）＋兩台遊戲機（比例 0.94）"""
    w, h = 720, 766
    img = interior(w, h)
    cabinets(img, 3, top_frac=0.38)
    draw = ImageDraw.Draw(img)
    # 夾娃娃機：粉紅外框、透明櫃、裡面幾顆彩色小球
    x0, x1, y0, y1 = int(w * 0.36), int(w * 0.64), int(h * 0.12), int(h * 0.86)
    draw.rounded_rectangle([x0, y0, x1, y1], radius=14, fill=(255, 160, 220, 255))
    draw.rectangle([x0 + 18, y0 + 30, x1 - 18, y0 + (y1 - y0) * 0.55], fill=(200, 230, 255, 255))
    for k, color in enumerate([(255, 210, 80), (120, 220, 255), (255, 120, 160), (160, 255, 150)]):
        cx = x0 + 40 + k * (x1 - x0 - 80) / 3
        cy = y0 + (y1 - y0) * 0.48
        draw.ellipse([cx - 20, cy - 20, cx + 20, cy + 20], fill=color + (255,))
    pixel_frame(ImageDraw.Draw(img), w, h, CYAN)
    save(img, "shop_window.png")


def left_window():
    """一樓左窗：兩台遊戲機（比例 0.74）"""
    w, h = 380, 514
    img = interior(w, h)
    cabinets(img, 2, top_frac=0.35)
    pixel_frame(ImageDraw.Draw(img), w, h, CYAN, cell=18)
    save(img, "left_window.png")


def upper_window():
    """二樓大窗：一排遊戲機＋賽車座椅（比例 1.71）"""
    w, h = 1100, 643
    img = interior(w, h)
    cabinets(img, 5, top_frac=0.3)
    draw = ImageDraw.Draw(img)
    # 賽車機的座椅（洋紅）
    for cx in (w * 0.3, w * 0.7):
        draw.rounded_rectangle([cx - 60, h * 0.62, cx + 60, h * 0.84], radius=20, fill=(230, 80, 170, 255))
    save(img, "upper_window.png")


def pixel_icons():
    """二樓左窗：像素圖示（手把、搖桿、星星、月亮、愛心）＋青色像素框（比例 0.99）"""
    w, h = 560, 566
    # 深藍底（配合霓虹配色；原本奶油配色時是淺紫底 (225, 215, 235)）
    img = Image.new("RGBA", (w, h), (38, 40, 110, 255))
    draw = ImageDraw.Draw(img)
    pixel_frame(draw, w, h, CYAN, cell=24)

    def pixels(rows, ox, oy, color, s=14):
        for r, row in enumerate(rows):
            for c, ch in enumerate(row):
                if ch == "#":
                    draw.rectangle([ox + c * s, oy + r * s, ox + c * s + s - 1, oy + r * s + s - 1], fill=color)

    star = ["...#...", "..###..", "#######", ".#####.", "..###..", ".##.##.", "##...##"]
    heart = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."]
    moon = ["..###", ".##..", "##...", "##...", "##...", ".##..", "..###"]
    pad = [".#######.", "#########", "#.##.#.##", "#########", ".##...##."]
    stick = ["..##..", "..##..", "...#..", "...#..", "######", "######"]
    pixels(pad, 70, 110, (200, 120, 70, 255))
    pixels(star, 340, 90, YELLOW)
    pixels(moon, 380, 300, YELLOW)
    pixels(heart, 120, 330, MAGENTA)
    pixels(stick, 250, 430, (230, 60, 60, 255))
    save(img, "pixel_icons.png")


def vert_sign():
    """直立招牌：黃色霓虹直書 A R C A D E（比例 0.36 : 2.1）"""
    w, h = 180, 1050
    img = Image.new("RGBA", (w, h), SIGN_DARK)
    fnt = font(LATIN_FONT, 120)
    for i, ch in enumerate("ARCADE"):
        img = neon_text(img, ch, fnt, YELLOW, (w / 2, 95 + i * 172), stroke=4)
    save(img, "vert_sign.png")


def game_start():
    """屋頂招牌：亮綠色「GAME START!」（比例 1.8 : 0.75）"""
    w, h = 900, 375
    img = Image.new("RGBA", (w, h), SIGN_DARK)
    img = neon_text(img, "GAME", font(LATIN_FONT, 130), LIME, (w / 2, h * 0.3), stroke=5)
    img = neon_text(img, "START!", font(LATIN_FONT, 130), LIME, (w / 2, h * 0.72), stroke=5)
    save(img, "game_start.png")


def invader():
    """像素外星人（青色發光），深色底（比例 1.0 : 1.3）"""
    w, h = 400, 520
    img = Image.new("RGBA", (w, h), SIGN_DARK)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    rows = ["..#.....#..", "...#...#...", "..#######..", ".##.###.##.", "###########", "#.#######.#", "#.#.....#.#", "...##.##..."]
    s = 32
    ox, oy = (w - 11 * s) / 2, (h - 8 * s) / 2
    for r, row in enumerate(rows):
        for c, ch in enumerate(row):
            if ch == "#":
                draw.rectangle([ox + c * s, oy + r * s, ox + c * s + s - 2, oy + r * s + s - 2], fill=CYAN)
    img = Image.alpha_composite(img, layer.filter(ImageFilter.GaussianBlur(10)))
    img = Image.alpha_composite(img, layer)
    save(img, "invader.png")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    main_sign()
    door_inside()
    shop_window()
    left_window()
    upper_window()
    pixel_icons()
    vert_sign()
    game_start()
    invader()
    # 縮成 50%：建築在畫面上不大，原尺寸只會吃掉貼圖預算（Texture QA 的 GPU 記憶體上限）
    for png in OUT.glob("*.png"):
        image = Image.open(png)
        image.resize((round(image.width * 0.5), round(image.height * 0.5)), Image.LANCZOS).save(png)
    print("ok", sorted(f"{p.name} {Image.open(p).size}" for p in OUT.glob("*.png")))
