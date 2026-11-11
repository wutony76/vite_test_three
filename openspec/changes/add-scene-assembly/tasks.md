# Tasks

- [x] schema：ScenePlan 的 materials、terrain.material／params、roads[].material、export.path
- [x] `scene/terrain.py`（純 Python）+ `tests/test_scene_terrain.py`
- [x] `scene/assembly.py`、`qa/scene.py`、`api.build_scene_from_plan`（Scene QA 整合在組裝流程，不另外提供 validate_scene）
- [x] glTF 匯出支援 gpu instancing
- [x] `scripts/build_scene.py`（組裝、匯出、俯視與 3/4 預覽）
- [x] 重新配置 `sample_town.scene.json`（2 店面 + 2 石屋 + 8 樹，建築面向道路）
- [x] 組裝、Scene QA、匯出；`tests/threejs_scene_check.mjs`
- [x] `tests/test_scene.py`；修正資產庫隱藏後重建資產失敗的問題；完整回歸（147 passed）、`npm run build`
- [x] 文件：README、WORKFLOW、Architecture、模型 README、validation、Engineering Evidence
