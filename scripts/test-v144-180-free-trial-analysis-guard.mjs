import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const freeTrial = read('lib/freeTrial.js');
const migration = read('supabase/v144_180_free_trial_social_abuse_analysis_limits.sql');
const checkout = read('app/api/stripe/checkout/route.js');
const webhook = read('app/api/stripe/webhook/route.js');
const stripeBilling = read('lib/stripeBilling.js');
const entitlements = read('lib/planEntitlements.js');
const status = read('app/api/stripe/status/route.js');
const startAnalysis = read('app/api/analyze-brand/start/route.js');
const legacyAnalysis = read('app/api/analyze-brand/route.js');
const analysisEngine = read('app/api/analyze-brand/brandAnalysisEngine.js');
const alerts = read('lib/analysisUsageAlerts.js');
const labels = read('lib/i18n/defaultLabels.js');
const brandPage = read('app/brand/page.jsx');
const socialPage = read('app/social-channels/page.jsx');
const pinterestCallback = read('app/api/auth/pinterest/callback/route.js');
const onboarding = read('app/onboarding/page.jsx');
const appLayout = read('components/AppLayout.jsx');
const dashboard = read('app/page.jsx');
const settings = read('app/settings/page.jsx');
const automation = read('app/automation/page.jsx');
const deleteAccount = read('app/api/delete-account/route.js');
const automationWorker = read('app/api/cron/run-automations/route.js');

