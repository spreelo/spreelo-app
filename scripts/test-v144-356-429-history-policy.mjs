import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  chooseWebsite429DelayMs,
  decideWebsite429Action,
  isCompletedWebsiteHistoryPost,
} from '../lib/website429RecoveryPolicy.js';
const root = resolve(import.meta.dirname, '..');
const runtime = readFileSync(resolve(root, 'app/api/cron/run-automations/route.js'), 'utf8');

// Exact policy the user requested.
assert.equal(decideWebsite429Action({ realRemote429: true, historicalSuccess: false }), 'permanent_rescue');
assert.equal(decideWebsite429Action({ realRemote429: true, historicalSuccess: true }), 'cooldown');
assert.equal(decideWebsite429Action({ realRemote429: false, historicalSuccess: false }), 'cooldown');
assert.equal(decideWebsite429Action({ realRemote429: true, historicalSuccess: false, historyKnown: false }), 'cooldown');
for (const [i, expectedMinutes] of [15,30,60,120,120].entries()) {
  assert.equal(chooseWebsite429DelayMs({ consecutive429Count:i+1 }), expectedMinutes*60_000);
}
assert.equal(chooseWebsite429DelayMs({ consecutive429Count: 1, retryAfterMs: 2*3600_000 }), 2*3600_000);
assert.equal(isCompletedWebsiteHistoryPost({ status:'generating', video_status:'ready',video_storage_path:'a' }),false);
assert.equal(isCompletedWebsiteHistoryPost({ status:'failed', video_status:'ready',video_storage_path:'a' }),false);
assert.equal(isCompletedWebsiteHistoryPost({ status:'pending_approval', content_format:'animated_video',video_status:'ready',video_storage_path:'a' }),true);
assert.equal(isCompletedWebsiteHistoryPost({ status:'pending_approval', content_format:'animated_video',video_status:'rendering',image_status:'ready',image_url:'a' }),false);
assert.equal(isCompletedWebsiteHistoryPost({ status:'pending_approval', content_format:'single_image',image_status:'ready',image_url:'a' }),true);
assert.equal(isCompletedWebsiteHistoryPost({ status:'published' }),true);
assert.equal(isCompletedWebsiteHistoryPost({ status:'pending_approval', content_format:'single_image',image_status:'generating' }),false);

// Route integration: remote HTTP 429 identified at source and recorded in DB;
// internal fetch pacing cannot masquerade as a remote response.
assert.equal((runtime.match(/origin: "http_response"/g) || []).length,3);
assert.match(runtime, /origin: "domain_cooldown"/);
assert.match(runtime, /origin: "internal_pacing"/);
assert.match(runtime, /getRemoteWebsite429CooldownMs\(safeUrl, providerRetryAfterMs\)/);
assert.match(runtime, /getWebsiteHistoricalDelivery\(/);
assert.match(runtime, /website_content_history/);
assert.match(runtime, /isCompletedWebsiteHistoryPost/);
assert.match(runtime, /if \(!continuousRetry && result.retryCount >= WEBSITE_RATE_LIMIT_MAX_RETRIES\)/);
assert.match(runtime, /if \(rule\.uses_website_content && isBrand429RescueActive\(automationBrandProfile\)\)/);
assert.match(runtime, /releaseHistorical429Rescue/);
assert.match(runtime, /website_domain_cooldown_preflight/);
console.log('v144.356: genuine 429, internal pacing, history, backoff, legacy Rescue, indefinite defer: PASS');
