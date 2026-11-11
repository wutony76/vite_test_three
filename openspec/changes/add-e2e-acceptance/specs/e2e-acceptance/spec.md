## ADDED Requirements

### Requirement: One-command acceptance
`tools/blender/tests/e2e.py` SHALL run unit tests, the headless suite, Test A and Test B builds with exports to a temporary directory, Three.js checks, and evaluate every Test A and Test B acceptance criterion, exiting non-zero when any criterion fails.

#### Scenario: Full run
- **WHEN** `python3 tools/blender/tests/e2e.py` runs on the current repository
- **THEN** every criterion is reported with its measured value and the exit code is 0

#### Scenario: Tightened threshold
- **WHEN** it runs with a silhouette threshold of 0.99
- **THEN** the Test A proportion criterion fails and the exit code is non-zero
