## ADDED Requirements

### Requirement: Scroll-driven particle morphing
The web sample SHALL render a single particle system that morphs between sphere, torus knot, wave and text shapes according to the scroll position, including intermediate states between sections.

#### Scenario: Between sections
- **WHEN** the page is scrolled to 1.5 viewport heights
- **THEN** the morph value is 1.5 (halfway from torus knot to wave)

### Requirement: Pointer interaction
The particles SHALL be pushed away from the pointer while it moves, return when it rests, and show an expanding ripple where the user clicks outside links and buttons.

#### Scenario: Click on a button
- **WHEN** the user clicks the start button
- **THEN** the page scrolls to the next section and no ripple is triggered

### Requirement: Section navigation
The page SHALL provide navigation dots and a scroll progress bar that reflect the current section.

#### Scenario: Reduced motion
- **WHEN** the user prefers reduced motion
- **THEN** morphing is applied instantly, panels are visible without animation and clicks do not create ripples
