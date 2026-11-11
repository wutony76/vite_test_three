## ADDED Requirements

### Requirement: Observed and inferred facts are separated
Every fact node in a ReferenceSpec or AssetPlan SHALL declare `source` as `observed` or `inferred` and a `confidence` between 0 and 1, and an `inferred` node SHALL include a non-empty `assumption`.

#### Scenario: Inferred component without assumption
- **WHEN** an AssetPlan contains a component with `source: "inferred"` and no `assumption`
- **THEN** `validate_plan` returns `ok=False` with code `PLAN_INFERRED_NO_ASSUMPTION` and the path of that component

#### Scenario: Inferred ratio is reported
- **WHEN** a valid AssetPlan is validated
- **THEN** the report contains `inferred_ratio` and a warning when it exceeds 0.4

### Requirement: Asset plan validation
The validator SHALL check an AssetPlan for unique component ids, resolvable references (`parent`, `union_into`, `openings`, `clickable`, `anim_groups`), acyclic parents, allowed `kind`/`method`/`tier`/`profile` values, method-profile restrictions, and primary/secondary components fitting inside `dimensions` with a 5% tolerance. It SHALL collect all errors, each with a JSON path, instead of stopping at the first.

#### Scenario: Remesh on a building
- **WHEN** a component uses `method: "remesh"` with `profile: "building_shell"`
- **THEN** the result contains `PLAN_METHOD_NOT_ALLOWED`

#### Scenario: Multiple errors at once
- **WHEN** a plan has a duplicate id and a missing parent
- **THEN** the result lists both `PLAN_ID_DUPLICATE` and `PLAN_REF_MISSING`

### Requirement: Reference specification
A ReferenceSpec SHALL store component boxes and silhouette points in normalized image coordinates (0–1, origin top-left), a view type, a scale anchor that names an existing component, a palette, and an explicit list of excluded elements.

#### Scenario: Test A reference
- **WHEN** `tools/blender/plans/test01.reference.json` is validated
- **THEN** it passes, its view type is `front_ortho`, and its scale anchor is the door

### Requirement: Scene plan validation
The validator SHALL check that every placement refers to a declared asset, that budgets are positive and within the desktop limits (300k triangles, 300 draw calls), and that the hierarchy groups are named.

#### Scenario: Unknown asset in placement
- **WHEN** a placement uses an `asset_id` not listed in `assets`
- **THEN** the result contains `PLAN_REF_MISSING`

### Requirement: Independent detail configuration
`DetailConfig` SHALL expose `primary_quality`, `secondary_density`, `tertiary_density`, `geometry_complexity`, `bevel_quality`, `material_quality` and `texture_quality`, resolve a preset first and then apply per-field overrides, and reject out-of-range values.

#### Scenario: Override one field
- **WHEN** a plan uses preset `game_default` with override `tertiary_density: 0.9`
- **THEN** only `tertiary_density` differs from the preset

#### Scenario: Out of range
- **WHEN** `bevel_quality` is 3
- **THEN** the result contains `PLAN_RANGE`

### Requirement: Validator runs without Blender
The plan validator SHALL NOT import `bpy` and SHALL run under a standard Python 3.10+ interpreter as well as inside Blender.

#### Scenario: Plain Python test run
- **WHEN** `python3 -m unittest` runs the plan schema tests outside Blender
- **THEN** all tests pass

### Requirement: Shared modeling workflow
Both Cursor and Claude Code SHALL load the same modeling workflow from `tools/blender/WORKFLOW.md`, and the workflow SHALL require user confirmation of the plan before any geometry is built.

#### Scenario: Claude Code modeling request
- **WHEN** the user asks Claude Code to model a Blender asset
- **THEN** the `blender-modeling` skill loads and points to `tools/blender/WORKFLOW.md`
