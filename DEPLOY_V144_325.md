# Spreelo v144.325 – AI Control audit patch

Based on v144.324. Run `supabase/v144_325_ai_control_audit.sql` in Supabase before deploying. Existing model selections are never overwritten.

Changes: connects manual post and campaign planning to their own admin choices (both default to their existing gpt-5.5); connects brandAnalysisEngine subcalls and automation simple-post call to their existing purpose; rejects incompatible persisted model choices at runtime and falls back to the v322 default. Shotstack, prompts, and generation settings are untouched.

Important limitations: This is a targeted static audit patch, not a proof that every AI call is routed. No full production build, live API integration or end-to-end generation tests have been completed. Model discovery, capability re-verification, automatic retirement and automatic replacement are NOT implemented here. Kling legacy API still uses its separately configured legacy model. Test on staging first.
