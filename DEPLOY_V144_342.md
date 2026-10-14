# Spreelo 144.342 – Produktbild, typografi och rörliga slutkort

Bygger på den uppladdade `spreelo-144.341-bounded-kling-motion(1).zip`.

## Driftsättning

Ersätt projektet med innehållet i denna zip och driftsätt som vanligt. **Ingen ny SQL eller nya miljövariabler krävs.** Alla tidigare filer/migreringar från 341 följer med.

Förbättringarna används vid nya genereringar. Redan levererade videor ändras inte. Pågående betalda jobb återanvänder sina sparade tillgångar och render-ID:n; uppdateringen beställer inga ersättande Kling-jobb. En explicit regenerering i admin är fortfarande en ny körning med de vanliga kostnaderna.

## Ändringar

- Frilagda källbilder behåller befintliga RGB-/alfapixlar inom beskärningen. Ingen ny färgmask läggs på dem. För bilder med jämn ogenomskinlig bakgrund tas endast bakgrund som hänger ihop med bildens ytterkant bort, med en smal kantutjämning. Ljusa tangenter, metall och andra inneslutna produktytor skyddas. Stora tvetydiga vita regioner går via den befintliga kontrollerade AI-friläggningen; om den inte kan godkännas bevaras originalfotot i den befintliga säkra panelen. Verkliga hål och genomskinliga material i redan frilagda bilder bevaras.
- Den befintliga granskningen av AI-friläggning kräver även att fasta produktytor har behållit sin opacitet.
- Animation och AI-video får gemensamma, inläggsanpassade instruktioner för formulering, typografisk hierarki, färg, avstånd och slutkort. För animation planeras rubrik, CTA och stil i samma befintliga textsteg; ett gemensamt bildatlas ger rubrik och slutkort. Båda formuleringarna läses tillbaka i samma befintliga verifieringssteg. Ingen lokalt ersatt animationstext används vid ett fel.
- AI-videons befintliga kreativa plan anger skyddade produkt-/personytor över de granskade bildrutorna. Placeringen kontrolleras geometriskt i koden. En konstaterat omöjlig placering stoppas och förblir stoppad vid återupptagning, i stället för att falla tillbaka till text över produkten.
- Kontrast korrigeras först med textfärg. Kontur läggs inte längre till automatiskt på lugna bakgrunder; blandade rörliga ytor kan få en tunn kontrastkant. Animationens text placeras närmare den synliga produkten.
- Standardstart för AI-videons rubrik är 1,5 sekunder, tidigare 2,0. Ett uttryckligt befintligt värde i `KLING_TEXT_OVERLAY_START_SECONDS` gäller fortsatt.
- Slutkortets CTA-rader centreras var för sig utifrån synliga bokstäver. Utan logga placeras en diskret lokaliserad avsändare tätt under CTA:n. Den uppladdade loggan ligger i ett separat hörnlager över hela videon, inklusive slutkortet; ingen extra mittlogga bakas in i nya slutkort.
- Animationen övergår med en 0,4-sekunders övertoning till slutkortet före slutet av produkt-/bakgrundsrörelsen. Produktlagret fortsätter inte in i en fryst tvåsekundersbild. Slutkortets bakgrund får en diskret 3,5 % rörelse medan CTA och logga står kvar. AI-video använder samma princip (1,5 sekunder slutkort; animation 2 sekunder).
- Kling-genereringens 341-instruktioner, evidens-/kameraregler, kvalitetsspärrar och cacheversioner är oförändrade. Vid en sparad plan med avslut vid fem sekunder börjar slutkortets övergång före den planerade stilla slutsekunden. Källfilen och granskningen av hela källvideon behålls. Den deterministiska originalbildsanimationen vid kvalitetsavslag får fortsatt 6 % zoom med oförändrat centrum, nu genom hela källklippet fram till slutkortet.

## Kostnader och begränsningar

Antalet normala AI-steg och tillåtna försök ökas inte. Ingen extra Kling-generering beställs för dessa förbättringar. Animationens bildanrop använder nu en 1536×1024-atlas, och verifieringen läser både rubrik och CTA. Token-/bildkostnaden kan därför ändras; oförändrat antal anrop är inte ett löfte om oförändrat pris. Konservativ friläggning kan låta fler tvetydiga bilder använda den redan befintliga AI-friläggningen. Dessa kostnader går via den befintliga kostnadsloggningen.

Formgivningen väljs fortfarande av AI inom de nya reglerna; uppdateringen är inte en garanti för perfekt estetik i varje klipp. Testerna verifierar inte samtliga produkttyper eller framtida leverantörsutdata. Ett live-exempel med den valda modellen/renderaren behöver bedömas efter driftsättning. Ingen produktion ändrades och inga betalda AI-/Kling-/Shotstack-jobb kördes under arbetet.

## Genomförd validering

- `npm run test:v144.342`: verklig tangentbords-PNG, vitbakgrund/JPEG, opaka ljusa produktytor, befintlig halvtransparens, fina kanter/trådar, tvetydiga hål, WebP-tillgången i produktanimationen, CTA-radcentrering, loggans lager/längd, rörlig bakgrund och fast text, produktfria textregioner, exakt rubrik-/CTA-avläsning, fel-/kvotvägar och verkliga generatorflöden med mockade tjänster. Separata slutkortsfiler verifieras mot överskrivning och återupptagning får inte göra ett nytt betalt bildanrop.
- Regressioner för 299, 306, 309, 312, 314, 315, 329 (Kling-prompt), 334, 336, 337, 338, 339, 340 och 341.
- Visuell inspektion av friläggningen och komponerade testbilder med/utan logga.
- Produktionsbygge med Sharp, Next.js och TypeScript; testvärden för klienternas inställningar, inga externa produktionsanrop.

De syntetiska rastertesterna är kompositionstester, inte löften om exakt stil från bildmodellen. `scripts/test-v144-342-video-design.mjs` skriver reproducerbara lokala granskningsbilder till `test-output-v342`.
