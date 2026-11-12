"""Surface Engine 的純 Python 部分（不需要 Blender，也會在 headless 測試套件裡跑一次）：

    python3 -m unittest discover -s tools/blender/tests -p "test_surface_pure.py"

涵蓋：無縫雜訊與圖樣、PNG 讀寫、法線編碼、surface 解析、schema、外部圖片後處理、
快取、provider（含本機 ComfyUI 的 mock server）、表面指標、矩形排列。
"""

import http.server
import json
import os
import struct
import sys
import tempfile
import threading
import unittest
import zlib

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from lowpoly_kit.pipeline import validate_document  # noqa: E402
from lowpoly_kit.qa import surface_metrics  # noqa: E402
from lowpoly_kit.surface import pngio, spec  # noqa: E402
from lowpoly_kit.surface.packing import shelf_pack  # noqa: E402
from lowpoly_kit.surface.painter import library, noise  # noqa: E402
from lowpoly_kit.surface.painter.patterns import PATTERN_FUNCS  # noqa: E402
from lowpoly_kit.surface.painter.stylize import height_to_normal  # noqa: E402
from lowpoly_kit.surface.sources import base as sources, cache, comfyui, postprocess  # noqa: E402


def _spec(pattern="planks", klass="wood", size=128, **surface):
    material = {"name": "m", "hex": "#8A5A35", "surface": {"class": klass, "pattern": pattern, **surface}}
    resolved = spec.resolve_surface(material, quality="hero")
    resolved["size"] = size
    return resolved


# ---------------------------------------------------------------------------
# 雜訊與圖樣
# ---------------------------------------------------------------------------

def test_value_noise_wraps_around():
    """週期性雜訊：最後一欄接回第一欄的差，和圖內相鄰欄的差一樣小。"""
    field = noise.value_noise(64, 4, seed=1)
    inner = np.abs(np.diff(field, axis=1)).max()
    assert np.abs(field[:, 0] - field[:, -1]).max() <= inner + 1e-6


def test_every_tileable_pattern_is_seamless_and_deterministic():
    for name, info in spec.PATTERNS.items():
        resolved = _spec(pattern=name, klass="painted")
        first = library.generate(resolved)
        second = library.generate(resolved)
        assert np.array_equal(first["base"], second["base"]), name
        assert first["base"].shape == (128, 128, 4), name
        if info["tileable"]:
            assert library.seam_error(first["base"]) < 1.6, (name, library.seam_error(first["base"]))


def test_seam_metric_catches_non_tileable_image():
    image = np.zeros((64, 64, 4), np.float32)
    image[:, :, :3] = np.linspace(0, 1, 64)[None, :, None]
    assert library.seam_error(image) > 10


def test_all_patterns_have_functions():
    assert set(spec.PATTERNS) <= set(PATTERN_FUNCS)


def test_palette_lock_keeps_colors_near_palette():
    """手繪風的核心：base color 的中位數應該落在基底色附近（不是灰、不是黑）。"""
    resolved = _spec(pattern="plaster", klass="plaster", palette=["#5A4030", "#C08060", "#F0D0B0"])
    base = library.generate(resolved)["base"][:, :, :3]
    median = np.median(base.reshape(-1, 3), axis=0)
    target = np.array(spec.hex_to_rgb("#C08060"))
    assert np.abs(median - target).max() < 0.12, median


def test_normal_map_encoding_points_downhill():
    """凸起的右側（往右變低）法線朝右：R > 0.5；下方（往下變低）法線朝 -v：G < 0.5。"""
    yy, xx = np.mgrid[0:64, 0:64]
    height = np.exp(-((xx - 32) ** 2 + (yy - 32) ** 2) / 60.0).astype(np.float32)
    normal = height_to_normal(height, 1.0)
    assert normal[32, 36, 0] > 0.52 and normal[32, 28, 0] < 0.48
    assert normal[36, 32, 1] < 0.48 and normal[28, 32, 1] > 0.52
    assert abs(normal[0, 0, 0] - 0.5) < 0.01 and normal[0, 0, 2] > 0.99  # 平坦處 = (0.5, 0.5, 1)


