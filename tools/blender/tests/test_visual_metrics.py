"""Visual QA 計算與 palette atlas 配置的測試。不需要 Blender：

    python3 -m unittest discover -s tools/blender/tests -p "test_visual_metrics.py"
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from lowpoly_kit.appearance import atlas  # noqa: E402
from lowpoly_kit.qa import metrics  # noqa: E402


def test_rectangle_mask_area():
    mask = metrics.polygon_mask([(0.25, 0.25), (0.75, 0.25), (0.75, 0.75), (0.25, 0.75)], 100, 100)
    assert mask.sum() == 50 * 50
    assert mask[30, 30] and not mask[10, 10]


def test_triangle_mask_area():
    mask = metrics.polygon_mask([(0, 0), (1, 0), (0, 1)], 200, 200)
    assert abs(mask.sum() - 200 * 200 / 2) < 200  # 邊上的像素誤差在一列以內


def test_concave_mask():
    """L 形（凹多邊形）：右上角的缺口不能被填滿。"""
    mask = metrics.polygon_mask([(0, 0), (0.5, 0), (0.5, 0.5), (1, 0.5), (1, 1), (0, 1)], 100, 100)
    assert not mask[20, 80]       # 缺口
    assert mask[20, 20] and mask[80, 80]
    assert abs(mask.sum() - 7500) < 150


def test_iou_known_values():
    a = metrics.polygon_mask([(0, 0), (0.5, 0), (0.5, 1), (0, 1)], 100, 100)
    b = metrics.polygon_mask([(0.25, 0), (0.75, 0), (0.75, 1), (0.25, 1)], 100, 100)
    assert abs(metrics.iou(a, b) - 1 / 3) < 0.01
    assert metrics.iou(a, a) == 1.0
    assert abs(metrics.bbox_iou([0, 0, 2, 2], [1, 1, 3, 3]) - 1 / 7) < 1e-9
    assert metrics.bbox_iou([0, 0, 1, 1], [2, 2, 3, 3]) == 0.0


def test_delta_e():
    assert metrics.delta_e("#808080", "#808080") == 0.0
    assert 99 < metrics.delta_e("#000000", "#FFFFFF") < 101
    assert metrics.delta_e("#D6DE24", "#D8DF20") < 3  # 肉眼幾乎分不出來


def test_project_bbox_front_ortho():
    frame = {"center": (0.0, 5.0), "height_m": 10.0, "pixels": (500, 1000)}  # 寬 5 m、高 10 m
    u0, v0, u1, v1 = metrics.project_bbox((-2.5, 0, 0), (2.5, 1, 10), frame)
    assert (round(u0, 6), round(v0, 6), round(u1, 6), round(v1, 6)) == (0, 0, 1, 1)
    u0, v0, _u1, v1 = metrics.project_bbox((0, 0, 5), (1, 1, 7.5), frame)
    assert (round(u0, 3), round(v0, 3), round(v1, 3)) == (0.5, 0.25, 0.5)


def test_atlas_layout_skips_glass():
    specs = [{"name": "wall", "hex": "#FF0000"}, {"name": "glass", "hex": "#000000", "alpha": 0.4},
             {"name": "roof", "hex": "#00FF00", "roughness": 0.3, "metallic": 0.9}]
    cells = atlas.layout(specs)
    assert cells == {"wall": (0, 0), "roof": (1, 0)}
    color = atlas.color_pixels(specs, 64)
    mr = atlas.mr_pixels(specs, 64)
    # 色格 (1, 0) 在左上數來第二格（每格 8 px），像素值就是 hex 原色
    assert tuple(color[4, 12, :3]) == (0.0, 1.0, 0.0)
    assert tuple(round(float(v), 3) for v in mr[4, 12, :3]) == (1.0, 0.3, 0.9)  # G = roughness、B = metallic


def test_atlas_uv_points_at_cell_center():
    assert atlas.cell_uv(0, 0) == (1 / 16, 1 - 1 / 16)   # Blender UV 原點在左下，第 0 列在最上面
    assert atlas.cell_uv(7, 7) == (15 / 16, 1 / 16)


def test_atlas_rejects_too_many_colors():
    try:
        atlas.layout([{"name": str(i), "hex": "#000000"} for i in range(65)])
    except ValueError:
        return
    raise AssertionError("超過 64 色應該被拒絕")


def load_tests(loader, tests, pattern):  # noqa: ARG001
    suite = unittest.TestSuite()
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            suite.addTest(unittest.FunctionTestCase(fn, description=name))
    return suite
