# Spreelo Admin

Admin access is controlled by server-side environment variables:

- `SPREELO_ADMIN_EMAILS`
- `SPREELO_ADMIN_USER_IDS`

The sidebar shows **Admin** only after `/api/admin/me` confirms access.

## Required SQL

Run these files in Supabase SQL Editor:

1. `supabase/video_background_library.sql`
2. `supabase/admin_dashboard_credit_adjustments.sql`

## Admin pages

- `/admin` — overview and protected tools
- `/admin/credits` — audited manual credit adjustments
- `/video-backgrounds` — shared 9:16 background library

The credit API uses the service role on the server. Browser clients cannot call the adjustment RPC directly because execute permission is restricted to `service_role`.