def test_flat_patterns_skip_normal_maps():
    assert _spec(pattern="plaster", klass="plaster")["relief"] is False
    assert _spec(pattern="brick", klass="brick")["relief"] is True


# ---------------------------------------------------------------------------
# PNG
# ---------------------------------------------------------------------------

def _paeth_png(pixels):
    """測試用：每一列都用 Paeth filter 編碼，確認解碼器的 Paeth 還原正確。"""
    data = np.clip(np.round(pixels * 255), 0, 255).astype(np.int32)
    height, width, channels = data.shape
    flat = data.reshape(height, width * channels)
    rows = []
    for y in range(height):
        out = [4]
        for x in range(width * channels):
            a = flat[y, x - channels] if x >= channels else 0
            b = flat[y - 1, x] if y > 0 else 0
            c = flat[y - 1, x - channels] if (y > 0 and x >= channels) else 0
            out.append((flat[y, x] - pngio._paeth(a, b, c)) & 0xFF)
        rows.append(bytes(out))
    header = struct.pack(">IIBBBBB", width, height, 8, {3: 2, 4: 6}[channels], 0, 0, 0)
    return (pngio.SIGNATURE + pngio._chunk(b"IHDR", header) + pngio._chunk(b"IDAT", zlib.compress(b"".join(rows)))
            + pngio._chunk(b"IEND", b""))


def test_png_roundtrip_and_filters():
    rng = np.random.default_rng(3)
    rgba = rng.random((9, 7, 4)).astype(np.float32)
    decoded = pngio.decode_png(pngio.encode_png(rgba))
    assert np.abs(decoded - rgba).max() <= 0.5 / 255 + 1e-6
    rgb = rng.random((6, 5, 3)).astype(np.float32)
    assert np.abs(pngio.decode_png(_paeth_png(rgb)) - rgb).max() <= 0.5 / 255 + 1e-6
    gray = pngio.decode_png(pngio.encode_png(rng.random((4, 4)).astype(np.float32)))
    assert gray.shape == (4, 4, 1) and pngio.to_rgba(gray).shape == (4, 4, 4)


# ---------------------------------------------------------------------------
# surface 解析與 schema
# ---------------------------------------------------------------------------

def test_resolve_surface_defaults_and_hash():
    a = spec.resolve_surface({"name": "w", "hex": "#8A5A35", "surface": {"class": "wood", "tier": "hero"}})
    b = spec.resolve_surface({"name": "w", "hex": "#8A5A35", "surface": {"tier": "hero", "class": "wood"}})
    assert a["hash"] == b["hash"] and a["pattern"] == "planks"
    assert a["tier"] == "standard"  # surface_quality 預設 standard：hero 降一級
    assert a["tile_m"] == spec.PATTERNS["planks"]["units"] * spec.PATTERNS["planks"]["scale_m"]
    hero = spec.resolve_surface({"name": "w", "hex": "#8A5A35", "surface": {"class": "wood", "tier": "hero"}}, quality="hero")
    assert hero["tier"] == "hero" and hero["size"] == 1024
    other = spec.resolve_surface({"name": "x", "hex": "#8A5A35", "surface": {"class": "wood", "tier": "hero"}})
    assert other["hash"] == a["hash"]  # 材質名稱不影響像素 → 不同資產可以共用同一張貼圖


def test_derived_palette_orders_by_brightness():
    shadow, base, light = (spec.hex_to_rgb(h) for h in spec.derive_palette("#7FB0A0"))
    assert sum(shadow) < sum(base) < sum(light)


def test_gpu_bytes_include_mipmaps():
    assert spec.gpu_bytes(512, 512) == int(512 * 512 * 4 * 4 / 3)


def _asset(materials, decals=None):
    doc = {
        "schema": "lowpoly.asset/1", "id": "t", "dimensions": {"w": 1, "d": 1, "h": 1},
        "materials": materials, "budget": {"max_tris": 100, "max_primitives": 4},
        "components": [{"id": "box", "kind": "crate", "tier": "primary", "method": "component",
                        "profile": "decoration", "material": materials[0]["name"],
                        "bounds": [[-0.5, -0.5, 0], [0.5, 0.5, 1]], "source": "observed", "confidence": 0.9}],
        "export": {"path": "public/models/t/t.glb"},
    }
    if decals is not None:
        doc["decals"] = decals
    return doc


