# Spreelo v144.257 — Shopify App Pricing setup

This release adds the bridge between Shopify App Pricing and Spreelo's existing plan/credit system.

## What is shared with direct Spreelo billing

- Starter: 150 monthly credits
- Growth: 450 monthly credits
- Pro: 1000 monthly credits
- Existing Spreelo entitlements/limits continue to read the same `user_credit_balances` row.
- Direct customers continue to use Stripe.
- Shopify App Store installations use Shopify App Pricing.

## Before enabling pricing

1. Deploy v144.257 to Vercel.
2. Run `spreelo-v144.257-SQL.sql` in Supabase SQL Editor.
3. Add these Vercel environment variables:
   - `SHOPIFY_PARTNER_ORG_ID`
   - `SHOPIFY_PARTNER_API_ACCESS_TOKEN`
   - optional `SHOPIFY_PARTNER_API_VERSION` (defaults to `2026-07`)

The app ID and app handle are discovered automatically from the authenticated Shopify installation and stored on `shopify_connections`. Emergency overrides are supported but normally unnecessary:
- `SHOPIFY_PARTNER_APP_ID`
- `SHOPIFY_APP_HANDLE`

The Partner API client must have **Manage apps** permission.

## Recommended Shopify App Pricing plan handles

Use these exact handles when creating the public plans in Partner Dashboard:

| Plan | Handle | Monthly | Yearly | Spreelo monthly credits |
| --- | --- | ---: | ---: | ---: |
| Starter | `starter` | 299 SEK | 2990 SEK | 150 |
| Growth | `growth` | 599 SEK | 5990 SEK | 450 |
| Pro | `pro` | 999 SEK | 9990 SEK | 1000 |

If another plan handle must be used, set the corresponding optional Vercel env var:
- `SHOPIFY_PLAN_HANDLE_STARTER`
- `SHOPIFY_PLAN_HANDLE_GROWTH`
- `SHOPIFY_PLAN_HANDLE_PRO`

Do not configure a second Shopify free trial initially. Spreelo already has its own free-trial lifecycle and double trial systems would be confusing.

For each Shopify paid plan, set the **Welcome link** to:

`/shopify/app`

Shopify appends `plan_handle`. Spreelo then authenticates the embedded session, verifies the actual active subscription against the Partner API, and synchronizes the verified plan into Spreelo.

## Security behavior

- The `plan_handle` redirect parameter is never trusted for entitlements by itself.
- Spreelo only grants paid plan access from the Partner API `activeSubscription` response.
- If a direct Stripe subscription already exists on the same Spreelo account, Shopify billing is blocked from changing entitlements until the provider conflict is resolved. This avoids accidental double billing.
- Shopify App Store customers are not offered Stripe checkout or Stripe credit packs inside the Shopify billing experience.

## Subscription lifecycle

Spreelo synchronizes Shopify billing:

- immediately after a Shopify plan welcome redirect;
- when the billing settings page loads;
- hourly through `/api/cron/sync-shopify-billing` as a lifecycle safety net.

Since Shopify App Pricing no longer emits subscription update webhooks after April 28, 2026, the Partner API is the source of truth for cancellations, freezes, expirations, pending changes, and the active plan.

For annual Shopify subscriptions, Shopify charges yearly while Spreelo plan credits continue to refresh monthly through the existing annual-credit cron.

## Extra credit packs

Extra credit packs remain available only to direct/Stripe customers in v144.257. They are intentionally hidden for Shopify App Store billing until a Shopify-native usage/extra-credit model is chosen.

## Testing

Development stores owned by the same Partner organization can test eligible Shopify App Pricing plans without a real charge. After Partner pricing is configured, test:

1. No paid plan → Spreelo remains Free.
2. Select Starter → 150 plan credits and Starter entitlements.
3. Upgrade Starter → Growth → only the positive in-cycle allowance delta is granted.
4. Schedule a downgrade → Spreelo retains the active plan until Shopify's pending update becomes effective.
5. Monthly renewal → new monthly plan allowance, purchased credits preserved.
6. Annual plan → yearly Shopify billing with monthly Spreelo credit refresh.
7. Cancel/expire → Spreelo returns to Free and recurring schedules pause.
8. Direct Stripe account + Shopify App Store install → provider-conflict warning; no second checkout path is exposed.
