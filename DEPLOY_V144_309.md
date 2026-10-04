# v144.309 – Kling leverans, logga och scenanpassad text

1. Kör `supabase/v144_309_kling_delivery.sql` i Supabase före deploy. Den förutsätter att v144.305-migreringen redan har körts.
2. Deploya hela projektet och behåll befintliga cron-jobb och miljövariabler.
3. Testa en ny AI-produktvideo med logga aktiverad och direktleverans. Kontrollera kundmejl och ”Skickad direkt”. Testa också ett konto med Spreelo-granskning aktiverad.

## Ändringar

- Färdiga Kling-videor använder samma varaktiga leveranslås, mejlmall och idempotensnyckel som animationer. Kundens aktuella granskningsinställning läses vid leverans. Admin-test och poster utan ursprunglig automationsregel stannar för granskning.
- Kling-historik och krediter hanteras vid den ursprungliga task-submissionen och debiteras inte igen vid slutleverans.
- Leveransfel behåller färdig video och återförsöks av befintlig finalizer-cron. Inga nya renderingar behövs för att återförsöka mejl.
- Riktig kundlogga läggs som ett transparent lager över hela produktvideon och slutbilden, om postens logginställning är aktiverad. Hämtning stöder både befintlig lagringssökväg och publik URL. Ett tillfälligt loggfel ger ett slutbehandlingsförsök senare, inte en ny Kling-beställning.
- Text- och CTA-plan får exakt scenanpassad position, storlek, justering och önskad skala. Fem rörelsebilder täcker textens visningstid; slutbilden analyseras separat. Koordinater valideras, sociala UI-marginaler skyddas och översta loggytan reserveras. Låg säkerhet använder konservativ placering. Små textmotiv förstoras inte automatiskt.
- En befintlig undefined-variabel i Kling-felrapporteringen rättas så att fel exponeras korrekt i admin.

## Befintliga videor

SQL och befintlig leverans-cron kan ta hand om redan färdiga Kling-poster som fortfarande väntar på godkännande och saknar slutförd leverans. Logga och ny textlayout gäller nya slutrenderingar; redan renderade videofiler görs inte om automatiskt.

## Verifiering

Beteendetester för direktleverans, granskningskrav, admin-test, mejlretry, idempotens och ingen extra kreditdebitering. Layouttester för gränser, säker fallback, justering, bildrutor och faktisk pixelplacering utan förstoring. Produktionsbuild och SQL-migrering kontrolleras separat. Externa Kling/Shotstack/Resend-körningar behöver verifieras efter deploy; inga betalbara API-beställningar görs lokalt.
