# v144.295

The onboarding row “This is already planned” now resolves each slot’s example image by content_type_id from the same content-format library used by the format cards and all-types popup. Admin-uploaded images therefore appear in this row after reloading the page. Until a type has a configured image, the existing example remains as fallback.

Preview images use a 4:5 container and object-fit:contain so the full Facebook example is visible. No changes to planning, generation or AI calls. No SQL required.

Small update applies over v144.294.
