# Spreelo v144.308 — mobile planner and portrait examples

This full release includes v144.307 and all earlier files.

Deploy the app, then run `SQL_V144_308_PORTRAIT_EXAMPLES.sql` once in Supabase
SQL Editor. It replaces only the Product post and Text + ad example image URLs.
The bundled media is shown inside a shared Facebook-style frame with a precise
4:5 media panel. The profile, caption and footer remain visible. These are
illustrative North Peak previews, not a live Facebook embed. Future admin uploads
still replace the examples using the existing image upload flow.

Example explanations now use short English source labels with new translation
keys (`automation.formatCard.<type>.summaryV308`). The existing UI translation
endpoint discovers missing keys and persists translations in the language packs.
Longer descriptions remain in the compact format selector and details.

Closing a planned-post menu restores the original row height. The date picker
renders in a body portal above later sections, with 42 dates, mobile centering,
scroll support on short screens, Escape/outside-click close, focus restoration
and keyboard focus containment. Background scrolling is locked while it is open.

Validation: production build and a Chromium harness using the actual React
components and all production CSS at 375×667, 390×844, 667×375 and 1280×900.
The harness checks expand/collapse height, last-date visibility/hit testing,
all 42 dates, Escape, 4:5 media measurements and compact explanations. No live
customer generation, paid render or production database mutation was performed.

Animations retain v144.307's 6.5% zoom, five seconds of motion and two seconds
of closing hold. Generation, product placement and delivery code are unchanged
from the full v144.307 archive.
