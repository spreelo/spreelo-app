# Spreelo product resolver v9

V9 fixes a discovery-state regression found by a real Halloween carousel test.

## Root cause

The shared theme cache could contain `exhausted = true` from an earlier resolver
run while containing zero usable verified products. V8 trusted that marker for
seven days and skipped native store search, domain Web Search and bounded
catalog discovery. The rule therefore failed before product relevance ranking,
even when its campaign terms were correct and the store had matching products.

## Fix

- Legacy exhausted markers never suppress V9 discovery.
- A V9 exhausted marker is trusted only when at least five usable verified
  candidates already exist in the current theme pool.
- Empty or incomplete caches always trigger live discovery.
- Product/search page fetches try the browser profile, hostname variant and
  declared crawler fallback only when earlier attempts fail, within a shared
  24-second request budget.
- Failure logs now report cache counts, discovery-state version, whether an old
  exhausted state was ignored, completed discovery sources, raw verified count
  and final candidate-pool count.
- Cache and discovery-state rows written by this version use `v9`.

The fix is platform-neutral and contains no Pressit-specific URL, product,
category or domain rule.

## Deployment

No new SQL migration is needed if the two v7 migrations were already run:

1. `supabase/campaign_product_candidates.sql`
2. `supabase/website_product_capabilities_v7.sql`

Deploy the application and rerun the failed carousel. The old database state
does not need to be deleted manually; V9 ignores it until it has rebuilt a
complete verified pool.

Run the regression suite with:

```bash
npm run test:resolver-v9
```
