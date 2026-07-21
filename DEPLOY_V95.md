# Spreelo v95 — exakt skapa-plan-design

Utgångspunkt: `spreelo-app-main-94-svg-reference-master.zip` från 21 juli 2026.

Ändringen är avgränsad till skapa-plan-sektionens presentation:

- ny slutlig CSS-layer: `app/styles/16-v95-exact-create-plan.css`
- tre kolumner behålls vid referensbildens 1100 px-bredd
- guide, kort, avstånd, ikoner, skuggor och bakgrund matchas mot referensbilden
- rubrikrad med `Spara som mall` och hjälpknapp
- inga API-, OpenAI-, Supabase-, karusell- eller kampanjändringar

`Spara som mall` är visuellt med för att matcha referensen men är avsiktligt inaktiverad tills mallfunktionen byggs som en separat funktion.

Ingen SQL behöver köras.
