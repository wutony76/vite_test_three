## ADDED Requirements

### Requirement: Compressed GLB with manifest
Exports SHALL use `EXT_meshopt_compression` when `export.compress` is true and SHALL write a manifest listing the root, clickable nodes, animation groups, stats and QA status, whose node names all exist in the GLB.

#### Scenario: Test A export
- **WHEN** `test01_shop` is exported
- **THEN** the GLB declares `EXT_meshopt_compression`, is smaller than the uncompressed export, and its manifest lists the door as clickable

### Requirement: Scene lights and props
A ScenePlan SHALL be able to declare lights that are written to the scene manifest, and the sample town SHALL include props in the Props group.

#### Scenario: Sample town manifest
- **WHEN** `sample_town` is exported
- **THEN** its manifest contains a sun and a hemisphere light and the Props group contains placed props

### Requirement: Headless MCP server
The `lowpoly` MCP server SHALL expose list, validate, build asset, build scene and run tests tools, executing Blender work in a background subprocess.

#### Scenario: Smoke test
- **WHEN** a stdio MCP client starts the server and calls `lowpoly_validate_plan` and `lowpoly_build_asset`
- **THEN** both calls return results with `ok: true`
