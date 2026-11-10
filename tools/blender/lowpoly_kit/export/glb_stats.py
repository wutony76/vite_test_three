"""讀 GLB 檔頭與 JSON，統計節點、Mesh、primitive（約等於 Three.js 的 draw call）與三角面。

純 Python，不依賴 bpy，所以 Blender 內外都能用。
"""

import json
import os
import struct


def read_glb_json(path):
    with open(path, "rb") as handle:
        header = handle.read(20)
        magic, _version, _length, chunk_length, chunk_type = struct.unpack("<4sIIII", header)
        if magic != b"glTF" or chunk_type != 0x4E4F534A:  # 'JSON'
            raise ValueError(f"{path} 不是合法的 GLB")
        return json.loads(handle.read(chunk_length))


def glb_stats(path):
    gltf = read_glb_json(path)
    nodes = gltf.get("nodes", [])
    scenes = gltf.get("scenes", [])
    scene = scenes[gltf.get("scene", 0)] if scenes else {"nodes": []}
    accessors = gltf.get("accessors", [])
    primitives = 0
    triangles = 0
    for mesh in gltf.get("meshes", []):
        for primitive in mesh["primitives"]:
            primitives += 1
            if "indices" in primitive:
                triangles += accessors[primitive["indices"]]["count"] // 3
            else:
                triangles += accessors[primitive["attributes"]["POSITION"]]["count"] // 3
    return {
        "file_bytes": os.path.getsize(path),
        "root_nodes": [nodes[i].get("name") for i in scene.get("nodes", [])],
        "nodes": len(nodes),
        "meshes": len(gltf.get("meshes", [])),
        "primitives": primitives,
        "triangles": triangles,
        "materials": len(gltf.get("materials", [])),
    }
