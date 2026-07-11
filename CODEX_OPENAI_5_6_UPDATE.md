# Codex OpenAI 5.6 update

This version centralizes all OpenAI model selection in `lib/openaiModels.js`.

Default routing:

- GPT-5.6 Sol: campaign planning.
- GPT-5.6 Terra: manual post generation and main brand analysis.
- GPT-5.5: advanced product research.
- GPT-4.1 Mini: automated post text, fast product research, UI translation,
  language detection, JSON repair, and other helpers.
- GPT Image 2: image generation.

Every model can be overridden with deployment environment variables documented
in `README.md`. Existing `OPENAI_API_KEY` configuration is unchanged.

## Verified website product mode

Website product mode now requires at least four distinct individual item pages
that were actually discovered on the business website's own domain. The AI must
return the exact item URLs, and the server verifies them against links collected
from the fetched website pages before saving `website_product_mode_available`.

External marketplaces, auction sites, booking portals, category/search pages,
general product mentions, and unsupported AI-provided URLs do not count. This
prevents brochure sites or businesses that only link to inventory elsewhere from
being enabled for product posts and carousels.

## GPT-5 parameter compatibility

GPT-5 models are called without a custom `temperature`, because these models
only accept the default value. GPT-4.1 helper calls retain their task-specific
temperature settings. The shared `getTemperatureOptions` helper applies this
rule when deployment environment variables switch a task between model families.

## Strict campaign product matching

For themed campaigns, a high semantic AI score can no longer replace an actual
theme, anchor, or campaign-product-term match. Broad carousel fallbacks apply the
same guard. When focused discovery cannot provide enough matching products, the
carousel stops instead of filling missing slides with generic catalog products.
