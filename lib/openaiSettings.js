/**
 * Central OpenAI configuration for Spreelo.
 *
 * Change only DEFAULT_OPENAI_PROFILE to switch the full model setup.
 * You may also set OPENAI_PROFILE in Vercel to override it without editing code.
 *
 * Available profiles:
 * - legacyStable: Exact model/temperature behavior from the older working version.
 * - terraLunaExperimental: Terra for analysis/research and Luna for high-volume copy.
 */

export const DEFAULT_OPENAI_PROFILE = "legacyStable";

const OPENAI_PROFILES = Object.freeze({
  legacyStable: Object.freeze({
    models: Object.freeze({
      brandAnalysis: "gpt-4.1-mini",
      campaignPlanning: "gpt-5.5",
      productResearch: "gpt-5.5",
      productResearchFast: "gpt-4.1-mini",
      autoPost: "gpt-4.1-mini",
      manualPost: "gpt-5.5",
      helper: "gpt-4.1-mini",
      uiTranslation: "gpt-4.1-mini",
      image: "gpt-image-2",
    }),
    temperatures: Object.freeze({
      jsonRepair: 0,
      websiteContextSelection: 0,
      productMetadataRepair: 0.1,
      languageDetection: 0,
      brandAnalysis: 0.2,
      descriptionAnalysis: 0.2,
      websiteItemExtraction: 0.2,
      automationPost: 0.75,
      carouselCopy: 0.65,
      productCarouselCopy: 0.55,
      uiTranslation: 0.1,
    }),
  }),

  terraLunaExperimental: Object.freeze({
    models: Object.freeze({
      brandAnalysis: "gpt-5.6-terra",
      campaignPlanning: "gpt-5.6-terra",
      productResearch: "gpt-5.6-terra",
      productResearchFast: "gpt-5.6-luna",
      autoPost: "gpt-5.6-luna",
      manualPost: "gpt-5.6-luna",
      helper: "gpt-4.1-mini",
      uiTranslation: "gpt-4.1-mini",
      image: "gpt-image-2",
    }),
    temperatures: Object.freeze({
      jsonRepair: 0,
      websiteContextSelection: 0,
      productMetadataRepair: 0.1,
      languageDetection: 0,
      // GPT-5.6 Terra/Luna requests omit temperature.
      brandAnalysis: null,
      descriptionAnalysis: null,
      websiteItemExtraction: null,
      automationPost: null,
      carouselCopy: null,
      productCarouselCopy: null,
      uiTranslation: 0.1,
    }),
  }),
});

function resolveProfileName() {
  const requested = String(process.env.OPENAI_PROFILE || DEFAULT_OPENAI_PROFILE).trim();
  return Object.prototype.hasOwnProperty.call(OPENAI_PROFILES, requested)
    ? requested
    : DEFAULT_OPENAI_PROFILE;
}

export const OPENAI_PROFILE_NAME = resolveProfileName();
const ACTIVE_PROFILE = OPENAI_PROFILES[OPENAI_PROFILE_NAME];

function envModel(primaryName, fallbackValue, legacyName = "") {
  return (
    String(process.env[primaryName] || "").trim() ||
    (legacyName ? String(process.env[legacyName] || "").trim() : "") ||
    fallbackValue
  );
}

export const OPENAI_MODELS = Object.freeze({
  brandAnalysis: envModel(
    "OPENAI_BRAND_ANALYSIS_MODEL",
    ACTIVE_PROFILE.models.brandAnalysis
  ),
  campaignPlanning: envModel(
    "OPENAI_CAMPAIGN_PLANNING_MODEL",
    ACTIVE_PROFILE.models.campaignPlanning
  ),
  productResearch: envModel(
    "OPENAI_PRODUCT_RESEARCH_MODEL",
    ACTIVE_PROFILE.models.productResearch,
    "PRODUCT_RESEARCH_MODEL"
  ),
  productResearchFast: envModel(
    "OPENAI_PRODUCT_RESEARCH_FAST_MODEL",
    ACTIVE_PROFILE.models.productResearchFast,
    "PRODUCT_RESEARCH_FAST_MODEL"
  ),
  autoPost: envModel("OPENAI_AUTO_POST_MODEL", ACTIVE_PROFILE.models.autoPost),
  manualPost: envModel("OPENAI_MANUAL_POST_MODEL", ACTIVE_PROFILE.models.manualPost),
  helper: envModel("OPENAI_HELPER_MODEL", ACTIVE_PROFILE.models.helper),
  uiTranslation: envModel(
    "OPENAI_UI_TRANSLATION_MODEL",
    ACTIVE_PROFILE.models.uiTranslation
  ),
  image: envModel("OPENAI_IMAGE_MODEL", ACTIVE_PROFILE.models.image),
});

export const OPENAI_TEMPERATURES = ACTIVE_PROFILE.temperatures;

/**
 * Spread this into an OpenAI request. A null value deliberately omits temperature,
 * which is required for model variants that do not accept custom temperature.
 */
export function withOpenAITemperature(settingName) {
  const value = OPENAI_TEMPERATURES[settingName];
  return Number.isFinite(value) ? { temperature: value } : {};
}
