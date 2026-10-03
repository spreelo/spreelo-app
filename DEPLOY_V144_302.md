# v144.302 — Suitable video backgrounds with bounded variety

Seasonal backgrounds require a matching post season. Generic product/fashion tags no longer allow an unrelated Christmas or Halloween scene. Text keyword matching uses word boundaries to prevent incidental matches inside other words.

Product brightness contrast now carries more weight. Selection first builds a pool within 20 relevance points of the best suitable scene, then avoids the previous asset when an alternative exists in that pool and applies modest recent-use/family penalties. If only one suitable option exists, reuse is allowed.

New active 9:16-safe video library assets join the next selection automatically using their existing season, campaign, industry, mood, color, brightness and priority metadata. No per-video code changes, new AI calls, environment variables or SQL migrations are required. Accurate metadata remains necessary; this does not add frame-by-frame video contrast analysis.

Includes all v144.301 files. This version changes background selection only; product motion and text image rendering retain v144.300 behavior.

Validation: scripts/test-v144-302-background-selection.mjs covers seasonal restrictions, contrast versus variety, repetition when necessary, dynamic asset addition, inactive/crop exclusion and incidental keyword matching.
