## ADDED Requirements

### Requirement: Scene-wide colour grade
The world scene SHALL apply a shared colour grade to every lit built-in material: dark areas are lifted toward a shared shadow colour and the final colour is blended toward a shared tint colour, both adjustable at runtime without recompiling shaders.

#### Scenario: Toggle off
- **WHEN** the user unchecks「啟用」in the「畫面風格統一」panel
- **THEN** every graded material renders exactly as before the grade, without reloading the page

### Requirement: Realistic texture softening
Materials whose base colour map uses linear filtering SHALL have their texture saturation and contrast reduced by adjustable factors; materials with nearest-filtered colour-block atlases SHALL NOT be softened.

#### Scenario: Colour-block atlas untouched
- **WHEN** the grade is enabled
- **THEN** the Gamehall atlas (nearest-filtered) keeps its original texture colours before lighting

### Requirement: Exclusions
Emissive glow materials (`toneMapped: false`), custom ShaderMaterials, the floating island and the egg sun SHALL NOT be graded.

#### Scenario: Campfire flame
- **WHEN** the grade is enabled
- **THEN** the campfire flame colours are unchanged
