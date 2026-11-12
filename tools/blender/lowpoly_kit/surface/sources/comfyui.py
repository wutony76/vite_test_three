"""本機 ComfyUI provider（在 host 端執行，不在 Blender 裡）。

ComfyUI 的 HTTP API（預設 http://127.0.0.1:8188）：
1. POST /prompt          送出 workflow（API 格式的 JSON），回傳 prompt_id
2. GET  /history/<id>    完成後，裡面的 outputs 列出產生的圖片（filename、subfolder、type）
3. GET  /view?filename=… 下載圖片

workflow 樣板：tools/blender/textures/comfyui/workflow_sdxl.json。
字串欄位裡的 {{positive}}、{{negative}}、{{seed}}、{{width}}、{{height}}、{{ckpt}} 會被替換；
整個字串剛好是 "{{seed}}" 這種形式時，替換成數字（KSampler 的 seed 需要整數）。

環境變數：
- LPK_COMFYUI_URL：服務位址（預設 http://127.0.0.1:8188）
- LPK_COMFYUI_CKPT：checkpoint 檔名（預設 sd_xl_base_1.0.safetensors）
- LPK_COMFYUI_WORKFLOW：自訂 workflow 樣板路徑
只用標準函式庫（urllib），不需要 requests。
"""

import io
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import numpy as np

from .. import pngio
from . import cache
from .base import TextureResult, request_for
from .postprocess import prepare_external

DEFAULT_URL = "http://127.0.0.1:8188"
DEFAULT_CKPT = "sd_xl_base_1.0.safetensors"
DEFAULT_WORKFLOW = os.path.join(cache.TEXTURES_DIR, "comfyui", "workflow_sdxl.json")
PLACEHOLDER = "{{%s}}"


class ComfyUIError(RuntimeError):
    pass


class ComfyUIClient:
    def __init__(self, base_url=None, timeout=10.0):
        self.base_url = (base_url or os.environ.get("LPK_COMFYUI_URL") or DEFAULT_URL).rstrip("/")
        self.timeout = timeout
        self.client_id = uuid.uuid4().hex

    def _request(self, path, payload=None):
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(self.base_url + path, data=data,
                                         headers={"Content-Type": "application/json"} if data else {})
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.read()
        except (urllib.error.URLError, OSError) as exc:
            raise ComfyUIError(f"連不到 ComfyUI（{self.base_url}{path}）：{exc}") from exc

    def available(self):
        try:
            self._request("/system_stats")
            return True
        except ComfyUIError:
            return False

    def submit(self, workflow):
        body = json.loads(self._request("/prompt", {"prompt": workflow, "client_id": self.client_id}))
        if "prompt_id" not in body:
            raise ComfyUIError(f"ComfyUI 拒絕 workflow：{body.get('error') or body}")
        return body["prompt_id"]

    def wait(self, prompt_id, timeout=600.0, poll=1.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            history = json.loads(self._request(f"/history/{prompt_id}"))
            entry = history.get(prompt_id)
            if entry and entry.get("outputs"):
                for output in entry["outputs"].values():
                    if output.get("images"):
                        return output["images"][0]
            status = (entry or {}).get("status", {})
            if status.get("status_str") == "error":
                raise ComfyUIError(f"ComfyUI 執行失敗：{status.get('messages')}")
            time.sleep(poll)
        raise ComfyUIError(f"等待 ComfyUI 超過 {timeout:.0f} 秒")

    def download(self, image):
        query = urllib.parse.urlencode({"filename": image["filename"], "subfolder": image.get("subfolder", ""),
                                        "type": image.get("type", "output")})
        return self._request(f"/view?{query}")


def fill_template(node, values):
    """遞迴替換樣板。整個字串就是佔位符時保留原型別（數字），否則做字串替換。"""
    if isinstance(node, dict):
        return {key: fill_template(value, values) for key, value in node.items()}
    if isinstance(node, list):
        return [fill_template(value, values) for value in node]
    if isinstance(node, str):
        for name, value in values.items():
            token = PLACEHOLDER % name
            if node == token:
                return value
            node = node.replace(token, str(value))
    return node


def build_workflow(request, template_path=None, ckpt=None):
    with open(template_path or os.environ.get("LPK_COMFYUI_WORKFLOW") or DEFAULT_WORKFLOW, encoding="utf-8") as handle:
        template = json.load(handle)
    # SDXL 的原生解析度是 1024；比較小的貼圖也用 1024 生成，之後再縮小（直接生成 512 品質差很多）
    side = max(1024, request.size)
    values = {"positive": request.prompt, "negative": request.negative, "seed": request.seed % (2 ** 32),
              "width": side, "height": side, "ckpt": ckpt or os.environ.get("LPK_COMFYUI_CKPT") or DEFAULT_CKPT}
    return fill_template(template, values)


def decode_image(data):
    try:
        from PIL import Image
    except ImportError:
        return pngio.decode_png(data)
    with Image.open(io.BytesIO(data)) as image:
        return np.asarray(image.convert("RGBA"), dtype=np.float32) / 255.0


def fetch(spec, client=None, template_path=None, cache_root=None, force=False):
    """產生一張貼圖並寫入快取（host 端）。已經有快取時直接回傳，除非 force。"""
    request = request_for(spec)
    key = request.key("comfyui")
    if not force:
        hit = cache.lookup(key, cache_root)
        if hit is not None:
            return TextureResult(cache.load_maps(hit["files"]), hit["provenance"], ["快取命中，沒有重新生成"])
    client = client or ComfyUIClient()
    workflow = build_workflow(request, template_path)
    started = time.time()
    prompt_id = client.submit(workflow)
    image_info = client.wait(prompt_id)
    raw = decode_image(client.download(image_info))
    maps = prepare_external(raw, spec, seamless=spec["tileable"], lock=0.6)
    provenance = {
        "provider": "comfyui", "url": client.base_url, "prompt_id": prompt_id, "prompt": request.prompt,
        "negative": request.negative, "seed": request.seed, "ckpt": workflow_ckpt(workflow),
        "seconds": round(time.time() - started, 1), "material": spec["name"], "class": spec["class"],
        "postprocess": {"seamless": spec["tileable"], "palette_lock": 0.6, "size": spec["size"]},
    }
    stored = cache.store(key, maps, provenance, cache_root)
    return TextureResult(maps, stored["provenance"])


def workflow_ckpt(workflow):
    for node in workflow.values():
        if isinstance(node, dict) and node.get("class_type") == "CheckpointLoaderSimple":
            return node.get("inputs", {}).get("ckpt_name")
    return None
