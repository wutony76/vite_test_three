## ADDED Requirements

### Requirement: Deterministic build from plan
`api.build_asset_from_plan` SHALL build every component of a valid AssetPlan into objects under a single root empty, and building the same plan twice SHALL produce identical mesh data.

#### Scenario: Rebuild is identical
- **WHEN** `test01_shop.plan.json` is built twice in the same Blender session
- **THEN** the previous build is replaced and the vertex hash of every mesh is unchanged

### Requirement: Connected component geometry
Component builders SHALL produce closed manifold islands (except `glass_pane`) from parametric generators (`grid_slab`, `prism`, `loft`, `lathe`, `sweep`, `blob`), and SHALL NOT assemble primitives into a joined mesh for `building_shell` objects.

#### Scenario: Facade with openings
- **WHEN** the facade with three openings, the flat roof edit and the chimney union is built
- **THEN** the facade is one closed component with zero non-manifold edges

#### Scenario: Window frame with mullions
- **WHEN** a window with 2×2 panes is built
- **THEN** the frame and mullions form a single closed component

### Requirement: Detail configuration drives geometry
The build SHALL apply `bevel_quality` as bevel segments, `geometry_complexity` as round segment count, and densities to optional sub-details, and SHALL skip tertiary components only when `tertiary_density` is 0.

#### Scenario: Preview preset
- **WHEN** a plan is built with the `preview` preset
- **THEN** no bevel is applied and no tertiary component is created

### Requirement: Budget enforcement
The build SHALL report triangle and primitive counts and SHALL fail with `BUDGET_EXCEEDED` when either exceeds the plan budget.

#### Scenario: Test A budget
- **WHEN** `test01_shop` is built with `game_default`
- **THEN** it has at most 5000 triangles and at most 40 objects

### Requirement: Three.js ready export
The exported GLB SHALL have one root node, keep clickable components as separate nodes, and carry component metadata in `userData`.

#### Scenario: Raycast the door
- **WHEN** the Test A GLB is loaded with Three.js and a ray is cast from the front at door height
- **THEN** the first hit belongs to the door component