def _codes(result):
    return {(e["code"], e["path"]) for e in result["errors"]}


def test_schema_accepts_valid_surface_and_decal():
    doc = _asset([{"name": "wood", "hex": "#8A5A35", "surface": {"class": "wood", "uv": "along", "source": "procedural"}}],
                 [{"id": "sign", "target": "box", "face": "front", "rect": [[-0.2, 0.4], [0.2, 0.6]],
                   "content": {"type": "symbol", "symbol": "star", "color": "#FFFFFF"}}])
    assert validate_document(doc)["errors"] == []


def test_schema_rejects_bad_surface_fields():
    doc = _asset([
        {"name": "a", "hex": "#8A5A35", "surface": {"class": "lava"}},
        {"name": "b", "hex": "#8A5A35", "surface": {"class": "wood", "palette": ["#000000"], "source": "library"}},
        {"name": "glass", "hex": "#8A5A35", "alpha": 0.4, "surface": {"class": "painted"}},
        {"name": "c", "hex": "#8A5A35", "surface": {"class": "wood", "uv": "cube", "wear": 3, "colour": 1}},
    ])
    codes = _codes(validate_document(doc))
    assert ("PLAN_ENUM_INVALID", "materials[0].surface.class") in codes
    assert ("PLAN_FIELD_TYPE", "materials[1].surface.palette") in codes
    assert ("PLAN_FIELD_TYPE", "materials[1].surface.source") in codes
    assert ("PLAN_METHOD_NOT_ALLOWED", "materials[2].surface") in codes
    assert ("PLAN_ENUM_INVALID", "materials[3].surface.uv") in codes
    assert ("PLAN_RANGE", "materials[3].surface.wear") in codes
    assert ("PLAN_ENUM_INVALID", "materials[3].surface.colour") in codes


def test_schema_rejects_bad_decals():
    doc = _asset([{"name": "wood", "hex": "#8A5A35"}], [
        {"id": "box", "target": "nope", "face": "inside", "rect": [[0.2, 0.6], [0.1, 0.4]],
         "content": {"type": "symbol", "symbol": "dragon"}},
    ])
    codes = _codes(validate_document(doc))
    for expected in (("PLAN_ID_DUPLICATE", "decals[0].id"), ("PLAN_REF_MISSING", "decals[0].target"),
                     ("PLAN_ENUM_INVALID", "decals[0].face"), ("PLAN_RANGE", "decals[0].rect"),
                     ("PLAN_ENUM_INVALID", "decals[0].content.symbol")):
        assert expected in codes, (expected, codes)


def test_schema_reference_surfaces():
    doc = {"schema": "lowpoly.reference/1", "id": "r", "image": {"path": "x.png", "width": 10, "height": 10},
           "view": {"type": "front_ortho", "source": "observed", "confidence": 0.9},
           "palette": [{"name": "wall", "hex": "#FFFFFF"}],
           "components": [{"id": "wall", "kind": "wall_block", "tier": "primary", "bbox": [0, 0, 1, 1],
                           "source": "observed", "confidence": 0.9}],
           "surfaces": [{"id": "s", "region": [[0, 0], [1, 0], [1.5, 1]], "class": "brick", "components": ["ghost"],
                         "source": "observed", "confidence": 0.8}]}
    codes = _codes(validate_document(doc))
    assert ("PLAN_RANGE", "surfaces[0].region") in codes
    assert ("PLAN_REF_MISSING", "surfaces[0].components[0]") in codes


# ---------------------------------------------------------------------------
# 外部圖片、快取、provider
# ---------------------------------------------------------------------------

def test_make_seamless_removes_border_seam():
    image = np.zeros((96, 96, 4), np.float32)
    image[:, :, :3] = np.linspace(0, 1, 96)[None, :, None]
    image[:, :, 3] = 1
    assert library.seam_error(image) > 10
    assert library.seam_error(postprocess.make_seamless(image)) < 1.6


