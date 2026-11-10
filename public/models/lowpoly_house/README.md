# lowpoly_house

- 來源：自製。由 `tools/blender/scripts/build_house.py` 以 `lowpoly_kit` 產生（Blender 5.2，背景模式），可重複產生
- 用途：`lowpoly_kit` 的 Phase 4 驗收模型；目前沒有頁面使用
- 匯出：glTF Binary（.glb），+Y 朝上，正面朝 +Z；單一根節點 `House_Root`；Object 帶 `userData.lowpoly_profile`
- 規模：8 個 Mesh、13 個 primitive、236 個三角面、7 個純色材質，平面著色，約 20 KB
- 拓撲：Foundation / Body / Roof（含 Union 進來的煙囪）各 1 個封閉幾何島；Door、4 扇窗為獨立 Object
