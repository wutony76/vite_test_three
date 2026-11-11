## ADDED Requirements

### Requirement: Palette atlas materials
When `material_quality` is `palette` or `palette_vc` and `texture_quality` is not `none`, the build SHALL replace opaque plan materials with one shared atlas material (plus one emissive atlas material), map every face's UVs to its color cell, keep glass as separate transparent materials, and export textures with nearest sampling.

#### Scenario: Fewer primitives
- **WHEN** `test01_shop` is built with `game_default`
- **THEN** it has at most 32 primitives and the GLB contains a base color texture and a metallic-roughness texture

#### Scenario: Flat preset unchanged
- **WHEN** it is built with `preview`
- **THEN** every plan material stays a separate material and no atlas image is created

### Requirement: Vertex color variation
With `palette_vc`, the build SHALL write a deterministic per-face brightness variation and height gradient into a color attribute that is exported as `COLOR_0`.

#### Scenario: Exported vertex colors
- **WHEN** the Test A GLB is loaded in Three.js
- **THEN** atlas meshes have a color texture and `vertexColors` enabled

### Requirement: Programmatic visual QA
Visual QA SHALL compute silhouette IoU against the reference outline, per-component bounding box IoU, and color ΔE at palette sample regions for front orthographic references, SHALL fail only on silhouette or position thresholds, and SHALL restore all scene settings it changed.

#### Scenario: Test A visual check
- **WHEN** visual QA runs on the built `test01_shop`
- **THEN** silhouette IoU is at least 0.85, mean component IoU is at least 0.7, and an overlay image is written

#### Scenario: Scene settings restored
- **WHEN** visual QA finishes
- **THEN** the render engine, camera, resolution and object render visibility are the same as before
