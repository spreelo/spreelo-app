# Codex OpenAI 5.6 update

This version centralizes all OpenAI model selection in `lib/openaiModels.js`.

Default routing:

- GPT-5.6 Sol: campaign planning.
- GPT-5.6 Terra: manual post generation and main brand analysis.
- GPT-5.6 Luna: advanced and fast product research, including bounded Web Search.
- GPT-4.1 Mini: automated post text, UI translation,
  language detection, JSON repair, and other helpers.
- GPT Image 2: image generation.

Every model can be overridden with deployment environment variables documented
in `README.md`. Existing `OPENAI_API_KEY` configuration is unchanged.

## Verified website product mode

Website product capability now requires at least one strongly verified individual
product page on the business website's own domain. Five verified items remain the
discovery target used to seed a varied carousel, but an incomplete probe result
must not classify a real store as unavailable. Runtime discovery continues to
find additional campaign-matching products before carousel delivery.

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
same guard. When fewer than five exact matches exist, the resolver expands through
explicit next-best verified quality tiers and still fills the carousel without
inventing unverified catalog products.
For named themes, broad primary product-type matches such as shirt, gift, print,
personalized, or tank top are not sufficient by themselves; a product must match
the campaign theme/anchor directly or come from a verified theme-focused source.

## Robust website access

The homepage fetch now has a shared 45-second budget with up to four bounded
attempts: browser headers, with/without `www`, and a declared crawler fallback.
Every redirect target is revalidated against the public-network safety rules.
Short product/context probes still use one attempt so the product resolver does
not multiply traffic or latency.

If all direct homepage attempts fail, brand analysis makes one GPT-5.6 Luna Web
Search fallback call for official same-domain business context. This fallback is
not called on normal successful analyses, and product-mode approval still goes
through the separate product-page verifier.
