# v144.296

Apply the small update over v144.295, or deploy the complete ZIP. No SQL migration is required.

## Changes
- First-visit popup: Welcome to Spreelo!, explicitly described as a quick introduction and suggested first plan, separate from AI Content Creator.
- Sell more is the default for new planning and onboarding. Other goals remain available. Old onboarding/recommendation browser caches are versioned out. Existing active plans are not rewritten.
- Product post, text + ad and product video receive stronger sales weights. The safe starter sequence includes these earlier; the deterministic fallback reduces the sales-only product-category repetition penalty. AI planning guidance regularly considers product video rather than rejecting it solely for cost. Channel compatibility, verified product/service availability, recency, learning and useful editorial variety remain in place. No extra AI planning calls were added. A more video-heavy plan can consume more generation credits; the existing credit preview remains.
- AI Content Studio references are now AI Content Creator. The theme calendar is AI Theme Calendar with the current business name in a smaller, muted parenthetical line in the navigation and calendar page.
- New and renamed UI copy has canonical English source keys in defaultLabels.js, using the existing persistent ui_translation_packs mechanism. Fresh keys and browser cache version v28 prevent old stored naming from being reused. Brand names are interpolated, never translated. Existing sample-image copy is intentionally English, as requested.

## Translation verification
The English source catalog and literal translation-key integrity passed locally. No live database credentials were available: production language-pack contents were not read or changed. Missing new keys are translated and cached by the normal translation API after deployment; that service needs working OpenAI API credits. All catalogued languages use the same existing mechanism.

## Validation
- Production fallback selection test: the five-post sales mix includes product, ad and video while retaining editorial content; without available product formats it never forces one.
- All brand capability fallbacks start with Sell more.
- New welcome/menu/calendar keys and brand interpolation checked.
- Persistent i18n integrity: 4970 English source keys and 3489 literal UI keys.
- Next.js production build passed with dummy build-only credentials; no paid API calls or live posts were made.
