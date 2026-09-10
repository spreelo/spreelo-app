import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { ALL_UI_NAMESPACES, DEFAULT_UI_LOCALE, getDefaultLabelsForNamespaces } from "../lib/i18n/defaultLabels.js";
import { isLanguageNeutralUiSource } from "../lib/i18n/translationValidation.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));

assert.equal(DEFAULT_UI_LOCALE, "en", "English must be the only canonical UI source locale");
const defaults = getDefaultLabelsForNamespaces(ALL_UI_NAMESPACES);
assert.ok(Object.keys(defaults).length > 4000, "The centralized English UI source pack must remain complete");

const uiRoute = read("app/api/ui-translations/route.js");
for (const needle of [
  "source_fingerprints",
  "sourceFingerprint",
  "getLabelsNeedingTranslation",
  "claimTranslationPack",
  'error?.code !== "23505"',
  "waitForTranslationPack",
  "stripTranslationMetadata",
]) assert.ok(uiRoute.includes(needle), `UI translation engine missing ${needle}`);

const serverUi = read("lib/i18n/serverUiText.js");
for (const needle of ["source_fingerprints", "claimServerTranslationPack", "ui_translation_packs", "translateMissingLabels"])
  assert.ok(serverUi.includes(needle), `Server/email translation engine missing ${needle}`);

const hook = read("lib/i18n/useUiText.js");
for (const needle of [
  'TRANSLATION_CACHE_VERSION = "v26"',
  "validatedNamespacesByLocale",
  "areNamespacesValidatedForSession",
  "markNamespacesValidatedForSession",
]) assert.ok(hook.includes(needle), `Browser translation cache validation missing ${needle}`);

const staticEmail = read("lib/i18n/staticEmailText.js");
assert.ok(staticEmail.includes('getDefaultNamespaceLabels("emails")'), "Transactional emails must use the English emails source namespace");
assert.doesNotMatch(staticEmail, /["'](?:sv|da|no)["']\s*:/, "Transactional email source must not contain hand-authored Scandinavian translation packs");

const authEmail = read("supabase/functions/send-auth-email/index.ts");
assert.ok(authEmail.includes("/api/ui-translations"), "Supabase auth mail must fetch the persistent shared translation pack");
assert.doesNotMatch(authEmail, /copyByLocale|swedishSignInTranslator/, "Auth mail must not carry hand-written per-language copy maps");

const migration = read("supabase/v144_157_translation_cache_integrity.sql");
assert.ok(migration.includes("ui_translation_packs_locale_namespace_uidx"), "Translation cache must enforce one row per locale + namespace");
assert.ok(migration.includes("having count(*) > 1"), "Migration must fail visibly on existing duplicate packs rather than deleting translations");
assert.ok(exists("spreelo-v144.157-SQL.sql"), "Root deploy SQL must be included");
assert.equal(read("spreelo-v144.157-SQL.sql"), migration, "Root and Supabase v144.157 migrations must be identical");

// All literal t("...") calls must resolve to an English source key.
const sourceKeys = new Set(Object.keys(defaults));
const usedKeys = new Set();
const usedNamespaces = new Set();
function walk(dir) {
  for (const item of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, item.name);
    if (item.isDirectory()) walk(rel);
    else if (/\.(?:js|jsx|ts|tsx)$/.test(item.name)) {
      const text = read(rel);
      for (const match of text.matchAll(/\bt\(\s*(["'])([^"']+)\1/g)) usedKeys.add(match[2]);
      for (const match of text.matchAll(/useUiText\(\s*\[([^\]]*)\]/g)) {
        for (const entry of match[1].matchAll(/["']([^"']+)["']/g)) usedNamespaces.add(entry[1]);
      }
    }
  }
}
for (const dir of ["app", "components", "lib"]) walk(dir);
const missing = [...usedKeys].filter((key) => !sourceKeys.has(key));
assert.deepEqual(missing, [], `Literal UI keys missing from English source pack: ${missing.join(", ")}`);
const invalidNamespaces = [...usedNamespaces].filter((namespace) => !ALL_UI_NAMESPACES.includes(namespace));
assert.deepEqual(invalidNamespaces, [], `Unknown useUiText namespaces: ${invalidNamespaces.join(", ")}`);

// High-risk surfaces previously containing raw Swedish / bilingual branches.
const forbiddenByFile = {
  "components/LanguageSuggestionBanner.jsx": ["Växla till", "Fortsätt med", "Sidan visas just nu"],
  "components/HomeReferenceOverview.jsx": ["Planerat inlägg", "Nuvarande krediter", "Väntar på godkännande"],
  "app/admin/post-approvals/page.jsx": ["Produkt", "Pris", "Valuta", "MASSTEST", "Kopierar fellogg", "Bara text", "Bara bild"],
  "app/admin/rescue-center/page.jsx": ["Misslyckade analyser", "Misslyckade inlägg", "ÅRLIG FÖRNYELSE"],
  "app/styles/02-campaign-calendar.css": ['content: "Datum"', 'content: "Tid"'],
  "app/styles/03-planner-builder.css": ['content: "Datum"', 'content: "Tid"', "Du kan ändra allt senare"],
};
for (const [file, forbidden] of Object.entries(forbiddenByFile)) {
  const text = read(file);
  for (const phrase of forbidden) assert.ok(!text.includes(phrase), `${file} still contains raw translated UI copy: ${phrase}`);
}

assert.ok(read("components/StripeBillingPanel.jsx").includes('price.toLocaleString(locale || "en")'), "Billing prices must format with the selected app locale");
assert.ok(read("app/automation/page.jsx").includes('data-label={t("automation.dateColumn")}'), "Responsive DATE pseudo-label must come from i18n");
assert.ok(read("app/automation/page.jsx").includes('data-label={t("automation.timeColumn")}'), "Responsive TIME pseudo-label must come from i18n");

for (const neutral of ["Spreelo", "Facebook Reels", "OpenAI", "AI", "URL", "SEK", "PNG", "{imageUrl}"]) {
  assert.equal(isLanguageNeutralUiSource(neutral), true, `Language-neutral source must not be retranslated repeatedly: ${neutral}`);
}
assert.ok(uiRoute.includes("isLanguageNeutralUiSource(source)"), "UI translator must allow declared language-neutral source values to persist unchanged");
assert.ok(serverUi.includes("isLanguageNeutralUiSource(defaultText)"), "Server/email translator must not retranslate persisted language-neutral terms on every send");
assert.ok(!read("app/api/cron/run-automations/route.js").includes("Hitta ${CAMPAIGN_PRIMARY_WEB_RESEARCH_TARGET} passande produkter"), "Authored AI task prompts must use English as their base language");

console.log(`v144.157 persistent i18n integrity checks passed (${sourceKeys.size} English source keys, ${usedKeys.size} literal t() keys).`);
