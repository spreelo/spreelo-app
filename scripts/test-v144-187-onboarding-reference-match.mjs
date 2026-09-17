import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const automation = read("app/automation/page.jsx");
const labels = read("lib/i18n/defaultLabels.js");
const globals = read("app/globals.css");
const css = read("app/styles/126-v144-187-onboarding-reference-match.css");

assert.match(globals, /125-v144-186-smart-onboarding-admin-team\.css/);
assert.match(globals, /126-v144-187-onboarding-reference-match\.css/);
assert.ok(globals.indexOf("126-v144-187-onboarding-reference-match.css") > globals.indexOf("125-v144-186-smart-onboarding-admin-team.css"));

for (const key of [
  "automation.onboardingV187.title",
  "automation.onboardingV187.intro",
  "automation.onboardingV187.recommendedTitle",
  "automation.onboardingV187.frequencyHelp",
  "automation.onboardingV187.variedContent",
  "automation.onboardingV187.startNote",
  "automation.onboardingV187.activate",
]) assert.ok(labels.includes(`\"${key}\"`), `Missing i18n key ${key}`);

assert.match(automation, /spreelo187-onboarding-reference/);
assert.match(automation, /spreelo187-recommended-plan/);
assert.match(automation, /spreelo187-plan-grid/);
assert.match(automation, /desktop-support-card/);
assert.match(automation, /currentBrandProfile\?\.logo_url/);
assert.match(automation, /smartOnboardingTypeSummary/);
assert.match(automation, /smartOnboardingChannelSummary/);
assert.match(automation, /smartOnboardingGoalSummary/);
assert.match(automation, /automation\.onboardingV18(?:7|8)\.title/);
assert.match(automation, /automation\.onboardingV187\.recommendedTitle/);
assert.match(automation, /automation\.onboardingV187\.variedContent/);
assert.doesNotMatch(automation.slice(automation.indexOf('{showSmartOnboarding ? ('), automation.indexOf('<PlanLimitModal')), /automation\.onboarding\.skip/);
assert.doesNotMatch(automation.slice(automation.indexOf('{showSmartOnboarding ? ('), automation.indexOf('<PlanLimitModal')), /spreelo186-onboarding-scroll/);

assert.match(css, /width:\s*min\(560px, calc\(100vw - 28px\)\)/);
assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /\.spreelo187-plan-grid \.desktop-support-card\s*\{\s*display:\s*none;/s);
assert.match(css, /@media \(max-width: 720px\)/);
assert.match(css, /grid-template-columns:\s*1fr;/);
assert.match(css, /overflow:\s*visible;/);
assert.match(css, /max-height:\s*calc\(100dvh - 16px\)/);
assert.match(css, /@media \(max-width: 720px\) and \(max-height: 690px\)/);

assert.equal(fs.existsSync(path.join(root, "spreelo-v144.187-SQL.sql")), false, "v144.187 must remain a UI-only release with no SQL migration");

console.log("v144.187 onboarding reference-match regression checks passed");
