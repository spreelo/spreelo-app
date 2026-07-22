# Deploy V111 — exact review glass transparency

## Updated
- The primary cards on **Granska och godkänn** now use the exact active glass values from the `Planinställningar` tiles in **AI Innehållsstudio**:
  - identical translucent gradient
  - identical white border opacity
  - identical shadows
  - identical blur and saturation
  - identical inset highlight
- The metadata group no longer stacks two normal glass fills on top of each other. Its wrapper is now deliberately much clearer, while each of the three metadata tiles uses the exact Planinställningar recipe.
- Functional controls such as the Facebook preview and text editor remain readable and opaque; the surrounding card surfaces are transparent glass.

## Deployment
- CSS-only update.
- No SQL changes.
