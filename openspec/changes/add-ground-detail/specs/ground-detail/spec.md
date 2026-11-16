## ADDED Requirements

### Requirement: Ground surface variation
The green ball SHALL show low-frequency light/dark patches and a top-to-bottom tint gradient, and SHALL darken softly where it meets the ketchup ribbon; each effect SHALL be adjustable and switchable at runtime.

#### Scenario: Ribbon dragged
- **WHEN** the user drags the ketchup ribbon to a new position
- **THEN** the dark band follows the ribbon in the next frame

### Requirement: Dirt paths between houses
The ball SHALL draw curved dirt paths connecting the houses and the campfire, recomputed from their current positions.

#### Scenario: House moved
- **WHEN** a house is dragged to a new place
- **THEN** within 0.5 s the paths connect to its new position

### Requirement: Grass tufts and props
The ball SHALL scatter wind-swaying grass tufts and small props (rocks, mushrooms, bushes) that do not overlap houses, food, campfire, paths or the area below the ribbon top, and that grow in after the houses finish their intro.

#### Scenario: Rescatter
- **WHEN** the user presses「重新撒」
- **THEN** tufts and props are re-placed using the current house and path positions
