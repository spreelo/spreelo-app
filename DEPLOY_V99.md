# Spreelo v99 – popup-positionering återställd

Byggd ovanpå `spreelo-app-main-98-responsive-polish-seven-fixes.zip`.

## Korrigering

Bakgrundens separata bildlager ligger nu bakom sidans vanliga innehåll med negativt z-index. Den breda regeln som gav alla direkta sidbarn `position: relative` är borttagen.

Det återställer samtliga popupers befintliga `position: fixed`, helskärmsbakgrund och centrering utan att ta bort v98:s mjuka bakgrundsövergång eller övriga sju förbättringar.

Ingen SQL behövs. Ändringen är enbart CSS.
