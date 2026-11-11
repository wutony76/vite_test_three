# lamp_post

小鎮的街燈（Props）。沿用 test01 路燈的造型，在 sample_town 中以 GPU instancing 擺 4 盞。燈罩屬於 `lamp_glow` 動畫群組。

- 來源 plan：`tools/blender/plans/lamp_post.plan.json`
- 132 個三角面、2 個 primitive（燈柱、發光燈罩）
- 重新產生：`build_from_plan.py -- tools/blender/plans/lamp_post.plan.json --export`（GLB 以 meshopt 壓縮，旁邊有 manifest）
