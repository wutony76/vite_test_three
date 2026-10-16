## ADDED Requirements

### Requirement: Stall lighting with ignition
Each of the 8 stalls SHALL have a neon icon, an illuminated signboard, an LED strip with an area light and a work light, which ignite with a flicker sequence when switched on and can be toggled by clicking the stall or its console button.

#### Scenario: Click a stall
- **WHEN** the user clicks a lit stall in the scene
- **THEN** that stall's lights switch off and its console button is no longer pressed

#### Scenario: Master power off
- **WHEN** the master power is off and the user clicks a stall
- **THEN** a message "總電源已關閉，先打開總電源" is shown and nothing turns on

### Requirement: LED strip and bulb modes
The page SHALL offer LED strip modes (solid, chase, rainbow, breathe, sparkle), colours (stall colour, presets, custom), speed, and overhead bulb modes (steady, twinkle, chase).

#### Scenario: Change strip colour
- **WHEN** the user selects the blue swatch
- **THEN** all stall strips and their area lights use blue

### Requirement: Presets
The page SHALL provide presets 開市熱鬧, 派對, 微醺 and 收攤 that set power, strips, bulbs, dimmer, bloom, haze and crowd together.

#### Scenario: Close the market
- **WHEN** the user chooses 收攤
- **THEN** all stalls, bulbs and the gate turn off and the crowd is hidden
