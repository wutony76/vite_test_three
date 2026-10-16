## ADDED Requirements

### Requirement: Drivable vehicle with physics
The drive page SHALL let the user drive a car simulated with a cannon-es RaycastVehicle, with throttle, reverse, steering, brake, boost and jump, and SHALL let the car push dynamic objects.

#### Scenario: Ramp jump
- **WHEN** the user drives onto the ramp with boost
- **THEN** the car leaves the ground

#### Scenario: Island boundary
- **WHEN** the user keeps driving outward
- **THEN** the car is stopped by the boundary walls inside the island

### Requirement: Project zones
The page SHALL show a project card when the car stops inside a zone pad and SHALL navigate to the project when the user presses Enter or the card button.

#### Scenario: Enter a zone
- **WHEN** the car is inside the 夜市燈光 pad and the user presses Enter
- **THEN** the browser navigates to `/market.html`

### Requirement: Recovery
The page SHALL warn when the car has been flipped for 2 seconds, respawn the car with R or the button, auto-respawn when it falls off, and restore all objects with the reset button.

#### Scenario: Flipped car
- **WHEN** the car stays upside down for over 2 seconds
- **THEN** a message suggests pressing R to respawn
