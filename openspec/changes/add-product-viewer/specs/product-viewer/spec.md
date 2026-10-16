## ADDED Requirements

### Requirement: Product model loading states
The product page SHALL load the product glTF model with visible loading progress, SHALL show an error state with a retry action when loading fails, and SHALL show a non-retryable message when WebGL is unavailable.

#### Scenario: Model request fails
- **WHEN** the model request returns an error
- **THEN** the page shows "3D 模型載入失敗，請檢查網路連線後重試。" and a retry button
- **AND** clicking retry loads the model and hides the overlay

### Requirement: Colour variants from KHR_materials_variants
The page SHALL switch product colours using the model's KHR_materials_variants data, SHALL reflect the selected variant in the `variant` URL parameter, and SHALL apply only the last requested variant when switching rapidly.

#### Scenario: Shareable variant link
- **WHEN** the page is opened with `?variant=beach`
- **THEN** the beach variant is shown and its swatch is pressed

#### Scenario: Unknown variant parameter
- **WHEN** the page is opened with an unknown `variant` value
- **THEN** the default variant is shown

### Requirement: Render on demand
The viewer SHALL only render frames when the view changes (interaction, damping, auto-rotate, variant change, resize or reset animation).

#### Scenario: Idle viewer
- **WHEN** auto-rotate is off and the user is not interacting
- **THEN** no new frames are rendered

### Requirement: Add to cart
The page SHALL require a size before adding to cart and SHALL show loading and success feedback.

#### Scenario: No size selected
- **WHEN** the user clicks add to cart without choosing a size
- **THEN** the page shows "請先選擇尺寸"
