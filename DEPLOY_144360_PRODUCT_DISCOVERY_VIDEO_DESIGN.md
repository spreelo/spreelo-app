# 144.360 – produktinhämtning och professionell texthierarki

Godkänd för gemensam driftsättning av användaren 2026-10-16 kl. 12:57 svensk tid.
Bas: 144.359 (`8da6c171550f95263d4ea9050cb631a88030c2b2`).

- Shopify-kataloger läses som JSON med befintlig domänpacing och 429-registrering.
  Vald kategoris feed och färska, verifierade, oanvända sparade produkter prioriteras.
- Historik filtreras före kortlistor och betald reparation. Sökningen kan fortsätta förbi
  en hel sida med använda produkter och förbi en använd AI-ersättning, med begränsat arbete.
- Kategoribevis kontrolleras före teknisk produktverifiering, även i reservsökningen.
  En begränsad kortlista betraktas inte som bevis för att butikens sortiment är uttömt.
- Väntande jobb visar orsak och tidigaste nästa automatiska försök från sparad retrytid.
  Samma occurrence och tidigare 429-policy behålls; ingen SQL-migration behövs.
- AI-video och animation delar en tydligare hook/stödtext/CTA-hierarki. Produktnamn
  upprepas inte på slutbilden, CTA underordnas huvudrubriken och avsändaren görs läsbar.
- Färger väljs ur varumärke, individuell bakgrund och uttrycklig art direction.
  Automatisk cyan och färgad sista rad tas bort. Text mäts och bryts utan kapade ord.
- Ett kataloglikt Kling-rubrikförslag får högst en omskrivning. Modellfel/timeout
  omsänds inte. Detta skapar ingen ny kreativ adminspärr eller ny Kling-beställning.
- Nya slutbilder med egen avsändare får ingen dubblerad hörnlogga. Sparade äldre tillgångar
  utan den nya flaggan behåller sin tidslinje. Tidigare produkt- och betalningsskydd behålls.

22 relevanta testskript, PGlite-testet för återupptagning, produktionsbygget med ofarliga
konfigurationsplatshållare och diffkontroll passerar. Två äldre testfel har verifierats
identiska i orörd 144.359 och dokumenterats. Inga betalda AI-körningar, produktionsdatabas-
skrivningar eller kundmejl ingick i verifieringen.

Detaljer: `REVIEW_144360_PRODUCT_DISCOVERY.md` och `REVIEW_144360_VIDEO_DESIGN.md`.
Lokala layoutexempel finns i `docs/previews/144360/`; de är illustrativa fixtures.

Inga nya modeller eller miljövariabler införs. Befintliga jobb tvingas inte till
omgenerering och terminalt stoppade videor startas inte automatiskt. Shotstack-vattenstämpeln
och externa kontoinställningar ändras inte av denna release.
