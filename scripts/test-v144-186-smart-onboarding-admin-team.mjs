import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {
  SMART_ONBOARDING_GOALS,
  SMART_ONBOARDING_POST_COUNTS,
  getFallbackSmartOnboardingRecommendation,
} from "../lib/smartOnboardingPlan.js";
import { PLAN_ENTITLEMENTS } from "../lib/planEntitlements.js";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const automation = read("app/automation/page.jsx");
const labels = read("lib/i18n/defaultLabels.js");
const css = read("app/styles/125-v144-186-smart-onboarding-admin-team.css");
const adminAuth = read("lib/adminAuth.js");
const billing = read("components/StripeBillingPanel.jsx");
const teamRoute = read("app/api/admin/team/route.js");
const acceptRoute = read("app/api/admin-invite/accept/route.js");
const onboardingRoute = read("app/api/onboarding-plan/route.js");
const sql = read("spreelo-v144.186-SQL.sql");
const oldConsolidated = read("spreelo-v144.183-CONSOLIDATED-SQL.sql");
const consolidated = read("spreelo-v144.186-CONSOLIDATED-SQL.sql");

assert.deepEqual(SMART_ONBOARDING_GOALS, ["sell_more", "get_followers", "build_trust"]);
assert.deepEqual(SMART_ONBOARDING_POST_COUNTS, [3, 5, 7]);
assert.equal(getFallbackSmartOnboardingRecommendation({ brandProfile: { website_product_mode_available: true, business_name: "A", industry: "B", brand_description: "C", target_audience: "D", content_market: "E" }, connectedPlatformCount: 4 }).goalId, "sell_more");
assert.equal(getFallbackSmartOnboardingRecommendation({ brandProfile: { website_service_mode_available: true }, connectedPlatformCount: 1 }).goalId, "build_trust");

for (const key of [
  "automation.onboarding.whyTitle",
  "automation.onboarding.settingsTitle",
  "automation.onboarding.contentTypesTitle",
  "automation.onboarding.startDate",
  "automation.onboarding.estimatedCost",
  "automation.onboarding.activate",
  "automation.onboarding.review",
  "automation.onboarding.skip",
]) assert.ok(labels.includes(`\"${key}\"`), `Missing i18n key ${key}`);

assert.match(automation, /spreelo186-onboarding-modal/);
assert.match(automation, /automation\.onboardingV187\.recommendedTitle/);
assert.match(automation, /automation\.onboardingV187\.title/);
assert.match(automation, /automation\.onboardingV187\.variedContent/);
assert.match(automation, /automation\.onboarding\.estimatedCost/);
assert.match(automation, /smartOnboardingTypes\.map/);
assert.doesNotMatch(automation, /smartOnboardingTypes\.slice\(0,\s*4\)/);
assert.match(automation, /varyWeeklyContentTypes \? smartOnboardingTypeSummary/);
assert.match(automation, /normalizedEmail === SPREELO_INTERNAL_TESTER_EMAIL/);
assert.match(automation, /hasCampaignHandoff \|\| hasDirectPlan/);
assert.match(automation, /!isInternalTester && hasCompletedFirstPlan/);
assert.match(automation, /setHasCompletedFirstPlan\(true\)/);
assert.match(automation, /\/backgrounds\/spreelo-ai-studio-hero-mobile-v14379\.png/);
assert.match(css, /width:calc\(100vw - 24px\)/);
assert.match(css, /max-height:calc\(100dvh - 24px\)/);
assert.doesNotMatch(css, /\.spreelo186-onboarding-modal\s*\{[^}]*height:\s*100dvh/s);

assert.equal(PLAN_ENTITLEMENTS.starter.brands, 1);
assert.equal(PLAN_ENTITLEMENTS.growth.brands, 1);
assert.equal(PLAN_ENTITLEMENTS.pro.brands, 1);
assert.equal(PLAN_ENTITLEMENTS.starter.socialAccounts, 1);
assert.equal(PLAN_ENTITLEMENTS.growth.socialAccounts, 5);
assert.equal(PLAN_ENTITLEMENTS.pro.socialAccounts, null);
assert.equal(PLAN_ENTITLEMENTS.starter.recurringPlans, 1);
assert.equal(PLAN_ENTITLEMENTS.growth.recurringPlans, 3);
assert.equal(PLAN_ENTITLEMENTS.pro.recurringPlans, 5);
assert.match(billing, /audienceKey: "billing\.planAudienceGrowth", brands: 1, socialAccounts: 5, recurringPlans: 3/);
assert.match(billing, /audienceKey: "billing\.planAudiencePro", brands: 1, socialAccounts: null, recurringPlans: 5/);

assert.match(adminAuth, /spreelo_admin_team_members/);
assert.match(adminAuth, /canManageTeam: isPrimaryAdmin/);
assert.match(adminAuth, /hasAdminPlanLimitBypass/);
assert.match(teamRoute, /randomBytes\(32\)/);
assert.match(teamRoute, /createHash\("sha256"\)/);
assert.match(teamRoute, /48 \* 60 \* 60 \* 1000/);
assert.match(teamRoute, /if \(!context\.canManageTeam\)/);
assert.match(teamRoute, /Admin access could not be revoked safely/);
assert.match(teamRoute, /spreelo_admin: false/);
assert.match(acceptRoute, /spreelo_accept_admin_invite/);
assert.match(acceptRoute, /spreelo_admin: true/);
assert.match(sql, /for update;/i);
assert.match(sql, /accepted_at is not null/);
assert.match(sql, /expires_at <= now\(\)/);
assert.match(sql, /lower\(trim\(v_invite\.email\)\) <> v_email/);
assert.match(sql, /grant execute on function public\.spreelo_accept_admin_invite\(text, uuid, text\) to service_role/);
assert.match(sql, /when 'growth' then 5/);
assert.match(sql, /when 'pro' then 2147483647/);
assert.match(sql, /when 'pro' then 5/);
assert.ok(consolidated.startsWith(oldConsolidated), "v144.186 consolidated SQL must preserve v144.183 history exactly at the front");

assert.match(onboardingRoute, /SMART_ONBOARDING_GOALS/);
assert.match(onboardingRoute, /SMART_ONBOARDING_POST_COUNTS/);
assert.match(onboardingRoute, /Do not invent business facts/);

for (const file of [
  "app/api/meta/connect/route.js",
  "app/api/auth/threads/start/route.js",
  "app/api/auth/tiktok/start/route.js",
  "app/api/auth/pinterest/start/route.js",
  "app/api/auth/youtube/start/route.js",
  "app/api/auth/instagram/start/route.js",
]) {
  assert.match(read(file), /hasAdminPlanLimitBypass/);
}

console.log("v144.186 smart onboarding + admin team regression checks passed");
