# Spreelo v144.292

Utgå från v144.290. Packa upp den lilla uppdateringszippen och kopiera filerna till projektroten med samma mappar. Ersätt befintliga filer och bygg/deploya på nytt.

Ändringar:
- Shopify App Bridge laddas bara från /shopify/app med giltig shop och konfigurerad API-nyckel. Vanliga Spreelo-sidor laddar inte skriptet. Saknad butik ger ett tydligt meddelande.
- Språkpreferens och cache återställs efter React-hydration. Server och första klientrenderingen använder samma språkpaket, och sparat språk skrivs inte över.
- Inläggstypens rubrikfält har min-height: 68px på både desktop och mobil.

Bildytan är kvar i 4:5 enligt v144.290. Inga databasändringar eller nya produktionsberoenden krävs.

Verifiering: Next.js produktionsbygge; befintliga Shopify-autentiseringskontroller; React hydrateRoot med sparat svenskt språk och cache i simulerad DOM; Shopify-skriptladdning med saknad/ogiltig butik, saknad API-nyckel och parallell initiering. Alla passerar. Riktig Shopify-inloggning behöver verifieras i drift.
