## ADDED Requirements

### Requirement: Connected components detection
The validator SHALL report the number of connected geometry islands in a single mesh object, both before and after merging coincident vertices, and SHALL list each island's vertex count and world bounding box.

#### Scenario: Joined primitives
- **WHEN** two non-touching cubes are joined into one object and validated
- **THEN** the report shows 2 components

#### Scenario: Existing house model
- **WHEN** `public/models/project_room/project_room.glb` is imported and `Roof` is validated
- **THEN** the report shows 18 components

### Requirement: Profile-based topology rules
The validator SHALL judge a mesh against a named profile (`building_shell`, `opening`, `glass`, `water_surface`, `decoration`, `organic`) and SHALL NOT require every mesh to be closed.

#### Scenario: Open water surface
- **WHEN** an open plane is validated with `water_surface`
- **THEN** the result passes

#### Scenario: Open building shell
- **WHEN** the same plane is validated with `building_shell`
- **THEN** the result fails because of boundary edges

### Requirement: Recoverable destructive operations
Every operation that modifies mesh data SHALL back up the original data first and SHALL restore it when the operation fails or its result fails validation.

#### Scenario: Boolean face explosion
- **WHEN** a boolean union produces more faces than the allowed ratio
- **THEN** the target mesh is restored and the result has `ok=False` with code `BOOLEAN_FACE_EXPLOSION`

### Requirement: Connected low poly building
The building preset SHALL produce a house whose foundation, body and roof are each a single closed component, with the door and windows kept as separate objects under one root.

#### Scenario: Build and export the test house
- **WHEN** the preset is built and exported with `prepare_for_gltf`
- **THEN** every mesh passes its profile and the GLB has a single root node that Three.js can load and raycast
