import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sql = read('supabase/v144_111_rescue_credit_lifecycle_localized_failure_email.sql');
const failSql = sql.split('create or replace function public.cancel_failed_automation_occurrence_and_refund')[0];
const refundSql = sql.split('create or replace function public.cancel_failed_automation_occurrence_and_refund')[1] || '';
const worker = read('app/api/cron/run-automations/route.js');
const adminRoute = read('app/api/admin/post-approvals/route.js');
const refundRoute = read('app/api/admin/post-approvals/cancel-refund/route.js');
const adminPage = read('app/admin/post-approvals/page.jsx');
const localeHelper = read('lib/userAppLocale.js');
const serverText = read('lib/i18n/serverUiText.js');
const lifecycle = read('lib/lifecycleEmails.js');
const settings = read('app/settings/page.jsx');
const stripe = read('app/api/stripe/webhook/route.js');
const rejection = read('app/api/reject-post/route.js');
const planMail = read('app/api/plan-activation-email/route.js');
const regenCarousel = read('app/api/admin/post-approvals/regenerate/route.js');
const regenProduct = read('app/api/admin/post-approvals/regenerate-product/route.js');

assert.match(failSql, /consumed_for_admin_rescue/);
assert.match(failSql, /charged_for_admin_rescue/);
assert.match(failSql, /rescue_credit_cost/);
assert.match(failSql, /refunded_credits\s*=\s*0/);
assert.doesNotMatch(failSql, /credits_remaining\s*=\s*credits_remaining\s*\+\s*v_refund/);
assert.match(refundSql, /admin_cancelled_failed_occurrence_refund/);
assert.match(refundSql, /credits_remaining\s*=\s*credits_remaining\s*\+\s*v_refund/);
assert.match(refundSql, /already_refunded/);
assert.match(refundSql, /Do not alter the rule's current credit reservation/);
assert.match(refundSql, /already been successfully rescued/);
assert.match(regenCarousel, /rescue_credit_resolved_with_post: true/);
assert.match(regenProduct, /rescue_credit_resolved_with_post: true/);

assert.match(worker, /heldRescueCredits/);
assert.match(worker, /notificationStatus = String\(data\?\.notification_status \|\| "suppressed"\)/);
assert.match(worker, /metadata\.app_locale/);
assert.match(worker, /userLocale \|\| detectedPostLocale/);

assert.match(adminRoute, /held_rescue_credits/);
assert.match(adminRoute, /rescue_credit_refund_available/);
assert.match(adminRoute, /customer_failure_notified_at/);
assert.match(refundRoute, /cancel_failed_automation_occurrence_and_refund/);
assert.match(refundRoute, /sendFailedOccurrenceRefundedEmail/);
assert.match(refundRoute, /refund_applied_but_customer_email_failed/);
assert.match(refundRoute, /customer_failure_notified_at/);

assert.match(adminPage, /admin\.approvals\.cancelRefundCredit/);
assert.match(adminPage, /admin\.approvals\.sendCustomerEmailAgain/);
assert.match(adminPage, /admin\.approvals\.noAutoRefundText/);
assert.match(adminPage, /\/api\/admin\/post-approvals\/cancel-refund/);

assert.ok(localeHelper.indexOf('metadata?.app_locale') < localeHelper.indexOf('metadata?.app_language'));
assert.match(settings, /app_locale:\s*nextLocale/);
assert.match(settings, /app_language:\s*nextLocale/);
assert.match(lifecycle, /resolveLocaleFromUserMetadata/);
assert.match(rejection, /resolveLocaleFromUserMetadata/);
assert.match(planMail, /resolveLocaleFromUserMetadata/);
assert.match(stripe, /resolveLocaleFromUserMetadata/);

assert.match(serverText, /ui_translation_packs/);
assert.match(serverText, /translateMissingLabels/);
assert.match(serverText, /source_fingerprints/);
assert.match(serverText, /claimServerTranslationPack/);

console.log('v144.111 rescue credit lifecycle + localized customer email checks passed');
