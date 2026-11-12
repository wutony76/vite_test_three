"""材質圖樣：只描述「形狀」，不決定顏色（顏色由 stylize 依色票上色）。

每個圖樣回傳同一組欄位（float32，形狀 (size, size)，第 0 列在最上面 = v 最大）：
- height：0～1，凸起的地方大。之後轉成法線貼圖，也用來畫邊緣高光
- tone：-1～1，每個區塊（一塊磚、一片瓦）自己的明暗。手繪貼圖每塊顏色都略不同，全部一樣會像印刷品
- gap：0～1，縫隙（磚縫、木板接縫）。上色時壓暗，粗糙度提高
- detail：-1～1，細節筆觸（木紋、刷痕）
- accents：{名稱: 0～1 遮罩}，需要第四種顏色的地方（烤焦、條紋）

座標：u = 欄 / size（向右），v = 1 - 列 / size（向上）。UV 的 u 方向就是「沿著長邊」：
木板、磚沿 u 排列，配合 UV 的 along／planar 策略，木紋會順著樑的長邊走。
"""

import numpy as np

from . import noise


def _coords(size):
    x = (np.arange(size, dtype=np.float32) + 0.5) / size
    return np.broadcast_to(x[None, :], (size, size)), np.broadcast_to(x[:, None], (size, size))


def _empty(size):
    zeros = np.zeros((size, size), dtype=np.float32)
    return {"height": zeros + 0.5, "tone": zeros.copy(), "gap": zeros.copy(), "detail": zeros.copy(), "accents": {}}


def _soft_edge(distance_px, width_px):
    """距離邊緣 width 以內從 0 漸變到 1：圓角的邊，而不是一刀切的直角。"""
    return np.clip(distance_px / max(width_px, 1e-6), 0.0, 1.0)


def _gap_mask(distance_px, width_px):
    """距離邊緣小於 width 的地方是縫隙，邊界留 1 px 的柔邊避免鋸齒。"""
    return np.clip((width_px - distance_px) + 0.5, 0.0, 1.0)


def _per_cell(values_table, row_index, col_index):
    return values_table[row_index % values_table.shape[0], col_index % values_table.shape[1]]


# ---------------------------------------------------------------------------
# 木
# ---------------------------------------------------------------------------

def planks(size, units, seed):
    """木板：units 列橫向木板，每列有 0～1 個接縫（錯開），板間有縫，板面有木紋與節疤。"""
    gen = noise.rng(seed)
    rows = max(1, units)
    board_h = size / rows
    y = np.arange(size, dtype=np.float32) + 0.5
    x = np.arange(size, dtype=np.float32) + 0.5
    row = np.floor(y / board_h).astype(int)
    in_row = y - row * board_h
    dist_v = np.minimum(in_row, board_h - in_row)  # 到上下板縫的距離（px）

    # 每列兩個接縫 → 兩塊板：[b1, b2) 一塊，其餘（繞過圖片邊界接回來）一塊。
    # 只放一個接縫的話，那一列其實只有「一塊繞一圈的板」，但區塊 id 會在圖片邊界跳變 → 平鋪時出現接縫。
    # 60% 的列沒有接縫（整條長板）：接縫太多時，木板看起來會像磚牆
    b1 = gen.random(rows) * size
    b2 = (b1 + size * gen.uniform(0.35, 0.65, rows)) % size
    has_break = gen.random(rows) > 0.6

    def wrapped(position):
        return np.abs(((x[None, :] - position[row][:, None]) + size / 2) % size - size / 2)

    dist_u = np.minimum(wrapped(b1), wrapped(b2))
    dist_u = np.where(has_break[row][:, None], dist_u, np.float32(size))
    lo, hi = np.minimum(b1, b2)[row][:, None], np.maximum(b1, b2)[row][:, None]
    segment = ((x[None, :] >= lo) & (x[None, :] < hi)).astype(int) * has_break[row][:, None]

    gap_w = max(1.2, size * 0.006)
    edge = np.minimum(dist_v[:, None], dist_u)
    out = _empty(size)
    out["gap"] = _gap_mask(edge, gap_w)
    out["height"] = 0.25 + 0.75 * _soft_edge(edge - gap_w, size * 0.02)

    tone_table = gen.uniform(-1, 1, (rows, 2)).astype(np.float32)
    out["tone"] = tone_table[row[:, None], segment]

    # 木紋：沿 u 拉長的雜訊（u 方向格子少、v 方向格子多），每塊板子位移不同，紋路才不會跨板連續
    grain = noise.fbm(size, 2, seed + 11, octaves=4, stretch=(1, 10)) * 2 - 1
    shift = (tone_table[row, 0] * size * 0.37).astype(int)
    grain = np.stack([np.roll(grain[r], shift[r]) for r in range(size)])
    # 節疤：稀疏的橢圓環，每張貼圖 2～3 個
    knots = noise.voronoi(size, 2, seed + 23, stretch=(1, 2))
    ring = np.clip(1 - knots["f1"] / 0.18, 0, 1)
    ring = np.where(knots["id"] < 0.45, ring, 0)
    out["detail"] = np.clip(grain * 0.8 - np.sin(ring * 9) * ring * 0.6, -1, 1)
    out["height"] -= ring * 0.15
    return out