// Cardless trial architecture.
assert.match(freeTrial, /SPREELO_FREE_TRIAL_CREDITS\s*=\s*100/);
assert.match(freeTrial, /SPREELO_FREE_TRIAL_DAYS\s*=\s*14/);
assert.match(freeTrial, /createHmac\("sha256"/);
assert.match(freeTrial, /SPREELO_TRIAL_FINGERPRINT_SECRET/);
assert.doesNotMatch(freeTrial, /SPREELO_TRIAL_FINGERPRINT_SECRET[\s\S]{0,120}SUPABASE_SERVICE_ROLE_KEY/);
assert.match(freeTrial, /preflightSocialConnectionForTrial/);
assert.match(freeTrial, /authorizeSocialConnectionForTrial/);
assert.match(freeTrial, /p_external_account_id:/);
assert.doesNotMatch(checkout, /trial_period_days/);
assert.doesNotMatch(checkout, /body\?\.trial/);
assert.doesNotMatch(checkout, /getTrialEligibility/);
assert.doesNotMatch(stripeBilling, /getTrialEligibility/);
assert.match(status, /const freeTrial = \{/);
assert.match(webhook, /p_is_trial:\s*false/);
assert.match(webhook, /p_trial_credits:\s*0/);
assert.match(webhook, /markFreeTrialUsedForPaidPlan/);

// Free can connect exactly one channel to activate the trial.
assert.match(entitlements, /free:\s*Object\.freeze\(\{[\s\S]*?socialAccounts:\s*1/);
assert.match(migration, /when 'starter' then 1[\s\S]*?when 'growth' then 5[\s\S]*?when 'pro' then 2147483647[\s\S]*?else 1/);

// Server-only social claim and durable one-account protection.
assert.match(migration, /unique\(platform, account_fingerprint\)/);
assert.match(migration, /claim_spreelo_social_trial\([\s\S]*?p_external_account_id text/);
assert.match(migration, /revoke all on function public\.claim_spreelo_social_trial\(uuid,uuid,text,text,text,text\) from public,anon,authenticated/);
assert.match(migration, /grant execute on function public\.claim_spreelo_social_trial\(uuid,uuid,text,text,text,text\) to service_role/);
assert.match(migration, /Verified social connection must be saved before trial activation/);
assert.match(migration, /page_access_token=null, refresh_token=null/);
assert.match(freeTrial, /socialClaim\.user_id === userId[\s\S]*free_trial_status[\s\S]*=== "active"/);
assert.match(migration, /v_social_claim\.user_id = p_user_id and v_balance\.free_trial_status = 'active'/);
assert.match(migration, /plan_state=case[\s\S]*'ended'/);
assert.match(migration, /credit_reservation_status='reserved'/);
assert.match(migration, /spreelo-free-trial-domain:/);
assert.match(migration, /drop function if exists public\.claim_spreelo_trial_business/);
assert.match(migration, /drop function if exists public\.mark_spreelo_trial_business/);
assert.match(migration, /initialize_new_credit_balance_free_v144180/);
assert.match(migration, /set free_trial_status = 'used'/);
assert.match(migration, /spreelo_is_plan_limit_admin\(user_id\)/);
assert.match(migration, /delete from public\.trial_business_claims[\s\S]*status = 'pending'/);
assert.match(migration, /drop trigger if exists user_credit_balances_free_default_v14378/);
assert.match(migration, /drop function if exists public\.initialize_new_credit_balance_free_v14378/);

// OAuths must preflight, save, then atomically claim. This prevents both UX
// regressions and the "credits granted but connection save failed" edge case.
const socialFlows = [
  ['app/api/auth/instagram/callback/route.js', 'saveInstagramConnection'],
  ['app/api/auth/threads/callback/route.js', 'saveThreadsConnection'],
  ['app/api/auth/tiktok/callback/route.js', 'saveTikTokConnection'],
  ['app/api/auth/youtube/callback/route.js', 'saveYouTubeConnection'],
  ['app/api/meta/page-selection/route.js', 'saveFacebookConnection'],
];
for (const [path, saveName] of socialFlows) {
  const src = read(path);
  const preflight = src.indexOf('preflightSocialConnectionForTrial({');
  const save = src.indexOf(`${saveName}({`, preflight);
  const claim = src.indexOf('authorizeSocialConnectionForTrial({', save);
  assert.ok(preflight >= 0 && save > preflight && claim > save, `${path} must preflight -> save -> claim`);
}
const pinterestPreflight = pinterestCallback.indexOf('preflightSocialConnectionForTrial({');
const pinterestSavePending = pinterestCallback.indexOf('savePendingPinterestConnection({');
assert.ok(pinterestPreflight >= 0 && pinterestSavePending > pinterestPreflight, 'Pinterest must reject reused trial identity before persisting OAuth tokens');
assert.match(pinterestCallback, /getTrialRestrictionCode/);

const pinterest = read('app/api/pinterest/boards/route.js');
assert.match(pinterest, /preflightSocialConnectionForTrial/);
assert.match(pinterest, /activatePinterestBoard/);
assert.match(pinterest, /authorizeSocialConnectionForTrial/);

// Locked credits are visible but remain non-spendable until social verification.
for (const src of [appLayout, dashboard, settings]) {
  assert.match(src, /free_trial_status/);
  assert.match(src, /free_trial_credit_amount/);
}
assert.match(appLayout, /isLockedFreeTrial/);
assert.match(appLayout, /refresh_spreelo_free_trial_state/);
assert.match(automation, /freeTrialLocked/);
assert.match(automation, /plannerFreeTrialLocked/);
assert.match(automation, /free_trial_credit_amount \|\| 100/);
assert.match(automation, /automation\.freeTrialLockedCredits/);
assert.match(automationWorker, /refreshFreeTrialStateForUser/);
assert.match(automationWorker, /free_trial_credit_gate/);
assert.ok(automationWorker.indexOf('free_trial_credit_gate') < automationWorker.indexOf('automationCurrentStage = "carousel_product_prepare"'), 'Free-trial credit gate must run before carousel/product AI generation');
assert.match(socialPage, /social\.trialRestrictionPlans/);

// Analysis quotas: exact plan limits, stable per-account timezone, both public
// customer entry points guarded, internal worker engine excluded.
for (const [plan, daily, monthly] of [
  ['starter', 3, 10], ['growth', 6, 25], ['pro', 10, 50],
]) {
  assert.match(migration, new RegExp(`when '${plan}' then jsonb_build_object\\('daily',${daily},'monthly',${monthly}\\)`));
}
assert.match(migration, /else jsonb_build_object\('daily',2,'monthly',4\)/);
assert.match(migration, /analysis_quota_timezone/);
assert.match(migration, /interval '1 minute'/);
assert.match(migration, /brand_analysis_limit_hit_counters/);
assert.match(migration, /blockedCount/);
assert.match(migration, /drop function if exists public\.release_spreelo_brand_analysis_quota\(text\)/);
assert.match(migration, /revoke all on function public\.release_spreelo_brand_analysis_quota\(uuid,text\) from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.release_spreelo_brand_analysis_quota\(uuid,text\) to service_role/);
assert.doesNotMatch(migration, /grant execute on function public\.release_spreelo_brand_analysis_quota\(text\) to authenticated/);
assert.doesNotMatch(migration, /'requestKey',p_request_key/);
assert.match(startAnalysis, /claim_spreelo_brand_analysis_quota/);
assert.match(startAnalysis, /admin\.rpc\("release_spreelo_brand_analysis_quota"/);
assert.match(startAnalysis, /p_user_id:\s*user\.id/);
assert.doesNotMatch(startAnalysis, /supabase\.rpc\("release_spreelo_brand_analysis_quota"/);
assert.match(startAnalysis, /publicAnalysisUsage/);
assert.match(legacyAnalysis, /claim_spreelo_brand_analysis_quota/);
assert.match(legacyAnalysis, /publicAnalysisUsage/);
assert.doesNotMatch(analysisEngine, /claim_spreelo_brand_analysis_quota/);
assert.match(brandPage, /brand\.analysisUsage\.today/);
assert.match(brandPage, /brand\.analysisLimit\.monthlyText/);
assert.match(onboarding, /resolvedOptions\(\)\.timeZone/);

// Admin alert policy sends at most one threshold alert per accepted analysis.
assert.match(alerts, /let candidate = null/);
assert.match(alerts, /else if \(dailyLimit > 0 && dailyCount >= dailyLimit\)/);
assert.match(alerts, /else if \(isMonthlyUsageUnusuallyEarly\(localDay, monthlyCount, monthlyLimit\)\)/);
assert.doesNotMatch(alerts, /const candidates = \[\]/);
assert.match(alerts, /brand_reanalysis_burst/);
assert.match(alerts, /repeated_limit_hits/);
assert.match(alerts, /isMonthlyUsageUnusuallyEarly/);
assert.match(alerts, /usageShare - monthProgress >= 0\.15/);
assert.match(alerts, /brand_analysis_usage_events/);

// Account deletion keeps only abuse fingerprints/domain history, not user links.
assert.match(deleteAccount, /trial_social_account_claims/);
assert.match(deleteAccount, /user_id:\s*null/);
assert.match(deleteAccount, /brand_profile_id:\s*null/);
assert.match(deleteAccount, /brand_analysis_usage_events/);
assert.match(deleteAccount, /brand_analysis_limit_hit_counters/);
assert.match(migration, /spreelo_anonymize_deleted_brand_history_v144180/);

// Every new customer-facing string has an English source key.
// Obsolete Stripe-gated trial copy is no longer part of the active source catalog.
for (const staleKey of [
  'billing.trialOfferTitle',
  'billing.trialOfferText',
  'billing.trialWebsiteTitle',
  'billing.trialWebsiteText',
  'billing.startTrial',
  'emails.trialEnding.subject',
  'emails.trialEnding.text',
]) {
  assert.ok(!labels.includes(`"${staleKey}"`), `obsolete Stripe-trial label still present: ${staleKey}`);
}


assert.ok(!labels.includes('active Spreelo subscription or free trial'), 'stale Stripe-era recurring-plan copy remains');

for (const key of [
  'brand.analysisUsage.title',
  'brand.analysisUsage.today',
  'brand.analysisUsage.month',
  'brand.analysisLimit.dailyTitle',
  'brand.analysisLimit.monthlyTitle',
  'brand.analysisLimit.cooldownTitle',
  'social.trialRestrictionTitle',
  'social.trialAccountUsedTitle',
  'social.trialBusinessUsedTitle',
  'social.trialRestrictionPlans',
  'billing.freeTrialLockedTitle',
  'billing.freeTrialActiveTitle',
  'billing.freeTrialUsedTitle',
  'layout.freeTrialCreditsLocked',
  'dashboard.freeTrialCreditsLocked',
  'automation.freeTrialLockedCredits',
]) {
  assert.ok(labels.includes(`"${key}"`), `missing i18n source key ${key}`);
}

console.log('v144.180 cardless trial + abuse protection + analysis quota regression checks passed');
