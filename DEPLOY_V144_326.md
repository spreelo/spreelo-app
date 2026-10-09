# Spreelo v144.326 — safe OpenAI model discovery (phase 1)

Based on v144.325. No active model changes, no changes to Shotstack, prompts, or generation settings.

Before deployment, apply `supabase/v144_326_ai_model_discovery.sql` (and any earlier pending migrations in order).
Vercel cron `/api/cron/ai-model-discovery` runs daily at 03:30, protected by CRON_SECRET.
Requires OPENAI_API_KEY and Supabase service role credentials.

New OpenAI GPT model IDs are registered as `pending_review`. Discovery NEVER approves models,
changes `ai_model_settings`, or auto-replaces a production model. Missing model IDs are NOT
interpreted as retirement. Kling auto-discovery, compatibility probes, dynamic dropdown
integration, retirement workflow, and notification UI are NOT implemented in this phase.
These need provider-supported discovery and actual capability tests, particularly for alpha.
