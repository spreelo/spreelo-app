# Spreelo v113 — Polite Product Retrieval

1. Run `supabase/v113_polite_retrieval_candidate_queue.sql` in Supabase SQL Editor.
2. Deploy the complete project.
3. Keep the existing Vercel lane/Sharp settings unchanged.
4. Test a five-product campaign carousel.

Expected logs include `Product Engine V2 focused category discovery finished` with `trustedCategoryCardCount`, and no burst of simultaneous requests. A 429 causes `Product verification paused after website rate limit`; pending candidates remain in the database and the domain enters cooldown.
