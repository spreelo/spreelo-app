function resolveModel(envName, fallback) {
  const configured = String(process.env[envName] || "").trim();
  return configured || fallback;
}

/**
 * Central OpenAI model configuration for Spreelo.
 *
 * Quality-critical planning and research use GPT-5.6 Terra.
 * High-volume post generation uses GPT-5.6 Luna.
 * Small deterministic helper tasks remain on GPT-4.1 mini.
 *
 * Each model can be overridden explicitly in Vercel with the matching
 * OPENAI_* environment variable. Legacy PRODUCT_RESEARCH_MODEL variables
 * are intentionally not used so an old Vercel value cannot silently keep
 * this release on GPT-5.5.
 */
export const OPENAI_MODELS = Object.freeze({
  brandAnalysis: resolveModel(
    "OPENAI_BRAND_ANALYSIS_MODEL",
    "gpt-5.6-terra"
  ),
  campaignPlanning: resolveModel(
    "OPENAI_CAMPAIGN_PLANNING_MODEL",
    "gpt-5.6-terra"
  ),
  productResearch: resolveModel(
    "OPENAI_PRODUCT_RESEARCH_MODEL",
    "gpt-5.6-terra"
  ),
  postText: resolveModel("OPENAI_POST_TEXT_MODEL", "gpt-5.6-luna"),
  productResearchFast: resolveModel(
    "OPENAI_PRODUCT_RESEARCH_FAST_MODEL",
    "gpt-5.6-luna"
  ),
  helper: resolveModel("OPENAI_HELPER_MODEL", "gpt-4.1-mini"),
  uiTranslation: resolveModel(
    "OPENAI_UI_TRANSLATION_MODEL",
    "gpt-4.1-mini"
  ),
  image: resolveModel("OPENAI_IMAGE_MODEL", "gpt-image-2"),
});
