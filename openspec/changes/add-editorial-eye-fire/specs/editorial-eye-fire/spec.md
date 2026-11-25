## ADDED Requirements

### Requirement: Iris alignment
The editorial portrait SHALL move only the iris layer inside a fixed eye-socket mask, with the iris anchored at its measured pixel center so the resting image matches the source photo.

#### Scenario: Looking sideways
- **WHEN** the pointer is at the far left of the stage
- **THEN** both irises shift left inside their sockets and are clipped by the eyelids, with no duplicate iris left behind

### Requirement: Dwell to fire
The page SHALL fire flames from both eyes toward the pointer after it rests anywhere on the page for 3 seconds, with the eyes glowing red during the last second.

#### Scenario: Small jitter
- **WHEN** the pointer moves by 6 pixels or less while resting
- **THEN** the dwell timer is not reset

#### Scenario: Reduced motion
- **WHEN** the user prefers reduced motion
- **THEN** no flames are fired

### Requirement: Burning the page
The landing point SHALL burn an irregular, growing hole through the whole page (headline, text and portrait alike) with glowing embers and charred edges, without blocking pointer interaction; burns remain after the pointer moves and are cleared on double click.

#### Scenario: Burning the headline
- **WHEN** the pointer rests on the page headline for 3 seconds
- **THEN** flames fly from both eyes to the headline and the headline is burned away while links underneath remain clickable

#### Scenario: Restore
- **WHEN** the user double-clicks the stage
- **THEN** all burns are removed

### Requirement: Continuous burning
Once fired, the flames SHALL keep burning and follow the pointer, burning a trail along its path and growing the burn while the pointer rests; a single click stops the fire without activating what was clicked.

#### Scenario: Dragging the fire
- **WHEN** the pointer moves while firing
- **THEN** the flames follow it and leave a continuous, irregular burn trail

#### Scenario: Click to stop
- **WHEN** the user clicks a link while firing
- **THEN** the fire stops and the page does not navigate

### Requirement: Self-spreading fire
When the fire is stopped while burned area covers more than 10% of the viewport, the burn SHALL keep spreading on its own with a visible flame front until the whole page is burned; a double click restores the page and stops the spread.

#### Scenario: Small burn
- **WHEN** the fire is stopped with about 1% of the viewport burned
- **THEN** the burn does not spread

#### Scenario: Large burn
- **WHEN** the fire is stopped with about 12% of the viewport burned
- **THEN** the burn starts spreading within a second and covers the whole page in under a minute

### Requirement: Hold to fire laser eyes
The laser eyes SHALL fire only after the primary button is held for 3 seconds, keep firing and follow the pointer while the button stays pressed, and stop as soon as it is released; on release the self-spreading rule is evaluated immediately.

#### Scenario: Short press
- **WHEN** the button is released after 1.5 seconds
- **THEN** nothing is fired

#### Scenario: Release on a link
- **WHEN** the user holds on a link for 3 seconds and releases
- **THEN** the lasers stop and the page does not navigate
