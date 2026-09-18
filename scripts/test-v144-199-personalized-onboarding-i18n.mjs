import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const automation = read("app/automation/page.jsx");
const labels = read("lib/i18n/defaultLabels.js");
const globals = read("app/globals.css");
const css = read("app/styles/138-v144-199-personalized-onboarding-i18n.css");
const teamPage = read("app/admin/team/page.jsx");
const teamRoute = read("app/api/admin/team/route.js");
const invitePage = read("app/admin-invite/page.jsx");
const inviteRoute = read("app/api/admin-invite/accept/route.js");

assert.match(globals, /138-v144-199-personalized-onboarding-i18n\.css/);
assert.match(automation, /spreelo199-personal-desktop/);
assert.match(automation, /spreelo199-personal-mobile/);
assert.match(automation, /currentBrandProfile\?\.target_audience/);
assert.match(automation, /automation\.onboardingV199\.personalizedTitle/);
assert.match(automation, /automation\.onboardingV199\.whySell/);
assert.match(automation, /automation\.onboardingV199\.whyFollowers/);
assert.match(automation, /automation\.onboardingV199\.whyTrust/);
assert.doesNotMatch(automation, /spreelo199[^\n]*showMore/);
assert.doesNotMatch(css, /show-more|showMore/i);

for (const key of [
  "automation.onboardingV199.personalizedTitle",
  "automation.onboardingV199.personalizedMobileTitle",
  "automation.onboardingV199.marketFallback",
  "automation.onboardingV199.offeringProducts",
  "automation.onboardingV199.offeringServices",
  "automation.onboardingV199.offeringMixed",
  "automation.onboardingV199.offeringGeneral",
  "automation.onboardingV199.reasonLabel",
  "automation.onboardingV199.reasonCardTitle",
  "automation.onboardingV199.whySell",
  "automation.onboardingV199.whyFollowers",
  "automation.onboardingV199.whyTrust",
  "adminTeam.error.primaryOnly",
  "adminTeam.error.invalidEmail",
  "adminInvite.error.expired",
  "adminInvite.error.emailMismatch",
  "adminInvite.error.sync",
]) {
  assert.ok(labels.includes(`"${key}"`), `Missing English source i18n key ${key}`);
}

assert.match(teamRoute, /code: "ADMIN_TEAM_PRIMARY_ONLY"/);
assert.match(teamRoute, /code: "ADMIN_TEAM_INVALID_EMAIL"/);
assert.match(teamPage, /adminTeamApiErrorKeys/);
assert.doesNotMatch(teamPage, /payload\?\.error \|\| t\("adminTeam/);
assert.match(inviteRoute, /ADMIN_INVITE_EXPIRED/);
assert.match(inviteRoute, /ADMIN_INVITE_EMAIL_MISMATCH/);
assert.match(invitePage, /adminInviteApiErrorKeys/);
assert.doesNotMatch(invitePage, /payload\?\.error \|\| t\("adminInvite/);

assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(css, /@media \(max-width:720px\)/);
assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);

console.log("v144.199 personalized onboarding + i18n regression checks passed");
