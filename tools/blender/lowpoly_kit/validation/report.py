"""把檢查數值套上 profile 規則，判定 pass / warn / fail。"""

from .profiles import get_profile


def evaluate(checks, profile_name):
    rule = get_profile(profile_name)
    issues = []

    def fail(check, message):
        issues.append({"check": check, "level": "fail", "message": message})

    def warn(check, message):
        issues.append({"check": check, "level": "warn", "message": message})

    if checks["faces"] == 0:
        fail("faces", "沒有任何面")

    # 以下三項不分類型都必須為 0：它們在任何情況下都是錯的
    if checks["duplicate_verts"] > 0:
        fail("duplicate_verts", f"{checks['duplicate_verts']} 個重複頂點（位置相同但沒有合併）")
    if checks["degenerate_faces"] > 0:
        fail("degenerate_faces", f"{checks['degenerate_faces']} 個退化面（面積或邊長接近 0）")
    if checks["loose_verts"] + checks["loose_edges"] > 0:
        fail("loose", f"{checks['loose_verts']} 個孤立頂點、{checks['loose_edges']} 條孤立邊")

    if checks["non_manifold_edges"] > 0:
        fail("non_manifold_edges", f"{checks['non_manifold_edges']} 條邊接了 3 個以上的面")

    if not rule["allow_boundary"] and checks["boundary_edges"] > 0:
        fail("boundary_edges", f"{checks['boundary_edges']} 條開放邊界，此類型要求封閉")

    expected = rule["components"]
    if expected is not None and checks["components"] != expected:
        fail(
            "components",
            f"有 {checks['components']} 個幾何島，預期 {expected} 個"
            f"（合併重複頂點後 {checks['components_after_merge']} 個）",
        )

    if rule["normals"]:
        if checks["inconsistent_normal_edges"] > 0:
            fail("normals", f"{checks['inconsistent_normal_edges']} 條邊兩側的法線方向不一致")
        if checks["flipped_faces"]:
            fail("normals", f"{checks['flipped_faces']} 個面的法線朝內")

    if checks["ngons"] > 0 and rule["ngon"] == "warn":
        warn("ngons", f"{checks['ngons']} 個 ngon（5 邊以上的面）")

    if checks["has_modifiers"]:
        warn("modifiers", "物件有未套用的 modifier，檢查的是套用後的結果")

    levels = {issue["level"] for issue in issues}
    status = "fail" if "fail" in levels else "warn" if "warn" in levels else "pass"
    return {"profile": profile_name, "status": status, "issues": issues, "checks": checks}


def summarize(report):
    """把 fail 項目串成一行文字，放進 errors 的 message。"""
    fails = [issue["message"] for issue in report["issues"] if issue["level"] == "fail"]
    return f"[{report['profile']}] " + "；".join(fails)