def wood_grain(size, units, seed):
    """實木（樑、柱、竹籤）：沒有板縫，只有木紋。"""
    out = _empty(size)
    # 木紋要細而長：u 方向 3 格、v 方向 3×14 格；大面積色調只給一點點，不然會變成一塊塊污漬
    grain = noise.fbm(size, 3, seed + 11, octaves=5, stretch=(1, 14)) * 2 - 1
    out["detail"] = grain
    out["tone"] = (noise.fbm(size, 2, seed + 3, octaves=2) * 2 - 1) * 0.4 + grain * 0.6
    out["height"] = 0.5 + grain * 0.08
    return out


# ---------------------------------------------------------------------------
# 石、磚、瓦
# ---------------------------------------------------------------------------

def brick(size, units, seed):
    """磚：units 列，順砌（每隔一列錯開半塊），磚縫、圓角、邊角缺口。"""
    gen = noise.rng(seed)
    rows = max(2, units - units % 2)  # 偶數列才能無縫（錯開的列要成對）
    cols = max(1, round(rows / 2.6))
    brick_h, brick_w = size / rows, size / cols
    xs, ys = (np.arange(size, dtype=np.float32) + 0.5,) * 2
    row = np.floor(ys / brick_h).astype(int)
    offset = np.where(row % 2 == 1, brick_w / 2, 0.0)
    xx = (xs[None, :] + offset[:, None]) % size
    col = np.floor(xx / brick_w).astype(int)
    in_x = xx - col * brick_w
    in_y = (ys - row * brick_h)[:, None]
    edge = np.minimum(np.minimum(in_x, brick_w - in_x), np.minimum(in_y, brick_h - in_y))

    mortar = max(1.2, brick_h * 0.12)
    chips = noise.fbm(size, 8, seed + 5, octaves=3)  # 邊角缺口：邊緣附近隨機往內咬
    chipped = edge - (chips - 0.5) * mortar * 1.6
    out = _empty(size)
    out["gap"] = _gap_mask(chipped, mortar)
    out["height"] = 0.2 + 0.8 * _soft_edge(chipped - mortar, brick_h * 0.25)
    tone_table = gen.uniform(-1, 1, (rows, cols)).astype(np.float32)
    out["tone"] = tone_table[row[:, None], col % cols]
    out["detail"] = noise.fbm(size, 16, seed + 9, octaves=3) * 2 - 1
    return out


def cobble(size, units, seed):
    """亂石：Voronoi 細胞，交界是石縫，每塊石頭中間隆起。"""
    cells = noise.voronoi(size, max(2, units), seed, jitter=0.8)
    cell_px = size / max(2, units)
    edge_px = cells["edge"] * cell_px
    gap_w = max(1.5, cell_px * 0.06)
    out = _empty(size)
    out["gap"] = _gap_mask(edge_px, gap_w)
    out["height"] = np.clip(0.15 + 0.85 * _soft_edge(edge_px - gap_w, cell_px * 0.35) ** 0.7, 0, 1)
    out["tone"] = cells["id"] * 2 - 1
    out["detail"] = noise.fbm(size, max(4, units * 4), seed + 31, octaves=3) * 2 - 1
    return out


