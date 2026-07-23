# Spreelo V133 — calendar UX and exact design correction

## Scope
Presentation-only update based on V132/V130 campaign behavior.

## Changed
- Personal brand name is interpolated correctly in the calendar title.
- Clear personal-calendar introduction added.
- Desktop layout aligned more closely with the approved reference image.
- Full month calendar is now an actual date filter: only campaign dates are interactive.
- Tablet/mobile filter and month calendar are collapsed by default.
- Fixed tablet/mobile top offset under the fixed app header.
- Removed the misleading recommended post plan, post-type list, estimated credits and timing from calendar details.
- The expanded campaign now explains that the actual formats, dates and credit cost are shown in AI Content Studio.
- Replaced ambiguous "In progress" with date-based "Relevant now" / Swedish "Aktuell nu".
- Upcoming opportunities remain labelled "Planned" / "Planerad".
- Mobile/tablet no longer auto-open the first campaign.

## Not changed
- No AI calls added.
- No `/api/plan-campaign` call added.
- No campaign analysis, `post_plan`, product policy, credits or handoff behavior changed.
- No database migration or SQL required.