def test_resize_and_prepare_external():
    resolved = _spec(pattern="cobble", klass="stone", size=64)
    photo = np.random.default_rng(1).random((100, 140, 3)).astype(np.float32)
    maps = postprocess.prepare_external(photo, resolved)
    assert maps["base"].shape == (64, 64, 4) and maps["orm"].shape == (64, 64, 4) and maps["normal"].shape == (64, 64, 4)
    assert library.seam_error(maps["base"]) < 1.6


def test_cache_store_and_lookup():
    with tempfile.TemporaryDirectory() as root:
        maps = {role: np.full((8, 8, 4), 0.5, np.float32) for role in cache.ROLES}
        assert cache.lookup("k", root) is None
        cache.store("k", maps, {"provider": "test"}, root)
        hit = cache.lookup("k", root)
        assert hit["provenance"]["provider"] == "test" and hit["provenance"]["key"] == "k"
        loaded = cache.load_maps(hit["files"])
        assert np.abs(loaded["base"][:, :, :3] - 0.5).max() < 0.01


def test_provider_without_cache_falls_back_to_procedural():
    resolved = _spec(source="provider:comfyui", size=32)
    with tempfile.TemporaryDirectory() as root:
        result = sources.resolve(resolved, cache_root=root)
    assert result.provenance["source"] == "procedural"
    assert result.warnings and result.warnings[0].startswith("TEXTURE_NOT_PREPARED")


def test_manual_source_reads_files():
    with tempfile.TemporaryDirectory() as folder:
        pngio.write_png(os.path.join(folder, "base.png"), np.full((20, 20, 3), 0.6, np.float32))
        resolved = _spec(source=f"manual:{folder}", size=32)
        result = sources.resolve(resolved)
    assert result.provenance["source"] == "manual" and result.maps["base"].shape == (32, 32, 4)
    missing = sources.resolve(_spec(source="manual:does/not/exist", size=32))
    assert missing.warnings[0].startswith("TEXTURE_SOURCE_MISSING")


def test_fill_template_keeps_numbers():
    filled = comfyui.fill_template({"a": "{{seed}}", "b": ["x {{seed}} y"], "c": {"d": "{{name}}"}},
                                   {"seed": 7, "name": "wood"})
    assert filled == {"a": 7, "b": ["x 7 y"], "c": {"d": "wood"}}


class _MockComfy(http.server.BaseHTTPRequestHandler):
    """模擬 ComfyUI：/prompt 記下 workflow、/history 第二次查詢才完成、/view 回傳一張 PNG。"""
    submitted = []
    polls = 0

    def log_message(self, *_args):
        pass

    def _send(self, body, kind="application/json"):
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        if self.path.startswith("/system_stats"):
            self._send(b"{}")
        elif self.path.startswith("/history/"):
            type(self).polls += 1
            if type(self).polls < 2:
                self._send(b"{}")
            else:
                outputs = {"9": {"images": [{"filename": "a.png", "subfolder": "", "type": "output"}]}}
                self._send(json.dumps({"p1": {"outputs": outputs, "status": {"status_str": "success"}}}).encode())
        elif self.path.startswith("/view"):
            image = np.random.default_rng(5).random((48, 48, 3)).astype(np.float32)
            self._send(pngio.encode_png(image), "image/png")
        else:
            self.send_error(404)

    def do_POST(self):  # noqa: N802
        length = int(self.headers["Content-Length"])
        type(self).submitted.append(json.loads(self.rfile.read(length)))
        self._send(b'{"prompt_id": "p1"}')


def test_comfyui_provider_with_mock_server():
    server = http.server.HTTPServer(("127.0.0.1", 0), _MockComfy)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        client = comfyui.ComfyUIClient(f"http://127.0.0.1:{server.server_port}")
        assert client.available()
        resolved = _spec(source="provider:comfyui", size=64)
        with tempfile.TemporaryDirectory() as root:
            result = comfyui.fetch(resolved, client=client, cache_root=root)
            workflow = _MockComfy.submitted[-1]["prompt"]
            assert workflow["3"]["inputs"]["seed"] == resolved["seed"] % (2 ** 32)
            assert workflow["5"]["inputs"]["width"] == 1024  # SDXL 原生解析度
            assert "hand-painted" in workflow["6"]["inputs"]["text"]
            assert result.maps["base"].shape == (64, 64, 4)
            assert result.provenance["provider"] == "comfyui" and result.provenance["prompt_id"] == "p1"
            # Blender 建模時的 resolve：讀快取，不連網、沒有 warning
            again = sources.resolve(resolved, cache_root=root)
            assert again.warnings == [] and again.provenance["source"] == "provider:comfyui"
            # 第二次 fetch：快取命中，不再送 workflow
            count = len(_MockComfy.submitted)
            comfyui.fetch(resolved, client=client, cache_root=root)
            assert len(_MockComfy.submitted) == count
    finally:
        server.shutdown()
        server.server_close()


