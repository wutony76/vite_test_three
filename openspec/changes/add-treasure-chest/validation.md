# Validation

## 結果：通過

| 項目 | 結果 |
|---|---|
| validate_plan | `ok: True`（提醒：HIGH_INFERRED_RATIO，沒有參考圖） |
| 拓撲 | body、lid 是 building_shell 1 島；bands 是 trim 8 島；lock 是 decoration 2 島；全部 0 非流形 |
| Geometry QA | pass |
| Texture QA | warn：FLAT_RATIO，刻意使用純色 low poly |
| 預算 | 三角面 448 / 2500；primitive 4 / 10；GLB 約 24 KB |
| Three.js plan check | ALL PASS |
| test_shapes | 23 / 23，含新增的 `test_treasure_chest_parts_are_closed` |
| 瀏覽器 | 13 個漢堡都有建立，堆滿箱子並滿出來，一個卡在箱口、兩個在地上；看得到閃光；console 沒有 error（`assets/treasure-chest-*.png`） |
| `npm run build` | 通過 |
