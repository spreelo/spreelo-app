# Spreelo v144.327 – AI Model Test & Approval

**Source:** v144.326. This is a real code update, not a simulated UI.

## Installation
1. Back up database and ZIP first. Deploy to staging first.
2. If v144.102 admin mass tests and v144.186 admin team SQL were previously installed, run **`supabase/v144_327_INSTALL_AI_CONTROL_ALL.sql`** in Supabase SQL Editor. It also covers any missing v323–326 migrations. Do not separately run the smaller v327 migration when using the consolidated script.
3. Deploy ZIP. Existing `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, Supabase service role, OpenAI/Kling credentials are used unchanged.
4. The new `/api/cron/ai-model-test-results` cron runs every minute. It emails `contact@spreelo.com` only once per completed test (Resend idempotency key per request).
5. Open Admin → AI Control Center, select another verified model and click "Spara / byt". Choose test or direct save.

## Deliberately limited
- The supported **real production-worker** test purposes are post_text, product_research, editorial_headline, carousel_creative, standard_image, transparent_typography (animated post), and kling_video (Kling current API only). Other AI purposes still allow direct model changes; no misleading test button.
- Tests use ONLY brands attached to currently configured or active invited admin users that have `website_product_mode_available=true` and a URL. The selected real brand is verified again on POST.
- A single ordinary admin mass-test automation job generates the post with that admin brand. Credit charging and normal emails remain bypassed by the existing admin-test mechanism.
- Only a dedicated `ai_model_test_requests` record with matching batch and brand can override one model purpose. The worker resets the model selection before **every** job, including normal user jobs. The model settings table changes only on explicit approval or direct save.
- Results and any errors are mailed; approval/rejection happens in authenticated admin UI, not by unauthenticated email links. Model changes fail if active selection changed since the test.
- Test artifacts continue to be recorded in the existing admin mass-test/posts tables for diagnosis, like ordinary admin mass tests. The email is not an archival guarantee or immediate secure deletion.
- Does not automatically verify new providers or genuinely prove qualitative model superiority. Cost of AI generation is real even though no customer credits are charged.

## Not run here
Production build and live Supabase / OpenAI / Kling / Resend tests require your deployment's dependencies and secrets; do the first test on staging.
