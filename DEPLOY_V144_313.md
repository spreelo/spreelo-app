# Spreelo v144.313 – plan activation popup

Complete package based on v144.312. No SQL or environment changes required.

The standard AI Content Creator plan activation confirmation now matches the approved variant 2: branded navy header background, existing Spreelo logo, mint success check, pastel summary cards, a three-step explanation and orange Home action. Summary values still come from the saved plan. Campaign confirmations retain their existing behavior.

New asset: public/onboarding-guide/plan-activated-v313-header.webp (2048 × 683). Text, logo and controls are separate from the decorative background. English source labels use automation.planActivatedV313.* in the existing translation system.

Responsive layout: two columns on desktop/tablet, one column on phones, viewport-limited internal scrolling, light lavender backdrop with 4px blur. Close button, Escape, backdrop dismissal, focus containment and focus restoration are included. Closing the popup does not change the saved plan.

Validation: component rendered at 375, 390, 768, 1024, 1440 and 1920px, checked for horizontal content overflow and missing text/assets. Home callback, close, Escape and focus wrap verified. Production build verified. No provider calls or generation changes.
