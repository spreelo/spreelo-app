# v144.324 – Daglig AI-marknadsbevakning

1. Installera v324 ovanpå v323. Alla existerande GPT/GPT Image/Kling-modellval lämnas orörda. Shotstack lämnas orörd.
2. Kör `supabase/v144_324_ai_market_watch.sql` i Supabase SQL Editor (v323-SQL krävs också).
3. Deploya som vanligt med befintlig `CRON_SECRET`, Supabase service-role och valfri `RESEND_API_KEY` för mejl.
4. Vercel cron `/api/cron/ai-market-watch` kör 03:00 UTC dagligen. Resultaten visas längst ner på `/admin/ai-control`.
5. Valfritt: `AI_MARKET_EXTRA_FEEDS` med kommaseparerade HTTPS RSS/Atom-flöden.

**Avgränsningar:** Första versionen använder officiella SDK-releaseflöden och valfria extra RSS/Atom-flöden. Den är ingen komplett marknads-/pris-/konkursbevakning och gör inte automatiska modellbyten. Den har inga betalda AI- eller sökanrop. Klassificering av nyheter är nyckelordsbaserad och kräver mänsklig verifiering av viktiga påståenden. API-fel i bevakningen påverkar inte innehållsgenereringen. Mejl skickas bara för nya händelser klassade viktiga/kritiska; ingen mejl skickas om inget sådant hittas.
