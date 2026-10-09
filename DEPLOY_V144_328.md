# Spreelo v144.328 — AI Control Center verified catalog

Based on reviewed v144.327. **No production model values, prompts, credit accounting, Shopify research or Shotstack generation were changed.**

## Installation
1. First install on staging.
2. Run `supabase/v144_328_INSTALL_AI_CONTROL_ALL.sql` once. It is additive and contains v323–v328; existing `ai_model_settings` values are preserved (`ON CONFLICT DO NOTHING`). This assumes the earlier Spreelo admin test and team migrations already exist.
3. Deploy the ZIP. The existing Vercel daily cron `/api/cron/ai-model-discovery` is retained.
4. In Admin → AI Control Center, click **Synka** after the daily discovery has run. This button refreshes the UI; it does not run paid provider tests.
5. Verify a text model, an image model and a v327 admin test in staging before production.

## Behavior and limits
- Provider OpenAI list: queries `GET /v1/models` and records new GPT IDs as `pending_review`.
- Unattended compatibility probes: up to **2 untested text models and 1 untested image model per cron execution**. Text probes call Responses to verify text, optional low-reasoning and optional vision image input. Image probe requests one low-quality transparent PNG and inspects the actual alpha pixels via Sharp. A failing probe leaves the candidate **pending**; a successful probe adds only the capabilities truly observed. No failed model is retried automatically, to bound costs. Admins may press **Testa igen** on a pending OpenAI candidate; it requires confirmation, makes an additional billable probe, and enforces a ten-minute cooldown. Real vendor API charges apply.
- This verifies technical smoke-test compatibility, **not** artistic quality, production suitability, cost or reliability under load. For quality, use the existing optional admin model test before switching.
- Approved capabilities populate matching dropdowns. Actual selection is validated against the catalog again server-side; it is never enough to edit the UI.
- The original v322/325 model list remains a backwards-compatible fallback. No active model is ever swapped automatically.
- Kling has no confirmed compatible account-scoped model-list endpoint. The cron attempts to extract exact `kling-*` identifiers from official Kling public documentation and records them as **pending candidates**. This is not proof of account access or image-to-video capability, and it never auto-approves Kling models. Newly discovered candidates appear as **test-only** under AI-video; a complete real admin video test and explicit approval (after result email) are required before they are marked as verified and made active. Existing verified Kling model choices are retained. If the documentation is unavailable or contains no literal model IDs, discovery reports this limitation.
- Models missing from an OpenAI live list are marked **availability uncertain**, not immediately removed or replaced (list can be incomplete). The daily cron separately reports active models absent from the catalog for 7 days. Neither event triggers an automatic replacement.
- Pricing is **never fabricated**. `ai_model_pricing` stores source-backed prices when available; if empty, the UI explicitly says pricing is not verified. The cron does not scrape price pages.
- The cron is configured with `maxDuration=300`. The hosting plan must support that; if not, use cron on a worker with sufficient time. No account API keys are provided in the ZIP.
- Due to external dependencies, actual OpenAI/Kling submissions, Supabase migrations, email delivery and full Next.js build must be tested in staging.
