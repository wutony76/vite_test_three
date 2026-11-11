"""依物件類型設定的拓撲規則。

不是每個 Mesh 都該封閉：海面本來就是開放的平面，玻璃可以是單面，
裝飾品可以是很多小零件。用同一套標準檢查所有物件，結果不是誤判就是放水。

欄位：
- components：必須剛好幾個幾何島，None 表示不限
- max_components：幾何島上限，None 表示不限。
  少了上限，decoration 塞一百個方塊也會通過，等於又回到 primitive 堆疊
- allow_boundary：是否允許開放邊界
- normals：是否要求法線方向一致（封閉時還要求朝外）
- ngon：遇到 ngon 時的處理（"warn" 只提醒、"ignore" 不管）
- remesh：是否允許 Voxel Remesh
- max_tris：單一 Object 的三角面上限（擋下爆面的零件）
- self_intersection："fail" 不可以自我交叉；"ignore" 多島零件的島之間本來就會互相穿插，只回報數值
- bevel／wobble：建模時要不要倒角、做手繪偏移（orchestrator 讀取）
"""

from ..result import KitError

DEFAULT_PROFILE = "building_shell"


def _profile(description, components=None, max_components=None, allow_boundary=False, normals=True,
             ngon="warn", remesh=False, max_tris=1000, self_intersection="ignore", bevel=False, wobble=False):
    return {
        "description": description,
        "components": components,
        "max_components": components if max_components is None and components is not None else max_components,
        "allow_boundary": allow_boundary,
        "normals": normals,
        "ngon": ngon,
        "remesh": remesh,
        "max_tris": max_tris,
        "self_intersection": self_intersection,
        "bevel": bevel,
        "wobble": wobble,
    }


PROFILES = {
    "building_shell": _profile("建築主體、地基、壓頂：連續且封閉的單一幾何", components=1, max_tris=3000,
                               self_intersection="fail", bevel=True, wobble=True),
    "roof": _profile("獨立的屋頂：連續且封閉的單一幾何", components=1, max_tris=2000,
                     self_intersection="fail", bevel=True, wobble=True),
    "trim": _profile("樑、柱、雨遮、窗台：細長的結構件，每塊都要封閉", max_components=12, max_tris=800,
                     bevel=True, wobble=True),
    "opening": _profile("門、窗框：獨立 Object，每塊都要封閉", max_components=6, max_tris=1500, bevel=True),
    "glass": _profile("玻璃：可以是單面平面", max_components=4, allow_boundary=True, normals=False,
                      ngon="ignore", max_tris=200),
    "decoration": _profile("裝飾品：允許少量獨立零件與開口", max_components=8, allow_boundary=True,
                           normals=False, ngon="ignore", max_tris=1000),
    "vegetation": _profile("藤蔓、灌木、樹幹：可以有多片葉團，每片都要封閉", max_components=8,
                           ngon="ignore", max_tris=1000),
    "tile_array": _profile("屋瓦：大量重複的封閉小片", ngon="ignore", max_tris=3000),
    "organic": _profile("岩石、樹冠等有機物：封閉單一幾何，允許 Voxel Remesh", components=1, ngon="ignore",
                        remesh=True, max_tris=2000, self_intersection="fail"),
    "terrain": _profile("地形：單一開放曲面", components=1, allow_boundary=True, normals=False, ngon="ignore",
                        max_tris=10000, self_intersection="fail"),
    "road": _profile("道路：單一開放帶狀面", components=1, allow_boundary=True, normals=False, ngon="ignore",
                     max_tris=4000, self_intersection="fail"),
    "water_surface": _profile("海面、水面：單一開放平面", components=1, allow_boundary=True, normals=False,
                              ngon="ignore", max_tris=6000, self_intersection="fail"),
}


def get_profile(name):
    if name not in PROFILES:
        raise KitError("UNKNOWN_PROFILE", f"沒有 {name!r} 這個 profile，可用：{', '.join(PROFILES)}")
    return PROFILES[name]


def list_profiles():
    return {name: rule["description"] for name, rule in PROFILES.items()}
