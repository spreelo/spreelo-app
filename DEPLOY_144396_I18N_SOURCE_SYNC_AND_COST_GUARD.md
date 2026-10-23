# Spreelo 144.396 — persistent translation protection and English-source synchronization

- Full project assembled from complete 144.395 backup; no fonts or other assets removed.
- Shared UI translations and transactional/server translations reuse persisted nonempty values across every locale.
- Source fingerprints are seeded for legacy saved values without paid translation. A key is translated again only when its English source fingerprint changes, if missing, or if an admin explicitly retries a previously failed key.
- Failed translation keys are quarantined in persistent package metadata (`deferred_keys` for UI, `failed_source_fingerprints` for server mail) until the source changes or an administrator requests targeted repair. Provider errors cannot be made completely idempotent without provider-side support.
- Partial successful translation chunks preserve existing successful labels and source fingerprints. A failed update does not mark the new English text as successfully translated.
- Admin translation update is targeted to changed/missing/failed keys, not the entire language pack.
- Swedish Grow Brain demo captions and direct hardcoded Swedish text on key admin UI pages replaced with English default/source copy. A separate audit notes remaining localization work.
- No Supabase migration required; existing `ui_translation_packs.labels` JSONB used.
- Full source audit list supplied separately; mixed-language product/content prompts, customer text, and language startup strings are intentional and should not be blanket-translated to English.

## Verification after deploy

1. Open an already translated locale several times; verify zero `ui_translations.chat.completions.create` and `server_ui_text.chat.completions.create` cost events for saved unchanged keys.
2. Modify one English default label in a test branch; verify only that changed key is submitted when the namespace is next loaded.
3. Check unfinished packs after use; old saved translations must remain intact.
4. Inspect admin language refresh for a locale with saved packs: existing valid labels should remain unchanged.

Code-level tests run without real OpenAI or production Supabase calls. Live deploy and cross-language display testing remain necessary.
