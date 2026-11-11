# Tasks

- [x] gltf_export compress（EXT_meshopt_compression）；schema `export.compress`
- [x] `export/manifest.py`；資產與場景匯出時輸出 manifest（instance 物件的動畫群組記在 `instanced`）
- [x] ScenePlan `lights` schema；sample_town 加入 sun／hemisphere
- [x] `lamp_post`、`crate_pile` plans；sample_town 加入 Props（4 盞 instance 街燈、2 組木箱堆）
- [x] Three.js 檢查：MeshoptDecoder、manifest 比對、依資產比對 InstancedMesh、只檢查建築的門
- [x] 預覽渲染抽成 `qa/preview.py`
- [x] MCP server（mcp 2.x MCPServer）、`scripts/mcp_runner.py`、`.mcp.json`、`.cursor/mcp.json`、`tests/mcp_smoke.py`
- [x] 重新匯出所有 GLB；完整回歸、`npm run build`
- [x] 文件
