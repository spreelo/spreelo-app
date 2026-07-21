# Spreelo v95.1 — korrekt referensmagi

Utgångspunkt: `spreelo-app-main-94-svg-reference-master.zip` från 21 juli 2026.

Den tidigare bakgrunden används inte i den nya skapa-plan-designen. V95.1 innehåller en ny separat SVG, ritad efter den godkända referensens ljus- och orange linjer:

- `public/backgrounds/spreelo-plan-reference-magic-v95.svg`
- `app/styles/16-v95-exact-create-plan.css` pekar endast på den nya bakgrunden
- den gamla `spreelo-plan-hero.svg` lämnas orörd för att inte påverka andra ytor
- inga API-, OpenAI-, Supabase-, karusell- eller kampanjändringar

Ingen SQL behöver köras.
