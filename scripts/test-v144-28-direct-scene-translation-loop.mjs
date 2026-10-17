import fs from "node:fs";
import assert from "node:assert/strict";
import { validateGeneratedUiTranslation } from "../lib/i18n/translationValidation.js";

const read = (file) => fs.readFileSync(file, "utf8");
const worker = read("app/api/cron/run-automations/route.js");
const finalizer = read("app/api/cron/finalize-kling-videos/route.js");
const shotstack = read("lib/shotstack.js");
const translationRoute = read("app/api/ui-translations/route.js");

// Legitimately identical words may be accepted only when the translator explicitly declares intent.
assert.equal(
  validateGeneratedUiTranslation({
    sourceText: "Admin",
    translatedText: "Admin",
    locale: "sv",
    allowUnchanged: true,
  }).valid,
  true
);
assert.equal(
  validateGeneratedUiTranslation({
    sourceText: "Giveaway",
    translatedText: "Giveaway",
    locale: "sv",
    allowUnchanged: false,
  }).valid,
  false
);
assert(translationRoute.includes('__intentional_unchanged_keys'));
assert(translationRoute.includes('TRANSLATION_META_KEY = "__spreelo_translation_meta"'));
assert(translationRoute.includes('intentionalUnchangedKeys?.has(String(key))'));
assert(translationRoute.includes('targetLocaleRequiresLocalizedScript'));
assert(translationRoute.includes('stripTranslationMetadata'));

// A real in-scene first frame is generated. The separate opening identity gate
// was intentionally removed; final-video inspection remains independent.
for (const expected of [
  "generateKlingDirectSceneOpeningFrame",
  "Kling direct-scene opening frame generated",
  'openingIdentityReview: "disabled"',
  'openingSceneMode = "direct_scene"',
  "gpt_image_2_direct_scene",
  "NO visual state where the product is simply centered against a background waiting for the video to begin.",
]) {
  assert(worker.includes(expected), `Missing direct-scene safeguard: ${expected}`);
}
assert(!worker.includes('reviewKlingOpeningSceneIdentity'));

// Real generation failures still preserve a diagnostic fallback; trim contracts remain intact.
assert(worker.includes('pixel_preserving_setup_fully_trimmed'));
assert(worker.includes('klingSceneTrimSeconds = 1.9;'));
assert(worker.includes('KLING_NATURAL_SCENE_TRIM_SECONDS'));
assert(worker.includes('scene_trim_start_seconds: klingSceneTrimSeconds'));
assert(finalizer.includes('Number(postprocess.scene_trim_start_seconds ?? 1.9) || 1.9'));
assert(shotstack.includes('trimStartSeconds = 0'));
assert(shotstack.includes('trim: trimStart'));

console.log("v144.28 direct-scene Kling opening + translation-loop checks passed");
