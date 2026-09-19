# DEPLOY_V144_212 — Grow Brain step 1

## 1. Apply the database migration first
Run the SQL in Supabase:

- `supabase/v144_212_grow_brain_brand_learning.sql`

The same SQL is also available at the zip root as:

- `spreelo-v144.212-SQL.sql`

The app is intentionally fail-open if the migration is temporarily missing, so approvals and rejections keep working, but Grow Brain will not retain learning until the tables exist.

## 2. Deploy the application
Deploy the updated app normally after the SQL migration.

## 3. What starts happening automatically
- Every customer approval records one brand-learning event.
- Every customer rejection records the structured reason plus the customer's correction text.
- A per-brand profile is rebuilt from the raw event history.
- After at least three decisions for a content type, small confidence-gated preference adjustments can influence planning.
- Recent explicit rejection feedback can guide future generated copy immediately when relevant.
- Recurring weekly plans use the same cautious preference adjustment while keeping goal fit, recency, channel compatibility and product/service safety dominant.

## Verification
Included regression checks:

- `npm run test:v144.212`
- `npm run test:v144.182`
- `npm run test:v144.04`
- `npm run test:v144.05`
