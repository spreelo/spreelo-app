SPREELO 144.389 - SÄKER INSTALLATION

1. Lägg in hela projekt-ZIP:en på GitHubs main enligt ert vanliga arbetssätt.
   Den nya prissättningsfunktionen är AV från början; lägg INTE till någon ny Vercel-variabel ännu.
2. Kontrollera att nya Vercel-deploymenten får status Ready.
3. Kör den separata Supabase-SQL-filen efter backup. Den skapar bara nya tabeller/funktioner.
4. Kontrollera adminsidan /admin/openai-pricing.
5. Aktivera först efter test via Vercel-variabeln SPREELO_OPENAI_PRICING_ENABLED=true (Production).
6. Daglig prisbevakning sker i Vercel och ändrar aldrig priser automatiskt.

Kostnadsavstämningen mot faktureringen är frivillig och kräver senare OpenAI-organisationsnyckel.
OBS: Fullständig Vercel-build och verkliga OpenAI/Supabase-anrop återstår till test i din miljö.
