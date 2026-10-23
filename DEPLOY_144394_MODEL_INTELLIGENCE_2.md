# Spreelo 144.394 – AI Model Intelligence 2.0 + 144.393 weekly planning

## Important: 144.393 was NOT installed

This package is **cumulative from 144.392**. Do **not** first deploy 144.393. Use the single SQL file `Spreelo-144.394-Supabase-KOMBINERAD.sql` and one GitHub deploy of version 144.394.

## Install order

1. Confirm your local GitHub Desktop working tree corresponds to deployed **144.392** and has no unsaved local changes.
2. Back up the Supabase project as appropriate. Run the *combined* SQL in Supabase SQL Editor; it contains the 144.393 weekly planner tables/RPC plus the 144.394 shutdown notice table. Running both old separate SQL files is unnecessary.
3. Extract the **cumulative PATCH FROM 144.392** ZIP into your local repository root, preserving relative paths. The ZIP has a single version-named top-level directory; copy the files **inside** that directory to your repo root.
4. Review the change list in GitHub Desktop, commit and push; confirm Vercel Production Ready.
5. Ensure **Automatiska AI-bevakningar** is enabled in AI Control Center. The pre-existing daily `ai-model-discovery` and `ai-model-intelligence` cron jobs use existing credentials. No new secrets required.
6. After the next successful daily model intelligence run, verify price comparisons, recommendation cards, and `gpt-4.1-mini` retirement warnings. SQL table `public.ai_model_shutdown_notices` contains only confirmed dated announcements from OpenAI's official documentation.
7. For 144.393 variation changes, verify `public.weekly_variation_plan_runs` after local Sunday night. Variation jobs do not call GPT-5.5 and must preserve manually edited posts/dates.

## AI intelligence changes

- Officially priced **new discovered models** enter price checks, not only already selected models; candidate checks are bounded (maximum 14 official model pages per day). No extra paid OpenAI generation is done by the price checker.
- Recommendations high on the AI Control Center page name **Spreelo functions**, current and proposed model, separate input/output rates, and status of technical verification. Estimates assume equal token quantities and exclude tools/images/video/cache.
- Candidates for reasoning work prioritize GPT-6.1 Sol; high-volume text and vision prioritize GPT-6 Luna. Further verified newly discovered candidates can compete. The recommendation is to **test**, never an assertion of higher creative quality or actual cost savings per post.
- Announced shutdown dates are extracted from rows in the official OpenAI API deprecations documentation, persisted in an admin-only table, shown on the specific affected model selector, and emailed at escalations (90/30/14/7 days) when background monitoring is enabled. A temporary documentation failure does not clear the last confirmed date.
- New reasoning models receive a bounded low-reasoning smoke-test output allowance, avoiding false technical failure when tokens are spent on invisible reasoning.
- No automatic model switch, no new customer-credit charges, no change to image/video engines.

## Limitations

- Live OpenAI documentation and real admin-model tests require an installed deployment and working provider credentials. Here, offline parsing, module integrity and simulated cases were tested; no production OpenAI API calls were made.
- Some configured purposes (e.g. direct manual authoring, campaign planning) do not have a full admin comparison-test recipe. These show an evaluation/selection path but should be manually checked before activation; only existing testable purposes can run the admin brand test automatically.
- If official pricing can't be parsed, the comparison is not presented as a verified saving. If official shutdown dates cannot be parsed, the daily intelligence check stays retryable; it never fabricates a shutdown date.

## Rollback

Re-deploy 144.392 (while preserving local work separately). Additive SQL can remain installed but unused. Previously selected models are unchanged by this update.
