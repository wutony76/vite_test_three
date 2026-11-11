"""plan 裡允許出現的名稱清單。

AI 寫 plan 時常會自己發明名稱（例如 "roof_thing"）。名稱不在清單裡就直接報錯，
Phase 3 的 orchestrator 才不會拿到不認得的 kind，建到一半才失敗。

profile 不在這裡重複定義，直接讀 validation/profiles.py：
兩份清單各自維護，遲早會不一致（plan 驗證通過、拓撲驗證卻說沒有這個 profile）。
"""

from ..validation.profiles import PROFILES

SCHEMA_REFERENCE = "lowpoly.reference/1"
SCHEMA_ASSET = "lowpoly.asset/1"
SCHEMA_SCENE = "lowpoly.scene/1"
SCHEMAS = (SCHEMA_REFERENCE, SCHEMA_ASSET, SCHEMA_SCENE)

SOURCES = ("observed", "inferred")

# 三層細節：Primary 決定輪廓，Secondary 是結構，Tertiary 是裝飾
TIERS = ("primary", "secondary", "tertiary")

VIEW_TYPES = ("front_ortho", "three_quarter", "side", "top", "unknown")

# method 決定 Phase 3 用哪種方式產生幾何：
# - custom_mesh / component：建立新的 Object
# - extrude / inset_extrude / bridge：修改 parent 的 Mesh（所以一定要有 parent）
# - boolean_union：先建立，再融合進 union_into 指定的元件
# - remesh：只有允許 Voxel Remesh 的 profile（organic）可以用
METHODS = ("custom_mesh", "component", "extrude", "inset_extrude", "bridge", "boolean_union", "remesh")
METHODS_EDIT_PARENT = ("extrude", "inset_extrude", "bridge")
# 會產生獨立 Object 的 method：匯出後每個至少 1 個 primitive（約 1 個 draw call）
METHODS_NEW_OBJECT = ("custom_mesh", "component", "remesh")

# 元件種類。Phase 3 的零件庫完成後，改由零件庫的註冊表產生這份清單。
KINDS = (
    # 主體
    "wall_block", "foundation", "coping", "roof_flat", "roof_gable", "roof_hip",
    # 結構
    "pillar", "beam", "brick_patch", "canopy", "awning", "steps", "chimney", "roof_tiles", "gable_trim", "pipe",
    # 開口
    "window", "door", "shop_window", "glass_pane",
    # 裝飾
    "planter_box", "pot_plant", "vine", "sign_disc", "poster", "chalkboard_sign",
    "wall_lamp", "wall_light", "street_lamp", "lantern", "cat_silhouette", "crate", "fence", "bucket",
    "arcade_cabinet", "arcade_kitbash", "arcade_controls",
    "roast_chicken_meat", "chicken_bone",
    # 植物、自然物
    "tree_trunk", "tree_canopy", "bush", "rock", "rock_pile",
    # 暫時找不到合適種類時使用，驗證會給 warning
    "generic",
)

TERRAIN_KINDS = ("flat", "grid_hills")

PROFILE_NAMES = tuple(PROFILES)

# 桌機的預算上限：超過這個值通常代表 plan 寫錯（例如多打一個 0），不是真的需要
DESKTOP_ASSET_MAX_TRIS = 20000
DESKTOP_SCENE_MAX_TRIS = 300000
DESKTOP_SCENE_MAX_DRAW_CALLS = 300

# 參考圖分析：confidence 低於這個值給 warning
LOW_CONFIDENCE = 0.3
# 推測元件比例超過這個值給 warning
HIGH_INFERRED_RATIO = 0.4
# primary／secondary 元件可以超出 dimensions 的容差比例
BOUNDS_TOLERANCE = 0.05
