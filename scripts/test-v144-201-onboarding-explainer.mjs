import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const automation = read("app/automation/page.jsx");
const labels = read("lib/i18n/defaultLabels.js");
const globals = read("app/globals.css");
const css = read("app/styles/139-v144-201-onboarding-explainer.css");

assert.match(globals, /139-v144-201-onboarding-explainer\.css/);
assert.match(automation, /spreelo201-explainer/);
assert.match(automation, /\/onboarding-explainer\/website\.webp/);
assert.match(automation, /\/onboarding-explainer\/ai-content\.webp/);
assert.match(automation, /\/onboarding-explainer\/ready-posts\.webp/);
assert.match(automation, /spreelo199-personal-desktop/);
assert.match(automation, /spreelo191-ready-banner/);

for (const asset of [
  "public/onboarding-explainer/website.webp",
  "public/onboarding-explainer/ai-content.webp",
  "public/onboarding-explainer/ready-posts.webp",
]) {
  assert.ok(fs.existsSync(path.join(root, asset)), `Missing explainer asset ${asset}`);
}

for (const key of [
  "automation.onboardingV201.sectionAria",
  "automation.onboardingV201.websiteTitle",
  "automation.onboardingV201.websiteText",
  "automation.onboardingV201.aiTitle",
  "automation.onboardingV201.aiText",
  "automation.onboardingV201.readyTitle",
  "automation.onboardingV201.readyText",
  "automation.onboardingV201.sellTitle",
  "automation.onboardingV201.sellText",
  "automation.onboardingV201.followersTitle",
  "automation.onboardingV201.followersText",
  "automation.onboardingV201.timeTitle",
  "automation.onboardingV201.timeText",
]) {
  assert.ok(labels.includes(`"${key}"`), `Missing English source i18n key ${key}`);
}

assert.match(css, /grid-template-columns:minmax\(0,1fr\) 24px minmax\(0,1fr\) 24px minmax\(0,1fr\)/);
assert.match(css, /scroll-snap-type:x mandatory/);
assert.match(css, /spreelo201-benefit-sell/);
assert.match(css, /spreelo201-benefit-followers/);
assert.match(css, /spreelo201-benefit-time/);

console.log("v144.201 onboarding explainer regression checks passed");
