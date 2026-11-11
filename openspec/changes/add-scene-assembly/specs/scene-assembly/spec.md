## ADDED Requirements

### Requirement: Scene assembly from a ScenePlan
`api.build_scene_from_plan` SHALL build each asset once into a hidden library, place every placement as mesh-sharing copies under its hierarchy group, generate terrain flattened under buildings and roads, and generate road strips along their polylines.

#### Scenario: Sample town
- **WHEN** `sample_town.scene.json` is built
- **THEN** the scene has one root, the declared groups, four building roots of two asset types, eight instanced tree copies, a terrain and two roads

### Requirement: Scene QA
Scene QA SHALL report overlapping buildings, buildings on roads, trees inside buildings, placements outside the terrain, buildings on unflattened ground, incomplete hierarchy, and budget overruns.

#### Scenario: Building on the road
- **WHEN** a building placement is moved onto the main street and the scene is rebuilt
- **THEN** Scene QA fails with `SCENE_ON_ROAD`

### Requirement: Instanced vegetation export
Instanced placements SHALL be exported with `EXT_mesh_gpu_instancing` while building components stay as separate named nodes.

#### Scenario: Three.js loading
- **WHEN** the scene GLB is loaded in Three.js
- **THEN** trees are `InstancedMesh` objects, every building door is a separate clickable node, and draw calls are within the scene budget
