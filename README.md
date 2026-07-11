# Spreelo App
AI social media planner for creating, saving and automating social media content.
# OpenAI model configuration

Spreelo uses task-specific OpenAI models. These defaults can be overridden in
the deployment environment without changing the code:

```env
CAMPAIGN_PLANNING_MODEL=gpt-5.6-sol
POST_GENERATION_MODEL=gpt-5.6-terra
BRAND_ANALYSIS_MODEL=gpt-5.6-terra
OPENAI_HELPER_MODEL=gpt-4.1-mini
PRODUCT_RESEARCH_MODEL=gpt-5.6-sol
PRODUCT_RESEARCH_FAST_MODEL=gpt-5.6-luna
POST_TEXT_MODEL=gpt-5.6-luna
OPENAI_UI_TRANSLATION_MODEL=gpt-4.1-mini
OPENAI_IMAGE_MODEL=gpt-image-2
```

The defaults are defined centrally in `lib/openaiModels.js`.

Website product mode is enabled only after the analysis verifies at least four
distinct item detail pages on the business website's own domain. External
marketplaces and category-only pages are not treated as a usable product catalog.
