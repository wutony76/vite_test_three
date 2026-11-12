"""矩形排列（純 Python）：UVBake 的 mesh 區塊、decal atlas 都用它。"""


def shelf_pack(sizes, gap):
    """正方形 cell 的貨架式排列（大的先排）。回傳 (縮放倍率, [(x, y, 邊長)])，全部落在 0～1 之內。

    用二分搜尋找最大的縮放倍率，讓所有 cell 都排得進單位正方形。
    """
    order = sorted(range(len(sizes)), key=lambda i: -sizes[i])

    def place(scale):
        x = y = row_h = 0.0
        spots = [None] * len(sizes)
        for i in order:
            side = sizes[i] * scale
            if x + side > 1.0 + 1e-9:
                x, y, row_h = 0.0, y + row_h + gap, 0.0
            if y + side > 1.0 + 1e-9 or side > 1.0:
                return None
            spots[i] = (x, y, side)
            x += side + gap
            row_h = max(row_h, side)
        return spots

    low, high = 0.0, 1.0 / max(max(sizes), 1e-9)
    best = place(low) or [(0.0, 0.0, 0.0)] * len(sizes)
    for _ in range(40):
        mid = (low + high) / 2
        spots = place(mid)
        if spots is None:
            high = mid
        else:
            low, best = mid, spots
    return low, best
