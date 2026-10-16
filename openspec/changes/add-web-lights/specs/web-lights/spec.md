## ADDED Requirements

### Requirement: Scroll-driven light sections
The lights page SHALL light a central sculpture with a different light type per section (cursor point light, RGB point lights, spotlight with beam and shadows, rect area light, emissive neon with bloom) and SHALL cross-fade light weights according to the scroll position.

#### Scenario: Between sections
- **WHEN** the page is scrolled to 1.5 viewport heights
- **THEN** the RGB and spotlight weights are both 0.5

### Requirement: Pointer-controlled lights
The section's light SHALL follow the pointer: the cursor light moves with it, the spotlight aims where it points, the area light panel slides horizontally and the RGB orbit speed follows the horizontal position.

#### Scenario: Click changes colour
- **WHEN** the user clicks outside links and buttons
- **THEN** the current section's main light switches to its next colour

### Requirement: Accessibility and fallbacks
The page SHALL apply weights instantly under reduced motion, disable shadows on small screens and keep the content readable without WebGL.

#### Scenario: Reduced motion
- **WHEN** the user prefers reduced motion and scrolls to the spotlight section
- **THEN** the spotlight weight is 1 immediately
