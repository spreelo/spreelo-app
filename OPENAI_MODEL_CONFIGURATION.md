# OpenAI model configuration

This release centralizes all OpenAI model defaults in `lib/openaiModels.js`.

| Workload | Default model | Optional Vercel override |
|---|---|---|
| Brand analysis and campaign calendar | `gpt-5.6-terra` | `OPENAI_BRAND_ANALYSIS_MODEL` |
| Detailed campaign planning | `gpt-5.6-terra` | `OPENAI_CAMPAIGN_PLANNING_MODEL` |
| Advanced product research and web search | `gpt-5.6-terra` | `OPENAI_PRODUCT_RESEARCH_MODEL` |
| Automatic and manual post text | `gpt-5.6-luna` | `OPENAI_POST_TEXT_MODEL` |
| Fast product scoring and search metadata | `gpt-5.6-luna` | `OPENAI_PRODUCT_RESEARCH_FAST_MODEL` |
| JSON repair, language detection and page selection | `gpt-4.1-mini` | `OPENAI_HELPER_MODEL` |
| UI translation | `gpt-4.1-mini` | `OPENAI_UI_TRANSLATION_MODEL` |
| Image generation | `gpt-image-2` | `OPENAI_IMAGE_MODEL` |

Legacy environment variables `PRODUCT_RESEARCH_MODEL` and
`PRODUCT_RESEARCH_FAST_MODEL` are intentionally not read by this version. This
prevents old Vercel values from silently overriding the new model allocation.

The `openai` npm dependency is pinned to `6.46.0` rather than `latest`, so a
future deployment cannot change SDK behavior without a code change.