def rock(size, units, seed):
    """圓石、岩塊（不是鋪路石）：大面積的明暗斑塊、少量裂紋、細小斑點。

    cobble 是「很多石塊拼在一起」，貼在一顆圓石上會像一塊鋪過的地面；rock 是「一顆石頭的表面」。
    """
    out = _empty(size)
    out["tone"] = noise.fbm(size, max(2, units), seed, octaves=4) * 2 - 1
    cracks = noise.voronoi(size, max(2, units * 2), seed + 3, jitter=0.9)
    crack = np.clip(1 - cracks["edge"] / 0.05, 0, 1) * (noise.fbm(size, 3, seed + 5, octaves=2) > 0.55)
    speckle = noise.value_noise(size, 48, seed + 7)
    out["gap"] = crack * 0.8
    out["height"] = 0.5 + out["tone"] * 0.12 - crack * 0.3
    out["detail"] = (speckle - 0.5) * 1.2
    return out


def roof_tiles(size, units, seed):
    """魚鱗瓦：units 列、錯開排列；每片下緣是圓弧，蓋住下一列的上半部。

    v 向上 = 屋頂往上坡。上一列（圖片中較上方）的瓦片下緣蓋在下一列上面，
    所以每片瓦從上緣（被蓋住、暗、低）往下緣（露出、亮、高）漸高，下緣有一圈陰影。
    """
    gen = noise.rng(seed)
    rows = max(2, units - units % 2)
    cols = max(2, round(rows * 0.8))
    tile_h, tile_w = size / rows, size / cols
    xs, ys = (np.arange(size, dtype=np.float32) + 0.5,) * 2
    row = np.floor(ys / tile_h).astype(int)
    offset = np.where(row % 2 == 1, tile_w / 2, 0.0)
    xx = (xs[None, :] + offset[:, None]) % size
    col = np.floor(xx / tile_w).astype(int)
    lu = (xx - col * tile_w) / tile_w             # 片內水平位置 0～1
    lv = ((ys - row * tile_h) / tile_h)[:, None]  # 片內垂直位置 0（上緣）～1（下緣）
    # 下緣圓弧：中間最低（lv 接近 1），兩側往上收
    curve = 1.0 - 0.32 * (1.0 - np.sqrt(np.clip(1.0 - (2 * lu - 1) ** 2, 0, 1)))
    below = lv > curve  # 圓弧以下：屬於下一列被蓋住的部分
    shade = np.where(below, 0.1, 0.25 + 0.75 * (lv / curve) ** 1.4)
    seam_px = np.minimum(lu, 1 - lu) * tile_w
    rim_px = np.abs(lv - curve) * tile_h
    gap_w = max(1.2, tile_h * 0.05)
    out = _empty(size)
    out["gap"] = np.maximum(_gap_mask(rim_px, gap_w), np.where(below, 0, _gap_mask(seam_px, gap_w * 0.7)))
    out["height"] = shade.astype(np.float32)
    tone_table = gen.uniform(-1, 1, (rows, cols)).astype(np.float32)
    owner_row = np.where(below, row[:, None] + 1, row[:, None])
    out["tone"] = tone_table[owner_row % rows, col % cols]
    out["detail"] = noise.fbm(size, 12, seed + 7, octaves=3, stretch=(1, 3)) * 2 - 1
    return out


# ---------------------------------------------------------------------------
# 牆面、金屬、布
# ---------------------------------------------------------------------------

def plaster(size, units, seed):
    """灰泥：大片色塊 + 橫向刷痕 + 少量剝落（剝落處露出較暗的底層）。"""
    out = _empty(size)
    out["tone"] = (noise.fbm(size, 3, seed, octaves=3) * 2 - 1) * 0.5
    strokes = noise.fbm(size, 6, seed + 13, octaves=3, stretch=(1, 3)) * 2 - 1
    out["detail"] = strokes
    flake = noise.fbm(size, 5, seed + 17, octaves=4)
    chipped = np.clip((flake - 0.82) * 12, 0, 1)
    out["gap"] = chipped * 0.3
    out["height"] = 0.55 + strokes * 0.06 - chipped * 0.15
    return out


