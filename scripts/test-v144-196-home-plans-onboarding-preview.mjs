import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const home = read("components/HomeReferenceOverview.jsx");
const automation = read("app/automation/page.jsx");
const labels = read("lib/i18n/defaultLabels.js");
const globals = read("app/globals.css");
const css = read("app/styles/135-v144-196-home-plans-onboarding-preview.css");

assert.match(globals, /135-v144-196-home-plans-onboarding-preview\.css/);

// Home: all three categories use the exact same isolated section contract.
for (const kind of ["recurring", "scheduled", "campaign"]) {
  assert.match(home, new RegExp(`<section className="home-plan-overview-card ${kind} home-plan-section-v153 home-plan-section-v196">`));
}
assert.equal((home.match(/home-plan-section-v196/g) || []).length, 3, "Expected exactly three v196 Home plan sections");
assert.match(css, /home-reference-plans-v153 > section\.home-plan-section-v196/);
assert.match(css, /grid-template-areas:\s*\n\s*"icon copy"\s*\n\s*"\. action"/);
assert.match(css, /section\.home-plan-section-v196 > \.home-plan-section-head-v153 > \.home-plan-overview-icon/);
assert.match(css, /section\.home-plan-section-v196 > \.home-plan-section-head-v153 > \.home-plan-overview-copy/);
assert.match(css, /section\.home-plan-section-v196 > \.home-plan-section-head-v153 > \.home-plan-overview-action/);

// Loader: hard-center the entire mobile loading card in the viewport.
assert.match(css, /\.workspace-loader-page[\s\S]*position:fixed\s*!important/);
assert.match(css, /\.workspace-loader-page[\s\S]*place-items:center\s*!important/);
assert.match(css, /\.workspace-loader-card[\s\S]*justify-self:center\s*!important/);
assert.match(css, /\.workspace-loader-card[\s\S]*align-self:center\s*!important/);

// Onboarding planned posts: reference-style cards with date badge, image, icon footer and carousel controls.
assert.match(automation, /spreelo196-planned/);
assert.match(automation, /spreelo196-post-carousel/);
assert.match(automation, /spreelo196-date-badge/);
assert.match(automation, /spreelo196-post-footer/);
assert.match(automation, /SMART_ONBOARDING_PREVIEW_ICON_COMPONENTS/);
assert.match(automation, /scrollSmartOnboardingPreview/);
assert.match(automation, /automation\.onboardingV196\.previousPosts/);
assert.match(automation, /automation\.onboardingV196\.nextPosts/);
assert.match(css, /\.spreelo196-post-card[\s\S]*border-radius:18px/);
assert.match(css, /\.spreelo196-date-badge[\s\S]*position:absolute/);
assert.match(css, /\.spreelo196-post-footer[\s\S]*grid-template-columns:42px minmax\(0,1fr\)/);

// New fixed UI copy remains English-first and key-driven.
assert.match(labels, /"automation\.onboardingV196\.previousPosts": "Previous planned posts"/);
assert.match(labels, /"automation\.onboardingV196\.nextPosts": "Next planned posts"/);
assert.doesNotMatch(automation.slice(automation.indexOf("spreelo196-planned"), automation.indexOf("spreelo191-mobile-channels")), /[ÅÄÖåäö]/);

assert.equal(fs.existsSync(path.join(root, "spreelo-v144.196-SQL.sql")), false, "v144.196 must not add SQL");

console.log("v144.196 Home parity + onboarding preview checks passed");
