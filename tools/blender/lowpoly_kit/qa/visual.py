"""Visual QA（Blender 端）：渲染正面剪影與正面圖，和參考圖比較輪廓、元件位置、顏色。

判定只看數字（qa/metrics.py）；輸出的疊圖給 AI 或人工檢視、寫評語，但評語不影響 pass／fail。
會暫時改動渲染引擎、相機、Object 的 hide_render 等設定，全部在 finally 裡還原，
所以也可以在使用者正在使用的 Blender 裡執行。
"""

import json
import math
import os

import bpy
import numpy as np

from . import metrics, surface_metrics

KIT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.abspath(os.path.join(KIT_DIR, "..", "..", ".."))

SILHOUETTE_PASS, SILHOUETTE_WARN = 0.85, 0.75
COMPONENT_PASS, COMPONENT_WARN, COMPONENT_LOW = 0.7, 0.55, 0.5
COLOR_PASS, COLOR_WARN = 15.0, 30.0
# 材質區域（reference.surfaces）：只產生 warn。參考圖是插畫、渲染是 Workbench，本來就不會完全一樣
SURFACE_SIMILARITY = 0.35        # Lab 直方圖交集
SURFACE_DETAIL = (0.6, 1.5)      # 細節密度比（渲染 ÷ 參考）
SURFACE_SCALE = (0.75, 1.25)     # 圖樣週期 ÷ scale_m
SURFACE_STYLE = 0.2              # 飽和度差


# ---------------------------------------------------------------------------
# 取景：從 ReferenceSpec 反推正面正交相機
# ---------------------------------------------------------------------------

def load_reference(plan, plan_path):
    if not plan.get("reference"):
        return None
    path = os.path.join(os.path.dirname(os.path.abspath(plan_path)), f"{plan['reference']}.reference.json")
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def reference_frame(plan, reference, root_location=(0.0, 0.0, 0.0)):
    """比例尺、畫面中心、畫面高度（公尺）。只支援正面正交的參考圖，其他視角回傳 None。

    plan 的 wall_block 元件和 reference 裡同 id 的元件是同一面牆：
    用「影像框 ↔ 公尺 bounds」的對應，把整張參考圖換算成世界座標。
    """
    if reference is None or reference["view"]["type"] != "front_ortho":
        return None
    width, height = reference["image"]["width"], reference["image"]["height"]
    by_id = {c["id"]: c for c in reference["components"]}
    anchor = by_id[reference["scale_anchor"]["component"]]
    x0, y0, x1, y1 = anchor["bbox"]
    span = (y1 - y0) * height if reference["scale_anchor"]["axis"] == "height" else (x1 - x0) * width
    scale = reference["scale_anchor"]["meters"] / span
    wall = next(c for c in plan["components"] if c["kind"] == "wall_block" and c["id"] in by_id)
    (wx0, _wy0, wz0), (wx1, _wy1, _wz1) = wall["bounds"]
    rx0, _ry0, rx1, ry1 = by_id[wall["id"]]["bbox"]
    center_x = (0.5 * width - (rx0 + rx1) / 2 * width) * scale + (wx0 + wx1) / 2 + root_location[0]
    center_z = (ry1 - 0.5) * height * scale + wz0 + root_location[2]
    return {"center": (center_x, center_z), "height_m": height * scale, "pixels": (width, height),
            "image": os.path.join(REPO_ROOT, reference["image"]["path"]), "y": root_location[1] - 40.0}


# ---------------------------------------------------------------------------
# 場景設定的保存與還原
# ---------------------------------------------------------------------------