def brushed(size, units, seed):
    """金屬：沿 u 的拉絲紋 + 大面積明暗；凹痕稍微粗糙。"""
    out = _empty(size)
    out["detail"] = noise.fbm(size, 3, seed + 3, octaves=4, stretch=(1, 40)) * 2 - 1
    out["tone"] = (noise.fbm(size, 2, seed + 5, octaves=3) * 2 - 1) * 0.5
    dents = noise.voronoi(size, 6, seed + 9)
    out["height"] = 0.5 + out["detail"] * 0.03 - np.clip(0.12 - dents["f1"], 0, 1) * 0.8
    return out


def weave(size, units, seed):
    """布：平織，經緯線一上一下交錯。"""
    u, v = _coords(size)
    n = max(4, units)
    fu, fv = (u * n) % 1.0, (v * n) % 1.0
    over = ((np.floor(u * n) + np.floor(v * n)) % 2).astype(np.float32)
    across = np.where(over > 0, np.sin(np.pi * fv), np.sin(np.pi * fu))
    out = _empty(size)
    out["height"] = (0.3 + 0.7 * across).astype(np.float32)
    out["gap"] = np.clip(0.25 - across, 0, 1) * 2
    out["tone"] = noise.fbm(size, 3, seed, octaves=3) * 2 - 1
    out["detail"] = (over * 2 - 1) * 0.3
    return out


def painted(size, units, seed):
    """一般手繪表面（沒有明確圖樣的物件）：柔和色塊 + 筆觸。"""
    out = _empty(size)
    out["tone"] = (noise.fbm(size, 3, seed, octaves=3) * 2 - 1) * 0.5
    out["detail"] = noise.fbm(size, 5, seed + 3, octaves=3, stretch=(1, 2.5)) * 2 - 1
    out["height"] = 0.5 + out["detail"] * 0.04
    return out


def stripes(size, units, seed):
    """條紋（雨棚、布篷）：units 條沿 u 交錯的直條紋，邊緣略為抖動（手畫感）。"""
    u, v = _coords(size)
    n = max(2, units - units % 2)
    wobble = (noise.value_noise(size, 4, seed + 1) - 0.5) * 0.25 / n
    band = np.floor(((u + wobble) * n) % n)
    out = painted(size, units, seed)
    out["accents"] = {"stripe": (band % 2).astype(np.float32)}
    return out


# ---------------------------------------------------------------------------
# 自然、食物
# ---------------------------------------------------------------------------

def foliage(size, units, seed):
    """葉叢：兩層 Voronoi 橢圓葉片，上層蓋在下層上，葉片之間是深色的縫。"""
    out = _empty(size)
    height = np.zeros((size, size), dtype=np.float32)
    tone = np.zeros((size, size), dtype=np.float32)
    covered = np.zeros((size, size), dtype=np.float32)
    for layer in range(2):
        cells = noise.voronoi(size, max(2, units + layer), seed + layer * 101, jitter=0.9)
        angle = cells["id"] * np.pi * 2
        cos, sin = np.cos(angle), np.sin(angle)
        lx = cells["dx"] * cos + cells["dy"] * sin
        ly = -cells["dx"] * sin + cells["dy"] * cos
        ellipse = (lx / 0.48) ** 2 + (ly / 0.26) ** 2
        leaf = np.clip(1 - ellipse, 0, 1)
        mask = (leaf > 0.02).astype(np.float32)
        take = mask * (1 - covered) if layer == 0 else mask
        height = np.where(take > 0, 0.3 + 0.7 * np.sqrt(leaf), height)
        tone = np.where(take > 0, cells["id"] * 2 - 1, tone)
        covered = np.maximum(covered, mask)
    out["height"] = height
    out["tone"] = tone
    out["gap"] = 1 - covered
    out["detail"] = noise.fbm(size, 10, seed + 5, octaves=2) * 2 - 1
    return out


