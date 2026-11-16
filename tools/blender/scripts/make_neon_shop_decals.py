"""產生 neon_shop（電波町霓虹小店）的招牌 decal 圖片。

用法：python3 tools/blender/scripts/make_neon_shop_decals.py
輸出：tools/blender/textures/manual/neon_shop/decals/*.png

為什麼用程式畫，不手繪？
  招牌字（電・波・町）要改字、改顏色時，重跑一次就好；結果也能重現。
霓虹字的畫法：同一段字畫三層——最外層大半徑模糊（光暈）、中間小模糊、最上面細白芯，
  疊起來就是「玻璃燈管裡亮著光」的樣子。
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "textures" / "manual" / "neon_shop" / "decals"
CJK_FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"
SCRIPT_FONT = "/System/Library/Fonts/Supplemental/Brush Script.ttf"


def font(path, size, index=0):
    return ImageFont.truetype(path, size, index=index)


def neon_text(size, text, fnt, color, background, stroke=10, center=None, spacing=0, glow=2.2):
    """在 background 底色上畫一段霓虹字：光暈 + 燈管 + 白芯。"""
    w, h = size
    base = Image.new("RGBA", size, background)
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    bbox = draw.textbbox((0, 0), text, font=fnt, stroke_width=stroke)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx, cy = center or (w / 2, h / 2)
    pos = (cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1])

    # 光暈：粗字大模糊
    halo = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(halo).text(pos, text, font=fnt, fill=color, stroke_width=stroke * 2, stroke_fill=color)
    halo = halo.filter(ImageFilter.GaussianBlur(stroke * glow))
    base = Image.alpha_composite(base, halo)
    # 燈管本體
    tube = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(tube).text(pos, text, font=fnt, fill=color, stroke_width=stroke // 2, stroke_fill=color)
    base = Image.alpha_composite(base, tube.filter(ImageFilter.GaussianBlur(1.5)))
    # 白芯：細、偏白，看起來像燈管中心最亮
    core = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(core).text(pos, text, font=fnt, fill=(235, 255, 255, 255))
    base = Image.alpha_composite(base, core.filter(ImageFilter.GaussianBlur(0.8)))
    return base


def top_sign():
    """頂樓招牌：電 • 波 • 町（青色霓虹，深紫底板）

    在場景裡這棟房子很小，招牌只有幾十個像素寬：用粗體（W6）、字放大、光暈收小，
    不然「電」這種筆畫多的字縮小後會被光暈糊成一團。
    """
    img = neon_text((2200, 700), "電 • 波 • 町", font(CJK_FONT, 330, index=2), (64, 240, 255, 255), (22, 12, 34, 255),
                    stroke=5, glow=1.4)
    img.convert("RGB").save(OUT / "top_sign.png")


def lightbox():
    """二樓大燈箱：白底黑字「ゲーム」＋小字 GAME CENTER，外圈一道青色細框"""
    w, h = 900, 620
    img = Image.new("RGB", (w, h), (246, 244, 236))
    draw = ImageDraw.Draw(img)
    draw.rectangle([10, 10, w - 10, h - 10], outline=(64, 210, 235), width=10)
    big = font(CJK_FONT, 230)
    bbox = draw.textbbox((0, 0), "ゲーム", font=big)
    draw.text(((w - (bbox[2] - bbox[0])) / 2 - bbox[0], 120 - bbox[1]), "ゲーム", font=big, fill=(25, 20, 30))
    small = font(CJK_FONT, 70)
    bbox = draw.textbbox((0, 0), "GAME CENTER", font=small)
    draw.text(((w - (bbox[2] - bbox[0])) / 2 - bbox[0], 440 - bbox[1]), "GAME CENTER", font=small, fill=(40, 34, 50))
    img.save(OUT / "lightbox.png")


def shop_window():
    """一樓店面：暖黃色店內光＋洋紅霓虹笑臉＋深色 PLAY 字"""
    w, h = 900, 760
    img = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    draw = ImageDraw.Draw(img)
    # 由上到下的暖光漸層（店內燈）
    for y in range(h):
        t = y / h
        draw.line([(0, y), (w, y)], fill=(int(250 - 30 * t), int(205 - 60 * t), int(110 - 50 * t), 255))
    # 洋紅霓虹笑臉
    face = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fd = ImageDraw.Draw(face)
    cx, cy, r = 220, 230, 120
    fd.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 40, 220, 255), width=16)
    fd.line([(cx - 60, cy - 50), (cx - 25, cy - 15)], fill=(255, 40, 220, 255), width=14)
    fd.line([(cx - 60, cy - 15), (cx - 25, cy - 50)], fill=(255, 40, 220, 255), width=14)
    fd.line([(cx + 25, cy - 50), (cx + 60, cy - 15)], fill=(255, 40, 220, 255), width=14)
    fd.line([(cx + 25, cy - 15), (cx + 60, cy - 50)], fill=(255, 40, 220, 255), width=14)
    fd.arc([cx - 65, cy - 20, cx + 65, cy + 75], 20, 160, fill=(255, 40, 220, 255), width=14)
    img = Image.alpha_composite(img, face.filter(ImageFilter.GaussianBlur(10)))
    img = Image.alpha_composite(img, face)
    draw = ImageDraw.Draw(img)
    word = font(CJK_FONT, 200)
    bbox = draw.textbbox((0, 0), "PLAY", font=word)
    draw.text(((w - (bbox[2] - bbox[0])) / 2 - bbox[0], 470 - bbox[1]), "PLAY", font=word, fill=(70, 45, 40, 255))
    img.convert("RGB").save(OUT / "shop_window.png")


def awning_script():
    """雨遮正面的青色手寫霓虹字"""
    img = neon_text((1200, 260), "denpa", font(SCRIPT_FONT, 200), (64, 240, 255, 255), (24, 62, 74, 255), stroke=5)
    img.convert("RGB").save(OUT / "awning_script.png")


def vert_sign():
    """側面直立小招牌：白底直書「ゲーム」"""
    w, h = 220, 820
    img = Image.new("RGB", (w, h), (246, 244, 236))
    draw = ImageDraw.Draw(img)
    fnt = font(CJK_FONT, 170)
    for i, ch in enumerate("ゲーム"):
        # 長音符號直書時要轉 90°
        glyph = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glyph)
        bbox = gd.textbbox((0, 0), ch, font=fnt)
        gd.text(((200 - (bbox[2] - bbox[0])) / 2 - bbox[0], (200 - (bbox[3] - bbox[1])) / 2 - bbox[1]), ch, font=fnt,
                fill=(25, 20, 30, 255))
        if ch == "ー":
            glyph = glyph.rotate(90)
        img.paste(glyph, (10, 40 + i * 250), glyph)
    img.save(OUT / "vert_sign.png")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    top_sign()
    lightbox()
    shop_window()
    awning_script()
    vert_sign()
    # 縮成 45%：招牌在畫面上很小，原尺寸只會吃掉貼圖預算（Texture QA 的 GPU 記憶體上限）
    for png in OUT.glob("*.png"):
        image = Image.open(png)
        image.resize((round(image.width * 0.45), round(image.height * 0.45)), Image.LANCZOS).save(png)
    print("ok", sorted(f"{p.name} {Image.open(p).size}" for p in OUT.glob("*.png")))