class SceneState:
    """記錄 Visual QA 會動到的所有設定。少了這層，在使用者的 Blender 跑一次 QA，
    他的渲染引擎、相機、隱藏的物件就全被改掉了。"""

    SHADING = ("light", "color_type", "single_color", "show_shadows", "show_cavity", "cavity_type")

    def __init__(self, scene):
        self.scene = scene
        render = scene.render
        self.render = {k: getattr(render, k) for k in
                       ("engine", "resolution_x", "resolution_y", "resolution_percentage", "filepath", "film_transparent")}
        self.shading = {k: getattr(scene.display.shading, k) for k in self.SHADING}
        if hasattr(self.shading["single_color"], "copy"):
            self.shading["single_color"] = tuple(self.shading["single_color"])
        self.view_transform = scene.view_settings.view_transform
        self.camera = scene.camera
        self.world = scene.world
        self.world_color = tuple(scene.world.color) if scene.world else None
        self.hidden = {o.name: o.hide_render for o in scene.objects}
        self.temp_objects, self.temp_worlds = [], []

    def restore(self):
        scene = self.scene
        for key, value in self.render.items():
            try:
                setattr(scene.render, key, value)
            except (TypeError, AttributeError):
                pass
        for key, value in self.shading.items():
            setattr(scene.display.shading, key, value)
        scene.view_settings.view_transform = self.view_transform
        scene.camera = self.camera
        scene.world = self.world
        if self.world is not None and self.world_color is not None:
            self.world.color = self.world_color
        for name, hidden in self.hidden.items():
            obj = scene.objects.get(name)
            if obj is not None:
                obj.hide_render = hidden
        for obj in self.temp_objects:
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data is not None and data.users == 0:
                bpy.data.cameras.remove(data)
        for world in self.temp_worlds:
            if world.users == 0:
                bpy.data.worlds.remove(world)


def _setup(scene, state, background):
    try:
        scene.render.engine = "BLENDER_WORKBENCH"
    except TypeError as exc:
        raise RuntimeError(f"Workbench 不可用：{exc}") from exc
    scene.view_settings.view_transform = "Standard"  # AgX 會壓低飽和度，顏色就沒辦法和參考圖比
    scene.render.film_transparent = False
    scene.render.resolution_percentage = 100
    if scene.world is None or scene.world is state.world:
        world = bpy.data.worlds.new("LPK_QA_World")
        state.temp_worlds.append(world)
        scene.world = world
    scene.world.color = background


def _ortho_camera(state, frame):
    data = bpy.data.cameras.new("LPK_QA_Front")
    camera = bpy.data.objects.new("LPK_QA_Front", data)
    bpy.context.scene.collection.objects.link(camera)
    state.temp_objects.append(camera)
    data.type = "ORTHO"
    data.sensor_fit = "VERTICAL"
    data.ortho_scale = frame["height_m"]
    data.clip_end = 200.0
    camera.location = (frame["center"][0], frame["y"], frame["center"][1])
    camera.rotation_euler = (math.radians(90), 0.0, 0.0)  # 看向 +Y（建築正面朝 -Y）
    return camera


def _render(scene, camera, path, size):
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return load_pixels(path)


def load_pixels(path):
    """讀圖成 (h, w, 4)、左上為原點的陣列（Blender 的 pixels 從最下面一列開始，要翻轉）。"""
    image = bpy.data.images.load(path, check_existing=False)
    try:
        w, h = image.size
        buf = np.empty(w * h * 4, dtype=np.float32)
        image.pixels.foreach_get(buf)
        return np.flipud(buf.reshape(h, w, 4)).copy()
    finally:
        bpy.data.images.remove(image)


def save_pixels(pixels, path):
    h, w = pixels.shape[:2]
    image = bpy.data.images.new("LPK_QA_Out", w, h, alpha=True)
    try:
        image.pixels.foreach_set(np.flipud(pixels).astype(np.float32).ravel())
        image.filepath_raw = path
        image.file_format = "PNG"
        image.save()
    finally:
        bpy.data.images.remove(image)


