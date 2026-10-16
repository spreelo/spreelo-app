# 144.358 – gemensamt produktmanus och tydligare designgranskning

Godkänd för driftsättning av användaren 2026-10-16. Bas: 144.357 (`a76944794c8b2e8ba15b20aa95841c398140eb43`).

- Generellt produktmanus planeras före öppningsbilden och återanvänds vid rörelsegranskning. Miljö, stöd och utrymme ska göra den produktspecifika handlingen möjlig. Inga kategori-/produktspecifika manusmallar införs.
- Naturlig gång, blick och tygrespons tillåts inom godkänd handling, med bibehållna produkt-, tryck- och vybegränsningar. Vald rörelse och eventuell reservorsak loggas.
- Slutbildens granskning skiljer uttrycklig feedback om enbart centrering/mellanrum från konkret saknat, avklippt, överlappande eller skadat innehåll. Konkreta fel förblir blockerande.
- Strukturerade granskningsfynd, befintligt render-ID och riktade åtgärdsinstruktioner bevaras i diagnostik, administratörsvy och larm. Avvisad Kling-rendering sparar även render-URL och rapporterar fel vid checkpointsparning.

12 relevanta testskript passerade på den kombinerade ändringen, inklusive två nya regressionstester, verklig funktionsorkestrering med simulerade externa tjänster, skydd mot dubbla betaljobb samt tidigare 429-/worker-/animationsskydd. Produktionsbygget passerade med ofarliga konfigurationsplatshållare. Se de två `REVIEW_*_2026-10-16.md`-rapporterna för detaljer och begränsningar.

Inga nya miljövariabler, databasändringar, modellbyten eller automatiska omkörningar av befintliga jobb ingår. Driftsättning beställer inga nya Kling-filmer. Det tidigare stoppade inlägget låses inte upp automatiskt.

Efter driftsättning ska en ny administratörstestvideo visa om Kling utför den planerade handlingen och om den färdiga texten/slutbilden håller önskad kvalitet. Testerna är inte en visuell kvalitetsgaranti. Befintligt betalt material bevaras.
