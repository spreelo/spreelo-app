import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const automation = read("app/automation/page.jsx");
const labels = read("lib/i18n/defaultLabels.js");
const globals = read("app/globals.css");
const css = read("app/styles/130-v144-191-onboarding-variant5.css");

assert.match(automation, /createPortal/);
assert.match(automation, /document\.body/);
assert.match(automation, /spreelo191-ready-banner/);
assert.match(automation, /spreelo191-summary-grid/);
assert.match(automation, /spreelo191-planned/);
assert.match(automation, /SMART_ONBOARDING_PREVIEW_IMAGES/);
assert.match(automation, /\/social-channels/);
assert.match(automation, /spreelo191-social-add/);
assert.match(automation, /smartOnboardingPreviewPosts/);
assert.match(automation, /smartOnboardingSocialOptions/);
assert.match(automation, /automation\.onboardingV191\.oneTimeNote/);
assert.match(automation, /automation\.onboardingV191\.readyTitle/);
assert.match(automation, /automation\.onboardingV191\.plannedTitle/);
assert.doesNotMatch(automation.slice(automation.indexOf("spreelo191-backdrop"), automation.indexOf("<PlanLimitModal")), /ChevronRight/);

for (const key of [
  "automation.onboardingV191.titleLine1",
  "automation.onboardingV191.titleLine2",
  "automation.onboardingV191.intro",
  "automation.onboardingV191.readyTitle",
  "automation.onboardingV191.readySubtitle",
  "automation.onboardingV191.variedSummary",
  "automation.onboardingV191.costSummary",
  "automation.onboardingV191.channelsTitle",
  "automation.onboardingV191.addChannel",
  "automation.onboardingV191.plannedTitle",
  "automation.onboardingV191.oneTimeNote",
  "automation.onboardingV191.activate",
]) assert.ok(labels.includes(`"${key}"`), `Missing i18n key ${key}`);

assert.match(globals, /125-v144-186-smart-onboarding-admin-team\.css/);
assert.match(globals, /130-v144-191-onboarding-variant5\.css/);
assert.doesNotMatch(globals, /126-v144-187-onboarding-reference-match\.css/);
assert.doesNotMatch(globals, /127-v144-188-onboarding-final-match\.css/);
assert.doesNotMatch(globals, /128-v144-189-onboarding-pixel-polish\.css/);
assert.doesNotMatch(globals, /129-v144-190-onboarding-exact-rebuild\.css/);

assert.match(css, /z-index:\s*2147483600/);
assert.match(css, /color:\s*#fff\s*!important/);
assert.match(css, /width:\s*calc\(100vw - 8px\)/);
assert.match(css, /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
assert.match(css, /\.spreelo191-summary-channels\s*\{[\s\S]*display:\s*none\s*!important/s);
assert.match(css, /\.spreelo191-post-row\s*\{[\s\S]*overflow-x:\s*auto/s);

for (let i = 1; i <= 5; i += 1) {
  assert.ok(fs.existsSync(path.join(root, `public/onboarding-preview/post-${i}.png`)), `Missing preview image ${i}`);
}

assert.equal(fs.existsSync(path.join(root, "spreelo-v144.191-SQL.sql")), false, "v144.191 must not add SQL");

console.log("v144.191 onboarding Variant 5 regression checks passed");
