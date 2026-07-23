# Deploy V124 – Campaign quality and readable glass label

## Included

- Keeps the 600-second Vercel function limit from V123.
- Expands campaign search vocabulary dynamically with the fast OpenAI research model.
  - No fixed holiday or language keyword list.
  - Produces direct theme words, local synonyms, likely website-language variants, product match terms and semantic avoid terms.
  - Persists the improved vocabulary on the automation rule when possible.
- Prevents unrelated catalog products from entering a strong locked store-search pool.
- Requires catalog fallback candidates to receive product-level AI campaign evaluation before they can be mixed into campaign selection.
- Recalculates current campaign fit instead of preserving stale derived catalog scores.
- Revalidates already-selected products before the final delivery ladder.
- Makes the product label larger and readable in email/app thumbnails.
- Uses a semi-transparent glass-style label with product title even when price is missing.
- Replaces font-dependent emoji symbols with SVG paths for predictable rendering.
- Keeps the individual background selection per product and keeps the AI-generated outro unchanged.
- Price extraction behavior is intentionally unchanged.

## Deployment

No SQL or Supabase Storage changes are required.

Deploy the project normally through GitHub/Vercel, then start a new campaign carousel run. Existing generated slides are not rebuilt automatically.

## Validation performed

- `node --check` passed for the cron route, campaign planner and brand analysis engine.
- Product Engine V2 tests passed.
- Store Map agent tests passed.
- Polite retrieval/no-reuse tests passed.
- Store Map early-exit tests passed.
- Candidate diagnostics tests passed.
- Progressive campaign pool tests passed.
- V123 campaign search/timeout tests passed.
- New V124 campaign vocabulary, catalog gating and glass-label tests passed.

A full Next.js build could not be completed in the isolated workspace because dependency installation timed out. Vercel should perform the final production build during deployment.
