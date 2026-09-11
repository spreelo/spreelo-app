import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { isLanguageNeutralUiSource } from "../lib/i18n/translationValidation.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const home = read("components/HomeReferenceOverview.jsx");
const automation = read("app/automation/page.jsx");
const labels = read("lib/i18n/defaultLabels.js");
const uiRoute = read("app/api/ui-translations/route.js");
const social = read("app/social-channels/page.jsx");

assert.equal(isLanguageNeutralUiSource("Kling · AI video"), true, "Kling system label must be intentionally language-neutral");
assert.ok(labels.includes('"adminCommand.system.name.kling": "Kling · AI video"'), "Kling admin source label must remain English and unchanged");
assert.ok(uiRoute.includes("function seedLanguageNeutralLabels(defaultLabels, labels)"), "UI translation route must seed language-neutral source values without AI");
assert.ok(uiRoute.includes("isLanguageNeutralUiSource(defaultText)"), "UI translation route must skip neutral labels before translation");
assert.ok(uiRoute.includes("seedLanguageNeutralLabels(defaultLabels, existingPack?.labels || {})"), "Existing locale packs must receive neutral defaults before missing-label calculation");

assert.ok(home.includes("function getKnownContentTypeLabel(value, t)"), "Home must have a stable-id translation map for known content types");
assert.ok(home.includes("return getKnownContentTypeLabel(item?.content_type_id, t)"), "Home planned item title must prefer stable content type id");
assert.ok(home.includes("plannedItemTypeLabel(item, t)"), "Home type display must resolve known content_type_id values before legacy stored labels");
assert.ok(home.includes('website_item: t("homeReference.type.productPost")'), "Product post must render through the English-source i18n key");
assert.ok(labels.includes('"homeReference.type.productPost": "Product post"'), "Product post source label must stay English");
assert.ok(!home.includes("Produktinlägg"), "Swedish product label must not be hardcoded into Home UI");

assert.ok(automation.includes("function getCanonicalContentTypeLabel(contentTypeId"), "Automation must expose canonical content-type persistence helper");
assert.ok(automation.includes("if (type?.label) return String(type.label).trim();"), "Known content types must persist their English source label");
assert.ok(automation.includes("content_type_label: getCanonicalContentTypeLabel("), "Automation rules must persist canonical labels instead of translated UI labels");
assert.ok(!automation.includes("content_type_label: getUnifiedContentTypeLabel("), "Localized UI labels must not be persisted as rule data");

// Scope guard: Social Channels stays outside this UI/i18n patch.
const socialDigest = crypto.createHash("sha256").update(social).digest("hex");
assert.equal(
  socialDigest,
  "e5ceb52162b981283f11cb34b0345b056157927cade1cf888b72cbd7d0254ee8",
  "Social Channels must remain byte-for-byte identical to the verified baseline"
);

console.log("v144.163 neutral Kling label + canonical content type regression checks passed.");
