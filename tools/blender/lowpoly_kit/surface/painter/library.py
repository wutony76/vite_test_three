"""程序手繪貼圖的入口：resolve_surface 的結果 → base／orm／normal 三張圖。"""

import numpy as np

from .patterns import PATTERN_FUNCS
from .stylize import paint


def generate(spec):
    """spec：surface.spec.resolve_surface 的回傳值。同一個 spec 每次產生的像素完全相同。"""
    func = PATTERN_FUNCS.get(spec["pattern"], PATTERN_FUNCS["painted"])
    if spec["pattern"] == "corn_kernels":
        fields = func(spec["size"], spec["units"], spec["seed"], spec.get("kernel_rows"))
    else:
        fields = func(spec["size"], spec["units"], spec["seed"])
    return paint(fields, spec)


def seam_error(image):
    """平鋪接縫檢查：邊界（最後一欄接回第一欄）的差 ÷ 圖內相鄰兩欄差的「最大值」。

    無縫貼圖接回來的那條線，不會比圖內任何一條線更突兀（比值 ≤ 約 1）；
    有接縫時邊界差會遠大於圖內所有的相鄰差（漸層圖的比值約 60）。
    用最大值而不是平均或百分位：木板接縫、磚縫剛好落在邊界旁時，邊界差本來就大，
    圖內同樣的縫線只佔少數幾欄，用百分位會把它們排除，誤判成接縫。
    """
    rgb = image[:, :, :3]
    scores = []
    for axis in (0, 1):
        moved = np.moveaxis(rgb, axis, 0)
        inner = np.mean(np.abs(np.diff(moved, axis=0)), axis=(1, 2))
        border = float(np.mean(np.abs(moved[0] - moved[-1])))
        scores.append(border / (float(inner.max()) + 1e-6))
    return max(scores)
