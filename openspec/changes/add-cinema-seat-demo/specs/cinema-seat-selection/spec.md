## ADDED Requirements

### Requirement: Seat appearance by shared state materials
The cinema demo SHALL render every seat with one of four shared materials (available, hover, selected, sold) and SHALL change a seat's appearance only by swapping its material reference.

#### Scenario: Selecting one seat does not recolor others
- **WHEN** the user clicks an available seat
- **THEN** only that seat switches to the selected material
- **AND** all other seats keep their current material

### Requirement: Seat selection rules
The demo SHALL allow toggling available seats, SHALL reject clicks on sold seats with a message, and SHALL limit a single selection to 6 seats.

#### Scenario: Clicking a sold seat
- **WHEN** the user clicks a sold seat
- **THEN** the panel shows "<seat id> 已售出" and the selection is unchanged

#### Scenario: Exceeding the limit
- **WHEN** 6 seats are selected and the user clicks another available seat
- **THEN** the panel shows "單次最多選 6 個座位" and the seat is not selected

### Requirement: Booking submission states
The demo SHALL submit the selection through an async booking call with loading, success and error states.

#### Scenario: Booking succeeds
- **WHEN** the user confirms and the call resolves
- **THEN** the selected seats become sold and a success message lists their ids

#### Scenario: Booking fails
- **WHEN** the user confirms and the call rejects
- **THEN** the selection is kept and the error message is shown
