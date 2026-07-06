# Spreelo campaign language and campaign-plan UI patch

Changes in this patch:

- Normalizes detected content language to one single publishing language.
- Prevents raw i18n keys such as `brand.language.Danish, Swedish...` from being shown in the Brand Profile language dropdown.
- Ensures new automation posts store one normalized language instead of a multi-language list.
- Tightens cron post generation prompts so posts are written in one selected language and do not mix languages.
- Campaign planner now keeps campaign dates/times fixed for normal customers.
- Internal tester account `johan@foldern.com` can still unlock dates, edit times, add, duplicate and remove campaign posts for testing.
- Hides add/duplicate/delete campaign-post controls for normal customers.
- Fixes the missing translation key shown as `automation.creditsUsedWhenGenerated` by no longer appending that raw label in the success card.
- Improves saved-plan success copy and keeps the credits field cleaner.
- Blocks empty image-less carousel drafts by requiring at least 5 verified carousel products with images before a carousel can be saved.

Tested:

- `npm run build` with dummy env values. Build compiled and completed successfully.