def _uses_atlas(root):
    """有任何 Image Texture（palette atlas 或 Surface Engine 的貼圖）就要用 Workbench 的 TEXTURE 顯示模式。

    MATERIAL 模式只顯示材質的 viewport 顏色；貼圖材質的 viewport 顏色是白色，整個模型會變成灰的。
    """
    return any(m and m.node_tree and any(n.type == "TEX_IMAGE" and n.image for n in m.node_tree.nodes)
               for o in root.children_recursive if o.type == "MESH" for m in o.data.materials)


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def run_visual_qa(plan, plan_path, root, out_dir):
    reference = load_reference(plan, plan_path)
    frame = reference_frame(plan, reference, tuple(root.matrix_world.translation))
    if frame is None:
        return {"status": "skipped", "reason": "plan 沒有參考圖，或參考圖不是正面正交視角（front_ortho）"}
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    width, height = frame["pixels"]
    comps = {c["id"]: c for c in plan["components"]}
    members = [o for o in root.children_recursive if o.type == "MESH"]
    report = {"issues": [], "images": {}}

    state = SceneState(scene)
    try:
        _setup(scene, state, (0.0, 0.0, 0.0))
        camera = _ortho_camera(state, frame)
        shading = scene.display.shading

        # 1. 輪廓：只看 primary／secondary（參考輪廓是建築主體，不含路燈、盆栽）
        structural = {o.name for o in members if o.get("lpk_tier") in ("primary", "secondary")}
        for obj in scene.objects:
            obj.hide_render = obj.name not in structural
        shading.light, shading.color_type = "FLAT", "SINGLE"
        shading.single_color = (1.0, 1.0, 1.0)
        shading.show_shadows = shading.show_cavity = False
        silhouette = _render(scene, camera, os.path.join(out_dir, "silhouette.png"), (width, height))
        model_mask = silhouette[..., :3].mean(axis=2) > 0.5
        ref_mask = metrics.polygon_mask(reference["silhouette"]["outline"], width, height)
        report["silhouette_iou"] = round(metrics.iou(model_mask, ref_mask), 4)

        overlay = np.zeros((height, width, 4), dtype=np.float32)
        overlay[..., 3] = 1.0
        overlay[..., :3] = 0.12
        overlay[ref_mask & model_mask, :3] = (0.2, 0.75, 0.3)    # 重疊：綠
        overlay[ref_mask & ~model_mask, :3] = (0.9, 0.25, 0.2)   # 只有參考：紅（模型缺少）
        overlay[~ref_mask & model_mask, :3] = (0.25, 0.45, 0.95)  # 只有模型：藍（模型多出來）
        save_pixels(overlay, os.path.join(out_dir, "overlay.png"))

        # 2. 正面圖：整個資產，材質原色（atlas 時顯示貼圖），FLAT 打光才能直接比顏色
        root_members = {o.name for o in members}
        for obj in scene.objects:
            obj.hide_render = obj.name not in root_members
        scene.world.color = (0.93, 0.92, 0.88)
        shading.color_type = "TEXTURE" if _uses_atlas(root) else "MATERIAL"
        shading.show_cavity = True
        shading.cavity_type = "BOTH"
        front = _render(scene, camera, os.path.join(out_dir, "front.png"), (width, height))
    finally:
        state.restore()

    # 3. 元件位置：每個元件投影到正面的外框 vs 參考框
    ref_boxes = {c["id"]: c["bbox"] for c in reference["components"]}
    component_iou = {}
    for obj in members:
        cid = obj.get("lpk_component")
        if cid not in ref_boxes:
            continue
        points = [obj.matrix_world @ v.co for v in obj.data.vertices]
        lo = [min(p[k] for p in points) for k in range(3)]
        hi = [max(p[k] for p in points) for k in range(3)]
        component_iou[cid] = round(metrics.bbox_iou(metrics.project_bbox(lo, hi, frame), ref_boxes[cid]), 4)
    report["component_iou"] = component_iou
    report["component_mean"] = round(sum(component_iou.values()) / len(component_iou), 4) if component_iou else None

    # 4. 顏色：色票取樣區的中位數 ΔE（渲染 vs 參考圖）
    ref_pixels = load_pixels(frame["image"])
    colors = []
    for spec in reference.get("palette", []):
        if "sample" not in spec:
            continue
        ref_rgb = metrics.median_color(ref_pixels, spec["sample"])
        out_rgb = metrics.median_color(front, spec["sample"])
        colors.append({"name": spec["name"], "reference": metrics.rgb_to_hex(ref_rgb),
                       "render": metrics.rgb_to_hex(out_rgb), "delta_e": round(metrics.delta_e(ref_rgb, out_rgb), 1)})
    report["colors"] = colors

    # 4b. 材質區域（reference.surfaces）：顏色分布、細節密度、紋理比例、風格。只產生 warn
    meters_per_px = frame["height_m"] / height
    surfaces = []
    for spec in reference.get("surfaces", []):
        mask = metrics.polygon_mask(spec["region"], width, height)
        if mask.sum() < 64:
            continue
        values = surface_metrics.compare_region(ref_pixels, front, mask, spec.get("scale_m"), meters_per_px)
        surfaces.append({"id": spec["id"], "class": spec["class"], **values})
    report["surfaces"] = surfaces

    # 5. 並排比較圖
    pad = np.ones((height, 12, 4), dtype=np.float32)
    save_pixels(np.concatenate([ref_pixels, pad, front], axis=1), os.path.join(out_dir, "compare.png"))

    _grade(report)
    report["images"] = {name: os.path.join(out_dir, f"{name}.png") for name in ("front", "silhouette", "overlay", "compare")}
    report["ai_review"] = ("請用 Read／look 檢視 overlay.png（綠 = 重疊、紅 = 模型缺少、藍 = 模型多出來）與 compare.png，"
                           "寫出差異、可能原因、要修改 plan 的哪個欄位。評語不影響判定。")
    with open(os.path.join(out_dir, "visual_report.json"), "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    return report


def _grade(report):
    issues = report["issues"]

    def add(level, code, message):
        issues.append({"level": level, "code": code, "message": message})

    level = metrics.grade(report["silhouette_iou"], SILHOUETTE_PASS, SILHOUETTE_WARN)
    if level != "pass":
        add(level, "SILHOUETTE_IOU", f"輪廓 IoU {report['silhouette_iou']}（pass ≥ {SILHOUETTE_PASS}）")
    if report["component_mean"] is not None:
        level = metrics.grade(report["component_mean"], COMPONENT_PASS, COMPONENT_WARN)
        if level != "pass":
            add(level, "COMPONENT_IOU", f"元件位置 IoU 平均 {report['component_mean']}（pass ≥ {COMPONENT_PASS}）")
        for cid, value in report["component_iou"].items():
            if value < COMPONENT_LOW:
                add("warn", "COMPONENT_LOW", f"{cid} 的位置 IoU 只有 {value}")
    for item in report.get("surfaces", []):
        if item["similarity"] < SURFACE_SIMILARITY:
            add("warn", "SURFACE_COLOR", f"{item['id']}（{item['class']}）顏色分布相似度 {item['similarity']}"
                                         f"（< {SURFACE_SIMILARITY}）：檢查 surface.palette")
        ratio = item.get("detail_ratio")
        if ratio is not None and not SURFACE_DETAIL[0] <= ratio <= SURFACE_DETAIL[1]:
            hint = "太平（加 surface 或提高 wear／dirt）" if ratio < 1 else "太花（降低 tier 細節或 normal_strength）"
            add("warn", "SURFACE_DETAIL", f"{item['id']} 細節密度是參考圖的 {ratio} 倍：{hint}")
        scale = item.get("scale_ratio")
        if scale is not None and not SURFACE_SCALE[0] <= scale <= SURFACE_SCALE[1]:
            add("warn", "SURFACE_SCALE", f"{item['id']} 圖樣週期 {item.get('period_render_m')} m，是 scale_m 的 {scale} 倍")
        gap = abs(item["style_render"]["saturation"] - item["style_reference"]["saturation"])
        if gap > SURFACE_STYLE:
            add("warn", "SURFACE_STYLE", f"{item['id']} 飽和度差 {gap:.2f}：和參考圖的手繪風格不一致")
    for color in report["colors"]:
        if color["delta_e"] > COLOR_PASS:
            note = "偏差大" if color["delta_e"] > COLOR_WARN else "略有偏差"
            add("warn", "COLOR_DELTA_E", f"{color['name']} ΔE {color['delta_e']}（{note}；參考 {color['reference']}、渲染 {color['render']}）")
    levels = {i["level"] for i in issues}
    report["status"] = "fail" if "fail" in levels else "warn" if "warn" in levels else "pass"
