# v144.311 – Creator initial plan and readable video advertising typography

Deploy the complete project. No new SQL or cron jobs are needed. Keep the v144.309 migration already applied.

## AI Content Creator

The first automatic draft is populated for the preselected Sell more goal after brand capabilities and connected channels have loaded. This initialization now runs independently of the welcome guide and its Don't show again preference. It uses the existing instant recommendation/cache path and background planner. It does not activate a plan, create media or call the onboarding-plan endpoint. A non-empty edited draft, saved plan, manual/select mode, direct saved-plan link or campaign entry is preserved. Initialization runs once per brand per mounted visit.

## Kling product videos

The finished-video creative planner now selects a non-interactive closing advertising line suited to the product, audience and goal. It must not imply that the video is clickable or invent a bio/caption link, shopping tag or platform feature. Closing copy can vary by context rather than repeat one label. It uses the post language.

The same planning request supplies a per-video typography direction to the existing typography image request, including hierarchy, character and restrained accents. No additional image or Kling generation stage is introduced.

Main typography uses larger scene-safe regions (520–820 pixels wide on a 1080x1920 canvas), stronger sizing and deliberate line breaks. Closing typography has a minimum 520-pixel layout region. The compositor can enlarge trimmed artwork to the intended region instead of leaving small lettering at its source size. Face, hands, distinguishing product print, logo area and social interface margins remain part of the planning constraints.

Both AI typography instructions and the deterministic closing renderer use lettering without a button, pill or navigation arrow. The deterministic fallback is simpler than the AI design. Cached finished layers and already rendered videos are not automatically changed.

## Validation

- Production build passed with dummy service credentials; no paid provider calls were made.
- Regression tests exercise the actual initialization callback for fresh/hidden-guide entry, repeated effects, loading completion, preserved edits, manual/select modes and campaign/saved-plan links.
- Pixel compositor, bounds, logo policy and cached closing-layer tests passed.
- Deterministic closing renderer verified without button rectangle or arrow.

After deployment, open the normal Creator entry with Sell more preselected and check that all draft rows appear without changing the goal. Check once with the guide visible and once with it hidden. Render one new Kling product video to verify actual creative copy, typography, motion-safe placement and customer delivery. External visual/provider output has not been validated locally; scene-safe placement remains model-driven.
