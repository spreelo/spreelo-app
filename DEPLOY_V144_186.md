# Deploy Spreelo v144.186

This package was built directly from `spreelo-144.183-RECURRING-CREDIT-PAUSE-AUTO-RESUME-FINAL.zip`.

## Existing v144.183 database

1. In Supabase SQL Editor, run `spreelo-v144.186-SQL.sql` once.
2. Deploy the v144.186 application package.
3. Sign in as the primary admin and verify `/admin/team`.
4. Send one test admin invitation to a non-admin address, accept it with the exact invited account and verify `/admin` access.
5. Revoke that test admin and verify `/admin` becomes unavailable.
6. Open AI Content Studio with `johan@foldern.com`; verify the smart onboarding popup appears on a normal opening.
7. Verify the popup does not appear when opening a campaign handoff or a `?plan=...` direct plan link.
8. Verify Activate starter plan creates a normal plan and the popup closes.

## Fresh database handoff

If the v144.183 consolidated schema has not been applied, use `spreelo-v144.186-CONSOLIDATED-SQL.sql` instead of separately applying v144.183 and v144.186.

## Required environment variables

Existing variables remain in use:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (optional fallback exists)
- `NEXT_PUBLIC_APP_URL` or `APP_URL`
- `SPREELO_PRIMARY_ADMIN_EMAIL` (defaults to `johan@foldern.com`)
- `SPREELO_ADMIN_EMAILS` (optional configured additional admins)
- `OPENAI_API_KEY` (optional for background refinement; deterministic onboarding fallback still works without it)
- `CONTENT_PLAN_MODEL` (optional; defaults to current planning model)
