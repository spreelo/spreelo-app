import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { SPREELO_LANGUAGE_CATALOG, SUPPORTED_CONTENT_LANGUAGES } from "../lib/languageCatalog.js";
import { SUPPORTED_UI_LOCALES } from "../lib/i18n/defaultLabels.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

assert.equal(SPREELO_LANGUAGE_CATALOG.length, 30, "Spreelo must expose exactly the 30 official languages in the shared catalogue");
assert.equal(SUPPORTED_CONTENT_LANGUAGES.length, 30, "All 30 app languages must also be valid content languages");
assert.deepEqual(
  SUPPORTED_UI_LOCALES.map(({ locale, language }) => [locale, language]),
  SUPPORTED_CONTENT_LANGUAGES.map(({ locale, language }) => [locale, language]),
  "App language and content language catalogues must stay aligned"
);
assert.equal(new Set(SPREELO_LANGUAGE_CATALOG.map((item) => item.locale)).size, 30, "Locale codes must be unique");
assert.equal(new Set(SPREELO_LANGUAGE_CATALOG.map((item) => item.language)).size, 30, "Canonical language names must be unique");

const automation = read("app/automation/page.jsx");
assert.ok(automation.includes('SUPPORTED_CONTENT_LANGUAGES.map((item)'), "AI Content Studio must build its language menu from the 30-language catalogue");
assert.ok(automation.includes('content_market, content_language"'), "AI Content Studio must load the current brand default content language");
assert.ok(automation.includes("const brandDefaultPostLanguage = brandProfileData?.content_language"), "New plans must inherit the brand default post language");
assert.ok(automation.includes('defaultContentLanguage: brandProfileData?.content_language || ""'), "Campaign handoff must receive the brand default language");
assert.ok(automation.includes('t("automation.languageAutoBrandDefault")'), "The automatic fallback option must be clearly named instead of impersonating the app language");
assert.ok(!automation.includes('{ value: "Svenska", label: "Svenska" }'), "The old hand-maintained short language list must be removed");

const brand = read("app/brand/page.jsx");
assert.ok(brand.includes("SUPPORTED_CONTENT_LANGUAGES.map((item) => item.language)"), "Brand Profile must offer all 30 content languages");

const create = read("app/create/page.jsx");
assert.ok(create.includes("const languageOptions = SUPPORTED_CONTENT_LANGUAGES"), "Manual post creation must use the same 30-language catalogue");

const settings = read("app/settings/page.jsx");
const settingsPanels = read("components/SettingsPanels.jsx");
assert.ok(settings.includes('select("id, business_name, website_url, content_language, is_default, created_at")'), "Settings must load the brand content language");
assert.ok(settings.includes('content_language: normalizedLanguage'), "Settings must save the default post language on the current brand");
assert.ok(settingsPanels.includes('t("settings.defaultPostLanguageHeading")'), "Settings language tab must expose the default post language control");
assert.ok(settingsPanels.includes("supportedContentLanguages.map"), "Settings default post language must offer all 30 languages");
assert.ok(settingsPanels.includes("defaultPostLanguageDraft === savedDefaultPostLanguage"), "Settings must distinguish saved and unsaved language selections");

const login = read("app/login/page.jsx");
const polishCss = read("app/styles/122-v144-159-language-logo-login-polish.css");
assert.ok((login.match(/login-action-spinner/g) || []).length >= 3, "Send, verify and resend login actions must expose a spinner while working");
assert.ok(polishCss.includes("@keyframes spreelo-login-action-spin"), "Login spinner animation must be defined");

const cron = read("app/api/cron/run-automations/route.js");
assert.ok(cron.includes("Math.round(baseWidth * 0.165), 210"), "Generated top-left image logos must use the larger v144.159 size");
assert.ok(cron.includes("Math.round(baseWidth * 0.185), 240"), "Generated bottom-right image logos must be slightly larger too");
assert.ok((cron.match(/Math\.round\(baseWidth \* 0\.165\), 210/g) || []).length >= 2, "Both standard and editorial top-left logo paths must share the larger size");
assert.ok(polishCss.includes("width: 16.5% !important"), "Brand-profile example must mirror the larger generated-post logo");
assert.ok(polishCss.includes("height: 44px !important"), "Change/remove logo buttons must have the same explicit height");

console.log("v144.159 language/defaults/login/logo regression checks passed.");
