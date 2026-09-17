import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const automation = read("app/automation/page.jsx");
const labels = read("lib/i18n/defaultLabels.js");
const globals = read("app/globals.css");
const css = read("app/styles/127-v144-188-onboarding-reference-exact.css");

assert.match(globals, /126-v144-187-onboarding-reference-match\.css/);
assert.match(globals, /127-v144-188-onboarding-reference-exact\.css/);
assert.ok(globals.indexOf("127-v144-188-onboarding-reference-exact.css") > globals.indexOf("126-v144-187-onboarding-reference-match.css"));

for (const key of [
  "automation.onboardingV188.title",
  "automation.onboardingV188.intro",
]) assert.ok(labels.includes(`\"${key}\"`), `Missing i18n key ${key}`);

assert.match(automation, /spreelo188-onboarding-reference/);
assert.match(automation, /automation\.onboardingV188\.title/);
assert.match(automation, /automation\.onboardingV188\.intro/);
assert.match(automation, /spreelo188-mobile-chevron/);
assert.match(automation, /spreelo188-onboarding-visual-spark/);
assert.doesNotMatch(automation.slice(automation.indexOf('{showSmartOnboarding ? ('), automation.indexOf('<PlanLimitModal')), /spreelo187-onboarding-brand-logo/);

assert.match(css, /width:\s*min\(680px, calc\(100vw - 36px\)\)/);
assert.match(css, /-webkit-line-clamp:\s*unset/);
assert.match(css, /width:\s*calc\(100vw - 16px\)/);
assert.match(css, /grid-template-columns:\s*35px minmax\(0, 1fr\) 18px/);
assert.match(css, /\.spreelo188-mobile-chevron\s*\{[\s\S]*display:\s*block/);
assert.match(css, /@media \(max-width: 720px\) and \(max-height: 690px\)/);
assert.equal(fs.existsSync(path.join(root, "spreelo-v144.188-SQL.sql")), false, "v144.188 must remain UI-only with no SQL migration");

console.log("v144.188 exact onboarding reference calibration checks passed");
