import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { DEFAULT_UI_LABELS, SUPPORTED_UI_LOCALES } from "../lib/i18n/defaultLabels.js";
import { validateGeneratedUiTranslation } from "../lib/i18n/translationValidation.js";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const page = read("app/automation/page.jsx");
const labels = read("lib/i18n/defaultLabels.js");
const swedish = read("lib/i18n/builtInLocaleLabels.js");
const uiHook = read("lib/i18n/useUiText.js");
const uiRoute = read("app/api/ui-translations/route.js");
const compatibility = read("lib/platformContentCompatibility.js");
const worker = read("app/api/cron/run-automations/route.js");
const pinterestCapabilities = read("app/api/pinterest/capabilities/route.js");

// Every literal UI key used by the Content Studio must exist in the source pack.
const usedUiKeys = new Set(
  [...page.matchAll(/\bt\(\s*["']([^"']+)["']/g)].map((match) => match[1])
);
const sourceUiKeys = new Set(
  Object.values(DEFAULT_UI_LABELS).flatMap((namespace) => Object.keys(namespace))
);
const missingUiKeys = [...usedUiKeys].filter((key) => !sourceUiKeys.has(key));
assert.deepEqual(missingUiKeys, [], `Missing Content Studio source labels: ${missingUiKeys.join(", ")}`);
assert.equal(SUPPORTED_UI_LOCALES.length, 30, "The global UI locale catalog should remain complete.");
assert(SUPPORTED_UI_LOCALES.some((item) => item.locale === "zh"), "Simplified Chinese must remain a supported UI locale.");

// Built-in format cards must use the UI pack instead of English DB overrides.
assert(page.includes('label: translateContentTypeShortLabel(type)'), "Built-in format labels must come from UI translations.");
assert(page.includes('String(locale || "en").toLowerCase() === "en" ? config.display_label : ""'), "Raw DB labels may only be used by the English workspace.");
assert(page.includes('Never leak the English source/config text into a non-English workspace'), "Non-English UI must fail closed instead of leaking English.");
assert(page.includes('SUPPORTED_UI_LOCALES.find('), "Auto-language labels must use the canonical locale catalog, not a partial hand-written map.");
assert(uiHook.includes('TRANSLATION_CACHE_VERSION = "v26"'), "The UI translation cache must be bumped after the language-boundary fix.");


// Dynamic Content Studio keys are just as important as literal t("...") calls.
// A missing dynamic key would otherwise silently surface a raw key/English fallback.
const builtInContentTypeIds = [
  "website_item", "website_item_text_ad", "animated_website_item", "ai_product_video",
  "carousel_website_item", "problem_solution", "tips", "mistakes", "faq",
  "behind_scenes", "checklist", "service_focus", "case_example", "myth_fact",
  "local", "seasonal", "comparison", "mini_guide", "manual_prompt",
];
for (const id of builtInContentTypeIds) {
  const keys = id === "manual_prompt"
    ? ["automation.customPostLabel", "automation.customPostShortLabel", "automation.customPostDescription"]
    : id === "website_item"
      ? ["automation.contentType.website_item.labelV127", "automation.contentType.website_item.shortLabelV127", "automation.contentType.website_item.descriptionV127"]
      : [`automation.contentType.${id}.label`, `automation.contentType.${id}.shortLabel`, `automation.contentType.${id}.description`];
  for (const key of keys) assert(sourceUiKeys.has(key), `Missing dynamic content-type UI key ${key}`);

  for (const suffix of ["description", "howItWorks", "benefit"]) {
    const key = id === "website_item" && suffix !== "description"
      ? `automation.formatCard.website_item.${suffix}V127`
      : id === "website_item"
        ? "automation.formatCard.website_item.descriptionV127"
        : `automation.formatCard.${id}.${suffix}`;
    assert(sourceUiKeys.has(key), `Missing dynamic format-card UI key ${key}`);
  }
}

const previewCardMap = {
  website_item: "product_focus", website_item_text_ad: "product_ad", animated_website_item: "animated_product",
  ai_product_video: "animated_product", carousel_website_item: "website_carousel", problem_solution: "problem_solution",
  tips: "tips_advice", mistakes: "common_mistakes", faq: "faq", behind_scenes: "customer_inspiration",
  checklist: "checklist", service_focus: "product_focus", case_example: "customer_inspiration", myth_fact: "tips_advice",
  local: "local_relevance", seasonal: "seasonal", comparison: "mini_guide", mini_guide: "mini_guide", manual_prompt: "custom_prompt",
};
for (const [typeId, cardId] of Object.entries(previewCardMap)) {
  assert(sourceUiKeys.has(`automation.previewCard.${cardId}.label`), `Missing preview-card label for ${typeId}`);
  const descriptionKey = typeId === "service_focus"
    ? "automation.previewCard.service_focus.description"
    : `automation.previewCard.${cardId}.description`;
  assert(sourceUiKeys.has(descriptionKey), `Missing preview-card description for ${typeId}`);
}

// Customer-facing JSX on this page must not contain literal English copy.
// Language-neutral campaign-code examples such as SUMMER25 are intentionally allowed.
const hardCodedUiAttributes = [...page.matchAll(/(?:aria-label|title|alt|placeholder)=(["'])([A-Za-z][^"']*)\1/g)]
  .map((match) => match[2])
  .filter((value) => value !== "SUMMER25");
assert.deepEqual(hardCodedUiAttributes, [], `Raw customer-facing UI attributes found: ${hardCodedUiAttributes.join(" | ")}`);

// Generated translation packs reject untranslated English and broken placeholders.
assert(uiRoute.includes("validateGeneratedUiTranslation"), "UI translation API must validate generated labels before saving them.");
assert.equal(validateGeneratedUiTranslation({ sourceText: "Number of posts", translatedText: "Number of posts", locale: "zh" }).valid, false);
assert.equal(validateGeneratedUiTranslation({ sourceText: "{count} credits", translatedText: "积分", locale: "zh" }).valid, false);
assert.equal(validateGeneratedUiTranslation({ sourceText: "{count} credits", translatedText: "{count} 积分", locale: "zh" }).valid, true);

// One-time plan count follows the actual rows after add/duplicate/delete.
assert(page.includes('setAutoPlanPostCount(Math.max(1, nextSlots.length))'), "Deleting a row must synchronize the plan count.");
assert(page.includes('setAutoPlanPostCount(nextSlots.length);'), "Adding/duplicating rows must synchronize the plan count.");
assert(page.includes('scheduleType === "weekly" ? t("automation.postsPerWeek") : t("automation.postCountTitle")'), "One-time plans must say Number of posts instead of Posts per week.");
assert(page.includes('scheduleType === "weekly" ? t("automation.redesign.postsPerWeekValue", { count }) : t("automation.redesign.postCountValue", { count })'), "One-time plan count values must be localized independently from weekly frequency.");

// Other customer-visible leaks found during the page audit are also localized.
for (const key of [
  "automation.creditCount",
  "automation.previousMonth",
  "automation.nextMonth",
  "automation.flexibleDate",
  "automation.dateAtTime",
  "automation.deleteRulesSuccess",
  "automation.deleteRulesSuccessWithCredits",
  "automation.customerStage.cold",
]) {
  assert(labels.includes(`"${key}"`), `Missing English source label ${key}`);
}
assert(!swedish.includes("krediter"), "Non-English planner labels must come from the persistent translation cache, not a built-in Swedish pack.");
assert(!page.includes('aria-label="Previous month"'), "Calendar navigation must not expose hard-coded English aria labels.");
assert(!page.includes('{slot.strategyNotes}</span>'), "Raw English strategy notes must not leak into the customer popover.");

// Pinterest video is a real native capability in production.
assert(compatibility.includes('animated_video: { mode: "native" }'), "Pinterest animated video must be planner-compatible when runtime capability allows it.");
assert(pinterestCapabilities.includes('video_pins: apiEnvironment !== "sandbox"'), "Runtime capability must keep Pinterest video disabled in Sandbox automatically.");
assert(page.includes('fetch("/api/pinterest/capabilities"'), "Content Studio must load the current Pinterest video capability.");
assert(page.includes('platformCapabilities?.pinterestVideo === false'), "Planner destinations must remove Pinterest video while Sandbox is active.");

// Native v5 video upload flow and duplicate-safe verification.
for (const expected of [
  'body: JSON.stringify({ media_type: "video" })',
  'source_type: "video_id"',
  'cover_image_url: normalizedCoverImageUrl',
  'lastStatus === "succeeded"',
  'Pinterest pending Pin recovered by persisted id',
  'pinterestMediaVerificationFailed = true',
  'error.pinterestTransient = true',
]) {
  assert(worker.includes(expected), `Pinterest video flow missing: ${expected}`);
}
assert(!worker.includes("Pinterest video publishing is not enabled in this release"), "The old hard block must be removed.");

// AI product video must begin inside the commercial environment, never on the old flat studio plate.
for (const expected of [
  "selectKlingNaturalStartBackground",
  "Kling natural real-world start background selected",
  "gpt_image_2_natural_environment_fallback",
  "NO solid-color, monochrome, gradient, abstract",
  "naturalEnvironmentFromFirstFrame: true",
  "empty studio backdrop",
]) {
  assert(worker.includes(expected), `Natural Kling first-frame flow missing: ${expected}`);
}
assert(worker.includes("createKlingProductReferenceFrame(sourceImageBuffer, {"), "Kling reference must receive the real-world environment plate.");
assert(!worker.includes("Use a neutral generated backdrop rather than a blurred duplicate"), "The old synthetic studio-start implementation must stay removed.");

console.log(`v144.26 global UI + Pinterest video + plan count checks passed (${usedUiKeys.size} Content Studio UI keys, ${SUPPORTED_UI_LOCALES.length} locales)`);
