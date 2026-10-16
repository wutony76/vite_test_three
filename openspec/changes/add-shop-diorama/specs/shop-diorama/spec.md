## ADDED Requirements

### Requirement: Explorable shop diorama
The diorama page SHALL render a procedurally built shop scene that the user can orbit and zoom, and SHALL show a build-in progress indicator until the scene is ready.

#### Scenario: Reduced motion
- **WHEN** the user prefers reduced motion
- **THEN** the build-in animation is skipped and the scene is ready immediately

### Requirement: Hotspot stories
The page SHALL expose 12 hotspots; hovering one SHALL show its label and outline, and clicking or tapping one SHALL open its story card, fly the camera to it and update the URL hash.

#### Scenario: Deep link
- **WHEN** the page is opened with `#cats`
- **THEN** the cats story card opens after the scene is built

#### Scenario: Dragging is not a click
- **WHEN** the user drags across a hotspot to rotate the view
- **THEN** no story card opens

#### Scenario: Keyboard
- **WHEN** the tour list or a card is open and the user presses Escape
- **THEN** the list closes first, otherwise the card closes

### Requirement: Environment toggles
The page SHALL toggle day/night and rain with smooth transitions and SHALL play synthesized ambience only after the user enables sound.

#### Scenario: Switch to day
- **WHEN** the user presses the day/night button at night
- **THEN** the scene transitions to daylight and the button label becomes "切換夜晚"
