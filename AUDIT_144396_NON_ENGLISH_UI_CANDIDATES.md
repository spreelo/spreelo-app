# Source-language audit for Spreelo 144.396

## Scope

Static scan of `app/`, `components/`, and `lib/` JavaScript/JSX/TypeScript files for Swedish characters and likely direct visible UI strings; targeted inspection of admin pages and Grow Brain demo content. Source inspection cannot prove that every runtime user-generated string or saved database translation is in the selected language.

## Corrected in this release

- The English default labels in `lib/i18n/defaultLabels.js` remain the canonical source.
- UI translation loader + server/email loader preserve existing package translations for all non-English locales. English source changes trigger only affected keys; failed keys do not generate unbounded new OpenAI charges.
- Grow Brain demo post titles formerly hardcoded in Swedish now use English example content.
- Direct Swedish copy in the AI Control Center, OpenAI pricing, capacity overview, capacity simulator, admin shortcut labels and post-approval controls has been changed to English as the source/default presentation language. These admin-only hardcoded English strings should be moved to translation keys in a separate UI-localization project if full Finnish/German/etc admin localization is required.
- Intentional locale-specific labels in `startupUiText.js`, text/language classifiers, customer/shop data, failure-recovery messages deliberately selected by locale, and AI-generated customer post text must NOT all be rewritten to English; they are not accidental Swedish UI fallback.

## Not fully verified

- There is no end-to-end browser test against every live page in all 29 non-English languages, and the Supabase export contains counts rather than actual translation text. No claim is made that every historical Finnish package is free of mistranslated Swedish or English values.
- Some internal/admin-only email alerts and diagnostic messages retain Swedish messages. They are not part of the central application UI label system, and should be separately localized before relying on them for international admin accounts.
- To confirm no duplicate paid calls: observe `post_generation_cost_events` for OpenAI UI translation operations during repeated visits to an already-translated locale. A successful cache hit must produce no new API cost events.

## Safe rollout

No SQL migration or mass translation. Do not delete language packs. Back up the database separately from the project ZIP before production deployment. New English text revisions are translated lazily when their respective namespaces are requested.
