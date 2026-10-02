# v144.289 — tydligt avskilda formatbeskrivningar

Inläggstyperna använder nu den valda layouten: mindre rubrik med formatikon
överst, vit förhandsvisningsyta med färgad överkant och en separat förklaringsruta
undertill. Förklaringen har luft ovanför, en informationsetikett och färgad
vänsterkant. Hela beskrivningen visas utan att kapas.

Ändringen gäller alla format via den gemensamma komponenten, i remsan och
i vyn med alla format. Befintliga bilder och reservillustrationer används tills
de nya exempelbilderna är klara. Val, klick och dragning fungerar som tidigare.

Etiketten använder appens befintliga översättningssystem med den nya nyckeln
automation.format.aboutPostType (engelsk källtext: About this post type).

Ingen SQL eller ny miljövariabel behövs. Deploya den fullständiga zippen som
vanligt. Den lilla uppdateringszippen innehåller ändrade filer från v144.288;
kopiera dess innehåll till projektroten och skriv över motsvarande filer.
