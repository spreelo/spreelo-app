/**
 * Central OpenAI configuration for Spreelo.
 *
 * Ändra modeller och temperaturer direkt här.
 * Inga profiler och inga Vercel-overrides.
 */

export const OPENAI_MODELS = Object.freeze({
  brandAnalysis: "gpt-4.1-mini",
  campaignPlanning: "gpt-5.5",

  productResearch: "gpt-5.5",
  productResearchFast: "gpt-4.1-mini",

  autoPost: "gpt-4.1-mini",
  manualPost: "gpt-5.5",

  helper: "gpt-4.1-mini",
  uiTranslation: "gpt-4.1-mini",

  image: "gpt-image-2",
});

export const OPENAI_TEMPERATURES = Object.freeze({
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
});

/**
 * Lägger bara till temperature när ett numeriskt värde finns.
 * Sätt värdet till null för modeller som inte accepterar temperature.
 */
export function withOpenAITemperature(settingName) {
  const value = OPENAI_TEMPERATURES[settingName];

  return Number.isFinite(value)
    ? { temperature: value }
    : {};
}
