import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const automation = read("app/automation/page.jsx");
const labels = read("lib/i18n/defaultLabels.js");
const globals = read("app/globals.css");
const css = read("app/styles/127-v144-188-onboarding-final-match.css");

assert.match(globals, /126-v144-187-onboarding-reference-match\.css/);
assert.match(globals, /127-v144-188-onboarding-final-match\.css/);
assert.ok(globals.indexOf("127-v144-188-onboarding-final-match.css") > globals.indexOf("126-v144-187-onboarding-reference-match.css"));

for (const key of [
  "automation.onboardingV187.title",
  "automation.onboardingV187.intro",
  "automation.onboardingV187.recommendedTitle",
]) assert.ok(labels.includes(`\"${key}\"`), `Missing i18n key ${key}`);

assert.match(labels, /automation\.onboardingV187\.title\": \"Get started with your AI content studio\"/);
assert.match(automation, /spreelo188-onboarding-reference-image/);
assert.match(automation, /spreelo-onboarding-reference-room\.png/);
assert.match(automation, /smartOnboardingMarketCardText/);
assert.match(automation, /smartOnboardingTypeSummaryCompact/);
assert.match(automation, /smartOnboardingChannelSummaryCompact/);
assert.match(automation, /className=\"chevron\"/);
assert.doesNotMatch(automation.slice(automation.indexOf('{showSmartOnboarding ? ('), automation.indexOf('<PlanLimitModal')), /spreelo187-onboarding-brand-logo/);

assert.match(css, /width:\s*min\(646px, calc\(100vw - 28px\)\)/);
assert.match(css, /display:\s*block;\s*overflow:\s*visible;/s);
assert.match(css, /width:\s*calc\(100vw - 24px\)/);
assert.match(css, /max-width:\s*none/);
assert.match(css, /grid-template-columns:\s*34px minmax\(0, 1fr\) 16px/);
assert.match(css, /\.spreelo187-plan-grid \.chevron\s*\{[\s\S]*display:\s*inline-flex/);
assert.equal(fs.existsSync(path.join(root, "spreelo-v144.188-SQL.sql")), false, "v144.188 must remain UI-only with no SQL migration");

console.log("v144.188 exact onboarding reference calibration checks passed");
