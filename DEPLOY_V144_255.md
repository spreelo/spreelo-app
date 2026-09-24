# Deploy v144.255

1. Deploy the application normally. No SQL is required.
2. Keep the Shopify Dev Dashboard settings from v144.254:
   - App URL: `https://app.spreelo.com/shopify/app`
   - Embedded app: enabled
   - Allowed redirect URL: `https://app.spreelo.com/api/shopify/callback`
3. Open **Spreelo Test Store 2 → Apps → Spreelo** in Shopify Admin.
4. Because the current Test Store 2 connection points at a brand whose stored website is Test Store 1, v144.255 should reject that stale mapping and run isolated onboarding.
5. With no existing exact Test Store 2 brand, Spreelo should create a dedicated brand using:
   - business name from Shopify (`Spreelo Test Store 2`)
   - website identity `https://spreelo-test-store-2.myshopify.com`
6. After onboarding, Spreelo should open embedded with the new Test Store 2 brand selected.

## Verification SQL
Run this after the test:

```sql
select
  sc.shop_domain,
  sc.brand_profile_id,
  bp.business_name,
  bp.website_url,
  sc.status,
  sc.install_source
from shopify_connections sc
left join brand_profiles bp on bp.id = sc.brand_profile_id
where sc.shop_domain in (
  'spreelo-test-store.myshopify.com',
  'spreelo-test-store-2.myshopify.com'
)
order by sc.shop_domain;
```

For Test Store 2, `website_url` should now be `https://spreelo-test-store-2.myshopify.com` and the selected `brand_profile_id` should be the dedicated Test Store 2 brand.
