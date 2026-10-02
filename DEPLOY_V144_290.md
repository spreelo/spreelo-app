# v144.290 — rättad formatremsa och återställd väljare

Den höga exempelremsan är nu avgränsad till huvudsidans innehållstyper.
Väljaren "Välj innehållstyp" använder åter sin ursprungliga kompakta komponent,
med bild överst och rubrik/beskrivning under. Kortens höjd anpassas så att
bildytan inte pressas ihop. Val och dragning behåller sina befintliga bindningar.

Förklaringsrutorna i huvudsidans remsa har nu rundade hörn och färgad
vänsterkant även med appens äldre CSS-regler aktiva. Befintliga exempelbilder
används fortfarande; de nya Facebook-exemplen ingår inte i denna korrigering.

Ingen SQL eller ändrad miljövariabel behövs. Den lilla uppdateringszippen
kopieras till projektroten och skriver över motsvarande filer. Den fullständiga
zippen kan deployas som vanligt. Uppdateringen inkluderar v144.287–289.
