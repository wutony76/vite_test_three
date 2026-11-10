"""依物件類型設定的拓撲規則。

不是每個 Mesh 都該封閉：海面本來就是開放的平面，玻璃可以是單面，
裝飾品可以是很多小零件。用同一套標準檢查所有物件，結果不是誤判就是放水。

欄位：
- components：預期的幾何島數量，None 表示不限制
- allow_boundary：是否允許開放邊界
- normals：是否要求法線方向一致（封閉時還要求朝外）
- ngon：遇到 ngon 時的處理（"warn" 只提醒、"ignore" 不管）
- remesh：是否允許 Voxel Remesh
"""

from ..result import KitError

DEFAULT_PROFILE = "building_shell"

PROFILES = {
    "building_shell": {
        "description": "建築主體、屋頂、地基：連續且封閉的單一幾何",
        "components": 1,
        "allow_boundary": False,
        "normals": True,
        "ngon": "warn",
        "remesh": False,
    },
    "opening": {
        "description": "門、窗框：獨立 Object，每塊都要封閉",
        "components": None,
        "allow_boundary": False,
        "normals": True,
        "ngon": "warn",
        "remesh": False,
    },
    "glass": {
        "description": "玻璃：可以是單面平面",
        "components": None,
        "allow_boundary": True,
        "normals": False,
        "ngon": "ignore",
        "remesh": False,
    },
    "water_surface": {
        "description": "海面、水面：單一開放平面",
        "components": 1,
        "allow_boundary": True,
        "normals": False,
        "ngon": "ignore",
        "remesh": False,
    },
    "decoration": {
        "description": "裝飾品：允許多個獨立零件與開口",
        "components": None,
        "allow_boundary": True,
        "normals": False,
        "ngon": "ignore",
        "remesh": False,
    },
    "organic": {
        "description": "岩石、小島等有機物：封閉單一幾何，允許 Voxel Remesh",
        "components": 1,
        "allow_boundary": False,
        "normals": True,
        "ngon": "ignore",
        "remesh": True,
    },
}


def get_profile(name):
    if name not in PROFILES:
        raise KitError("UNKNOWN_PROFILE", f"沒有 {name!r} 這個 profile，可用：{', '.join(PROFILES)}")
    return PROFILES[name]


def list_profiles():
    return {name: rule["description"] for name, rule in PROFILES.items()}
