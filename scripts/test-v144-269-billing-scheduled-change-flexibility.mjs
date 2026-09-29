import fs from 'node:fs';
import assert from 'node:assert/strict';

const panel = fs.readFileSync(new URL('../components/StripeBillingPanel.jsx', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../app/api/stripe/subscription/change/route.js', import.meta.url), 'utf8');

assert.ok(panel.includes('selected && hasPendingPlanChange ? cancelScheduledPlanChange()'), 'current plan must allow canceling a scheduled change');
assert.ok(!panel.includes('hasPendingPlanChange && !selected'), 'scheduled change must not globally lock all other plan buttons');
assert.ok(panel.includes('pendingTarget || (selected && hasPaidSubscription && !hasPendingPlanChange)'), 'only the exact pending target/current-without-pending should be locked');

assert.ok(route.includes('async function releaseScheduledPlanChange'), 'missing shared schedule release helper');
assert.ok(route.includes('canceledScheduledChange: true'), 'selecting current plan should cancel future change');
assert.ok(route.includes('subscription = await releaseScheduledPlanChange(context, billing, subscription);'), 'new plan choices should release/replace an existing future schedule');

// Paid-plan upgrades should add only the prorated plan delta, not stack a second full allowance.
assert.ok(route.includes('Math.round((targetLookup.plan.credits - current.credits) * fraction)'), 'same-interval upgrade credit delta/proration changed unexpectedly');
assert.ok(route.includes('const creditMode = sameInterval ? "delta" : "full"'), 'plan-change credit mode changed unexpectedly');

console.log('v144.269 billing scheduled-change flexibility checks passed');
