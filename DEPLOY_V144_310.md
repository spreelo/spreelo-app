# v144.310 – AI Content Creator welcome guide

Deploy the complete project. No new SQL is required for this update. Keep the v144.309 delivery migration already applied.

- Replaces the previous first-plan popup with the approved welcome layout for desktop and mobile, with tablet sizing.
- Includes the two approved illustrations as local PNG files, with English example ad copy.
- Keeps the current /brand/spreelologo-on-dark.png logo.
- English source text and 19 new automation.welcomeV310 translation keys use the existing persistent translation pipeline for all supported UI languages.
- Shows on normal creator visits until Don't show again is selected and the dialog is closed. The preference is scoped to the signed-in user, saved locally immediately and synced to auth user metadata. Closing without checking it hides it only for that visit. Direct plan and campaign links remain unobstructed.
- The CTA closes the welcome guide so the customer can adjust settings. It does not activate or charge for a plan.
- Does not reset existing plan settings or generate a recommendation simply because the welcome guide opens.
- Backdrop opacity 28% and blur 4px keep the creator visible. Modal scrolls as one surface on short screens; close button remains visible; keyboard focus is contained and restored on dismissal.

Validation: production build, responsive layout checks, keyboard/scroll and dismissal preference checks. Live translation generation and cross-device metadata syncing depend on the existing configured services.
