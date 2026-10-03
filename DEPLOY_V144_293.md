# Spreelo v144.293 – Shopify App Bridge start

För dig som har v144.292: packa upp uppdateringszippen och kopiera filerna till projektroten med samma mappstruktur. Ersätt befintliga filer och deploya på nytt. Ingen SQL behövs.

Orsak: v144.292 satte async=true på App Bridge-skriptet. Shopifys faktiska CDN-skript avbryter uttryckligen initialiseringen om async eller defer används. Dynamiska klassiska skript måste därför uttryckligen få async=false.

Rättning: Shopify-entry laddar nu skriptet med async=false. Avgränsningen till Shopify-entry och butikskontrollen kvarstår. Språk/hydration-fixen, min-height 68px och bildytan 4:5 från v144.292 är kvar.

Verifiering: produktionsbygge passerar. Test med det faktiska Shopify CDN-skriptet i simulerad DOM reproducerar async-felet och bekräftar att den rättade laddningen exponerar idToken utan startfel. Shopify-föräldrafönstret simuleras, så riktig Shopify-inloggning måste fortfarande verifieras efter deploy. Befintliga autentiseringskontroller och React-hydration med sparat svenskt språk passerar.
