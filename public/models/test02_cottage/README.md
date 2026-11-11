# test02_cottage

Test B 的第二種建築：依 `tools/img/test02.jpg`（水彩童話石屋）建立的 Low Poly 塔樓小屋。

- 來源 plan：`tools/blender/plans/test02_cottage.plan.json`
- 參考圖分析：`tools/blender/plans/test02.reference.json`（帶俯角的圖，以正面正交近似）
- 重新產生：

  ```bash
  Blender --background --factory-startup --python-exit-code 1 \
    --python tools/blender/scripts/build_from_plan.py -- tools/blender/plans/test02_cottage.plan.json --export
  ```

- 根節點 `test02_cottage_Root`；20 個 Object、3,644 個三角面、20 個 primitive（atlas + glass 兩個材質）
- 比例：以門高 1.8 m 換算，含煙囪約 11 m 高
- 可點擊：`door`、`porch_wall`
- Visual QA：輪廓 IoU 0.937、元件位置 IoU 平均 0.889
- 檢查：`node tools/blender/tests/threejs_plan_check.mjs tools/blender/plans/test02_cottage.plan.json`
