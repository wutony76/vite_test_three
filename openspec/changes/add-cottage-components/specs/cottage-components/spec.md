## ADDED Requirements

### Requirement: Tiled roofs as single shells
`roof_hip` and `roof_gable` builders SHALL produce one closed component each, expressing roof tiles as stepped courses on the roof surface instead of individual tile objects.

#### Scenario: Hip roof courses
- **WHEN** a `roof_hip` with `courses: 6` is built
- **THEN** it is one closed manifold island whose side profile has six outward steps

### Requirement: Multi-part props within island caps
`rock_pile`, `bush`, `lantern`, `bucket` and `gable_trim` builders SHALL build each part as a closed island and SHALL stay within the island cap of their profile.

#### Scenario: Stone pile
- **WHEN** a `rock_pile` with `stones: 7` is built
- **THEN** it has at most 8 closed islands that fill the component bounds

### Requirement: Second Test B building
The `test02_cottage` plan SHALL build with every object passing its profile, no geometry QA failure, and within its triangle and primitive budget.

#### Scenario: Build the cottage
- **WHEN** `test02_cottage.plan.json` is built with `game_default`
- **THEN** the chimney is merged into the main roof and the result has at most 6000 triangles and 32 primitives
