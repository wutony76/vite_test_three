"""numpy 陣列 ↔ Blender Image datablock（Blender 端）。

兩個容易出錯的地方集中在這裡：
1. 上下翻轉：我們的陣列第 0 列在最上面；Blender 的 image.pixels 從最下面一列開始存
2. color space：base color／emission 是 sRGB（人眼看到的顏色）；ORM、normal 是「資料」，必須是 Non-Color。
   資料貼圖設成 sRGB 的話，Blender 會先做 gamma 轉換 → 粗糙度、法線全部算錯
"""

import os

import bpy
import numpy as np

from .pngio import to_rgba

COLOR_ROLES = ("base", "emissive", "decal", "baked_base")  # 其他角色一律 Non-Color


def colorspace_for(role):
    return "sRGB" if role in COLOR_ROLES else "Non-Color"


def image_from_array(name, pixels, role, pack=True):
    """建立或更新圖片。同名、同尺寸時重複使用 datablock（重建資產時不會累積 .001、.002）。"""
    array = to_rgba(pixels)
    height, width = array.shape[:2]
    image = bpy.data.images.get(name)
    if image is not None and tuple(image.size) != (width, height):
        bpy.data.images.remove(image)
        image = None
    if image is None:
        # alpha=False：不透明的貼圖匯出成 RGB PNG，檔案小 1/4
        image = bpy.data.images.new(name, width, height, alpha=role == "decal")
    image.colorspace_settings.name = colorspace_for(role)
    image.alpha_mode = "STRAIGHT" if role == "decal" else "NONE"
    image.pixels.foreach_set(np.ascontiguousarray(np.flipud(array), dtype=np.float32).ravel())
    image.update()
    if pack:
        image.pack()  # 打包進 .blend；匯出 GLB 時內嵌
    image["lpk_role"] = role
    return image


def image_to_array(image):
    """Blender 圖片 → 陣列（第 0 列在最上面）。"""
    width, height = image.size
    buffer = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(buffer)
    return np.flipud(buffer.reshape(height, width, 4))


def load_png_with_blender(path):
    """在 Blender 裡讀 PNG（比純 Python 解碼快很多），讀完就刪掉暫時的 datablock。"""
    image = bpy.data.images.load(path, check_existing=False)
    try:
        image.colorspace_settings.name = "Non-Color"  # 原始數值，不做任何色彩轉換
        return image_to_array(image)
    finally:
        bpy.data.images.remove(image)


def save_and_verify(image, path):
    """把圖片存成 PNG，再重新載入比對：確認「存得下、讀得回、內容一致」。

    回傳 {"path", "max_error"}。max_error 是 0～1 的最大像素誤差；8-bit 量化本身最多 1/255。
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    original = image_to_array(image)
    # filepath 保留指向存好的檔案：之後 image.pack() 會從這個檔案打包。
    # 改回空字串的話，pack() 找不到來源，匯出時就沒有這張圖（Texture QA 的 EXTERNAL_FILE_MISSING）
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    reloaded = load_png_with_blender(path)
    error = float(np.max(np.abs(reloaded[:, :, :3] - original[:, :, :3])))
    return {"path": path, "max_error": round(error, 4)}
