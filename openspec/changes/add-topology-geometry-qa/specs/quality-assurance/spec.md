## ADDED Requirements

### Requirement: Profile limits
Every validation profile SHALL define `max_components`, `max_tris`, `self_intersection`, `bevel` and `wobble`, and the validator SHALL fail a mesh that exceeds its island or triangle limit.

#### Scenario: Too many decoration islands
- **WHEN** nine separate cubes are validated with `decoration`
- **THEN** the result fails on `components`

### Requirement: Self-intersection detection
The validator SHALL count intersecting face pairs that share no vertex and SHALL fail single-island profiles that have any.

#### Scenario: Crossed boxes joined into a shell
- **WHEN** two crossing boxes are joined into one mesh and validated with `building_shell`
- **THEN** `self_intersections` is greater than zero and the result fails

### Requirement: Transform sanity
The validator SHALL fail objects with negative scale and warn on non-uniform scale.

#### Scenario: Mirrored object
- **WHEN** an object has scale (-1, 1, 1)
- **THEN** the result fails on `scale`

### Requirement: Geometry QA against the plan
Geometry QA SHALL compare every built object's world bounding box with its plan bounds, and SHALL report objects that exceed the bounds beyond tolerance or float above the ground without touching another object.

#### Scenario: Built Test A passes
- **WHEN** `test01_shop` is built
- **THEN** geometry QA reports no failure

#### Scenario: Lifted pot
- **WHEN** a pot is moved 0.5 m up after building
- **THEN** geometry QA reports `FLOATING` for that pot