def ground(size, units, seed):
    """地面：泥土與草的大色塊、小石子、短草筆觸。"""
    out = _empty(size)
    out["tone"] = noise.fbm(size, 3, seed, octaves=4) * 2 - 1
    pebbles = noise.voronoi(size, 24, seed + 3, jitter=0.9)
    stone = np.clip(1 - pebbles["f1"] / 0.22, 0, 1) * (pebbles["id"] < 0.3)
    out["height"] = 0.45 + stone * 0.5
    out["detail"] = noise.fbm(size, 24, seed + 9, octaves=2, stretch=(1, 4)) * 2 - 1
    out["gap"] = np.clip(0.35 - pebbles["edge"], 0, 1) * stone
    return out


def crust(size, units, seed):
    """食物外皮（烤雞、麵包）：起伏的色塊、細小氣孔；有 accents.char 時畫焦斑。"""
    out = _empty(size)
    out["tone"] = noise.fbm(size, 3, seed, octaves=4) * 2 - 1
    bubbles = noise.voronoi(size, 14, seed + 4)
    pores = np.clip(0.1 - bubbles["f1"], 0, 1) * 10
    out["height"] = 0.5 + out["tone"] * 0.15 - pores * 0.3
    out["gap"] = pores * 0.5
    out["detail"] = noise.fbm(size, 8, seed + 6, octaves=3) * 2 - 1
    char = noise.fbm(size, 4, seed + 8, octaves=3)
    out["accents"] = {"char": np.clip((char - 0.7) * 6, 0, 1)}
    return out


def corn_kernels(size, units, seed):
    """玉米粒（不平鋪，整根展開）：u = 繞一圈、v = 由下往上。

    每列 units 顆、錯開排列；每顆是圓角的隆起，中間偏左一帶有部分烤焦（accents.char）。
    u 方向可以無縫（繞回起點），v 方向不需要（上下兩端是玉米的頭尾）。
    """
    gen = noise.rng(seed)
    cols = max(6, units)
    # 一顆粒大約正方形：玉米周長 ≈ 0.2 m、粒區高度 ≈ 0.17 m → 列數約是行數的 0.8 倍
    rows = max(6, round(cols * 0.8))
    cell_w, cell_h = size / cols, size / rows
    xs, ys = (np.arange(size, dtype=np.float32) + 0.5,) * 2
    row = np.floor(ys / cell_h).astype(int)
    offset = np.where(row % 2 == 1, cell_w / 2, 0.0)
    xx = (xs[None, :] + offset[:, None]) % size
    col = np.floor(xx / cell_w).astype(int)
    # 圓角方形（超橢圓，指數 3）：玉米粒彼此擠在一起，比圓形更填滿格子，縫隙只剩細線
    nx = ((xx - col * cell_w) / cell_w - 0.5) / 0.47
    ny = ((((ys - row * cell_h) / cell_h) - 0.5) / 0.46)[:, None]
    dome = np.clip(1 - np.abs(nx) ** 3 - np.abs(ny) ** 3, 0, 1)
    out = _empty(size)
    out["height"] = (0.2 + 0.8 * dome ** 0.35).astype(np.float32)
    out["gap"] = np.clip(0.08 - dome, 0, 1) / 0.08
    tone_table = gen.uniform(-1, 1, (rows, cols)).astype(np.float32)
    out["tone"] = tone_table[row[:, None], col % cols]
    out["detail"] = (1 - nx ** 2 * 0.55 - ny ** 2 * 0.25) * 2 - 1  # 每顆的立體高光
    # 烤焦區：u 在 0.34～0.56、v 在 0.28～0.72 之間的玉米粒，有 22% 機率整顆焦掉
    u = (col + 0.5) / cols
    v = 1 - (row[:, None] + 0.5) / rows
    burnt_table = (gen.random((rows, cols)) < 0.22).astype(np.float32)
    zone = (u >= 0.34) & (u <= 0.56) & (v >= 0.28) & (v <= 0.72)
    char = burnt_table[row[:, None], col % cols] * zone * (dome > 0)
    out["accents"] = {"char": char.astype(np.float32)}
    return out


PATTERN_FUNCS = {
    "planks": planks, "wood_grain": wood_grain, "brick": brick, "cobble": cobble, "roof_tiles": roof_tiles,
    "rock": rock, "plaster": plaster, "brushed": brushed, "weave": weave, "foliage": foliage, "ground": ground,
    "crust": crust, "painted": painted, "stripes": stripes, "corn_kernels": corn_kernels,
}
