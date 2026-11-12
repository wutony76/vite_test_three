"""最小的 PNG 讀寫（純 Python + numpy + zlib）。

為什麼自己寫：Blender 內建的 Python 沒有 Pillow；但貼圖快取、provider 後處理和測試都要在
Blender 外讀寫 PNG。PNG 格式本身很單純：檔頭 + IHDR（尺寸、格式）+ IDAT（zlib 壓縮的掃描線）+ IEND。

只支援 8-bit、非交錯（non-interlaced）的灰階／灰階+alpha／RGB／RGBA，這已經涵蓋我們自己寫出的檔案、
Blender 存出的 PNG，以及 ComfyUI 輸出的圖片。

陣列約定：float32，值 0～1，形狀 (高, 寬, 通道)，第 0 列是「最上面一列」（和一般圖片一樣）。
"""

import struct
import zlib

import numpy as np

SIGNATURE = b"\x89PNG\r\n\x1a\n"
# PNG 的 color type → 通道數
CHANNELS = {0: 1, 2: 3, 4: 2, 6: 4}


def _chunk(kind, data):
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def encode_png(pixels):
    """float 陣列 → PNG bytes。通道數 1／2／3／4 對應灰階／灰階+alpha／RGB／RGBA。"""
    array = np.asarray(pixels, dtype=np.float32)
    if array.ndim == 2:
        array = array[:, :, None]
    height, width, channels = array.shape
    color_type = {1: 0, 2: 4, 3: 2, 4: 6}[channels]
    data = np.clip(np.round(array * 255.0), 0, 255).astype(np.uint8)
    # 每一列前面加一個 filter byte（0 = 不過濾）。用 Up／Paeth 過濾檔案會更小，但 zlib 已經夠用
    rows = np.concatenate([np.zeros((height, 1), dtype=np.uint8), data.reshape(height, width * channels)], axis=1)
    header = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)
    return SIGNATURE + _chunk(b"IHDR", header) + _chunk(b"IDAT", zlib.compress(rows.tobytes(), 9)) + _chunk(b"IEND", b"")


def write_png(path, pixels):
    with open(path, "wb") as handle:
        handle.write(encode_png(pixels))
    return path


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def _unfilter(raw, height, stride, bpp):
    """還原 PNG 的 5 種 filter。Sub／Up／Average 可以用 numpy 整列處理，Paeth 必須逐位元組算。"""
    out = np.zeros((height, stride), dtype=np.uint8)
    prev = np.zeros(stride, dtype=np.int32)
    pos = 0
    for y in range(height):
        kind = raw[pos]
        line = np.frombuffer(raw, dtype=np.uint8, count=stride, offset=pos + 1).astype(np.int32)
        pos += stride + 1
        if kind == 0:
            cur = line
        elif kind == 2:  # Up：加上上一列
            cur = (line + prev) & 0xFF
        else:
            cur = line.copy()
            for x in range(stride):
                left = cur[x - bpp] if x >= bpp else 0
                up = prev[x]
                if kind == 1:  # Sub：加上左邊
                    cur[x] = (cur[x] + left) & 0xFF
                elif kind == 3:  # Average：加上 (左 + 上) / 2
                    cur[x] = (cur[x] + ((left + up) >> 1)) & 0xFF
                elif kind == 4:  # Paeth：加上左、上、左上三者中最接近預測值的那個
                    upleft = prev[x - bpp] if x >= bpp else 0
                    cur[x] = (cur[x] + _paeth(left, up, upleft)) & 0xFF
                else:
                    raise ValueError(f"未知的 PNG filter {kind}")
        out[y] = cur
        prev = cur
    return out


def decode_png(data):
    if data[:8] != SIGNATURE:
        raise ValueError("不是 PNG 檔")
    pos = 8
    idat = []
    width = height = color_type = None
    while pos < len(data):
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, depth, color_type, _comp, _filter, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8 or interlace != 0 or color_type not in CHANNELS:
                raise ValueError(f"只支援 8-bit 非交錯 PNG（depth={depth}, color_type={color_type}, interlace={interlace}）")
        elif kind == b"IDAT":
            idat.append(body)
        elif kind == b"IEND":
            break
    channels = CHANNELS[color_type]
    raw = zlib.decompress(b"".join(idat))
    rows = _unfilter(raw, height, width * channels, channels)
    return rows.reshape(height, width, channels).astype(np.float32) / 255.0


def read_png(path):
    # 有 Pillow（host 端的 Python）就用它：外部工具存的 PNG 常用 Paeth filter，逐位元組還原很慢
    try:
        from PIL import Image
    except ImportError:
        with open(path, "rb") as handle:
            return decode_png(handle.read())
    with Image.open(path) as image:
        mode = {"L": "L", "LA": "LA", "RGB": "RGB"}.get(image.mode, "RGBA")
        return np.asarray(image.convert(mode), dtype=np.float32).reshape(image.height, image.width, -1) / 255.0


def to_rgba(pixels):
    """任意通道數 → RGBA。Blender 的 image.pixels 一律是 4 通道。"""
    array = np.asarray(pixels, dtype=np.float32)
    if array.ndim == 2:
        array = array[:, :, None]
    channels = array.shape[2]
    if channels == 4:
        return array
    if channels == 3:
        return np.concatenate([array, np.ones(array.shape[:2] + (1,), np.float32)], axis=2)
    if channels == 2:
        gray, alpha = array[:, :, :1], array[:, :, 1:]
        return np.concatenate([gray, gray, gray, alpha], axis=2)
    return np.concatenate([array, array, array, np.ones(array.shape[:2] + (1,), np.float32)], axis=2)
