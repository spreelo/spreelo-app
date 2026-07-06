# Spreelo security patch notes

This patch hardens the uploaded `spreelo-app-main(58).zip` codebase.

## Changed files

- `app/api/cron/refresh-instagram-tokens/route.js`
  - Added `CRON_SECRET` authorization.
- `app/api/cron/cleanup-retention/route.js`
  - Changed missing `CRON_SECRET` fallback from open to closed.
- `app/api/meta/connect/route.js`
  - Added authenticated POST start flow.
  - Verifies the current Supabase user owns the selected brand before creating OAuth state.
  - No longer relies on `user_id` from the browser URL for the main flow.
- `app/api/auth/instagram/start/route.js`
  - Added authenticated POST start flow.
  - Verifies the current Supabase user owns the selected brand before creating OAuth state.
  - No longer relies on `user_id` from the browser URL for the main flow.
- `app/social-channels/page.jsx`
  - Connect buttons now start OAuth through authenticated POST requests with the current Supabase access token.
- `app/posts/[id]/page.jsx`
  - Save, approve and discard updates now include `user_id` filtering.
- `app/brand/page.jsx`
  - Brand deletion verifies brand ownership from the database before deleting related rows.
  - Known user-owned row deletes for posts, automation rules and social connections now include `user_id` filtering.
- `lib/security.js`
  - Added shared public URL validation for server-side fetches.
  - Blocks localhost, private IP ranges, link-local addresses, metadata hosts and unsupported protocols.
- `app/api/analyze-brand/brandAnalysisEngine.js`
  - Website fetch now validates URL with `assertPublicHttpUrl()`.
- `app/api/analyze-brand/route.js`
  - Website fetch now validates URL with `assertPublicHttpUrl()`.
- `app/api/cron/run-automations/route.js`
  - Website/product/image fetches now validate URLs with `assertPublicHttpUrl()` where applicable.
- `app/api/ui-translations/route.js`
  - Namespaces are now whitelisted and capped to reduce abuse/cost risk.

## Still required outside the zip

- Confirm `CRON_SECRET` exists in Vercel Production/Preview environments.
- Confirm Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
- Confirm Supabase RLS is enabled and correct for all customer data tables.
- Run a normal deploy/build and test Facebook + Instagram reconnect.