def test_prepare_plan_generates_then_uses_cache():
    from lowpoly_kit.surface.prepare import prepare_plan
    server = http.server.HTTPServer(("127.0.0.1", 0), _MockComfy)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        client = comfyui.ComfyUIClient(f"http://127.0.0.1:{server.server_port}")
        doc = _asset([{"name": "wood", "hex": "#8A5A35",
                       "surface": {"class": "wood", "tier": "prop", "source": "provider:comfyui"}},
                      {"name": "plain", "hex": "#FFFFFF", "surface": {"class": "painted"}}])
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "t.plan.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(doc, handle)
            _MockComfy.polls = 0
            first = prepare_plan(path, client=client, cache_root=folder)
            assert first["ok"] and [i["status"] for i in first["items"]] == ["generated"], first
            second = prepare_plan(path, client=client, cache_root=folder)
            assert [i["status"] for i in second["items"]] == ["cached"]
            offline = prepare_plan(path, force=True, client=comfyui.ComfyUIClient("http://127.0.0.1:9", timeout=0.5),
                                   cache_root=folder)
            assert not offline["ok"] and offline["items"][0]["status"] == "failed"
    finally:
        server.shutdown()
        server.server_close()


def test_comfyui_unavailable_raises():
    client = comfyui.ComfyUIClient("http://127.0.0.1:9", timeout=0.5)
    assert not client.available()
    try:
        client.submit({})
    except comfyui.ComfyUIError:
        return
    raise AssertionError("連不到服務時應該丟 ComfyUIError")


# ---------------------------------------------------------------------------
# 表面指標、排列
# ---------------------------------------------------------------------------

def test_surface_metrics():
    flat = np.full((64, 64, 3), 0.5, np.float32)
    stripes = flat.copy()
    stripes[(np.arange(64) // 4) % 2 == 0] = 0.9  # 每 8 px 重複一次的橫條紋
    mask = np.ones((64, 64), bool)
    assert surface_metrics.color_similarity(flat, mask, flat, mask) > 0.99
    red = np.zeros_like(flat)
    red[..., 0] = 1
    assert surface_metrics.color_similarity(flat, mask, red, mask) < 0.05
    assert surface_metrics.detail_density(flat, mask) == 0.0
    assert surface_metrics.detail_density(stripes, mask) > 0.01
    assert surface_metrics.dominant_period(stripes, mask, axis=0) == 8.0
    assert surface_metrics.dominant_period(flat, mask, axis=0) is None
    region = surface_metrics.compare_region(stripes, stripes, mask, scale_m=0.08, meters_per_px=0.01)
    assert region["detail_ratio"] == 1.0 and region["scale_ratio"] == 1.0


def test_shelf_pack_fits_without_overlap():
    sizes = [0.5, 0.3, 0.3, 0.2, 0.1, 0.1]
    _scale, spots = shelf_pack(sizes, 0.01)
    for i, (x, y, side) in enumerate(spots):
        assert 0 <= x and 0 <= y and x + side <= 1 + 1e-9 and y + side <= 1 + 1e-9
        for j, (x2, y2, side2) in enumerate(spots):
            if i < j:
                assert x + side <= x2 + 1e-9 or x2 + side2 <= x + 1e-9 or y + side <= y2 + 1e-9 or y2 + side2 <= y + 1e-9


def load_tests(loader, tests, pattern):  # noqa: ARG001
    suite = unittest.TestSuite()
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            suite.addTest(unittest.FunctionTestCase(fn, description=name))
    return suite
