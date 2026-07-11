export const OPENAI_MODELS = {
  campaignPlanning:
    process.env.CAMPAIGN_PLANNING_MODEL || "gpt-5.6-sol",
  postGeneration:
    process.env.POST_GENERATION_MODEL || "gpt-5.6-terra",
  brandAnalysis:
    process.env.BRAND_ANALYSIS_MODEL || "gpt-5.6-terra",
  helper:
    process.env.OPENAI_HELPER_MODEL || "gpt-4.1-mini",
  productResearch:
    process.env.PRODUCT_RESEARCH_MODEL || "gpt-5.6-sol",
  productResearchFast:
    process.env.PRODUCT_RESEARCH_FAST_MODEL || "gpt-5.6-luna",
  automationPost:
    process.env.POST_TEXT_MODEL || "gpt-5.6-luna",
  uiTranslation:
    process.env.OPENAI_UI_TRANSLATION_MODEL || "gpt-4.1-mini",
  image:
    process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
};

export function getTemperatureOptions(model, temperature) {
  return /^gpt-5(?:\.|-|$)/i.test(String(model || ""))
    ? {}
    : { temperature };
}
