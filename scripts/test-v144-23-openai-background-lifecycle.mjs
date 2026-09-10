import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const cron = read('app/api/cron/run-automations/route.js');
const lifecycle = read('lib/openaiBackgroundJobs.js');
const adminRoute = read('app/api/admin/openai-background-jobs/route.js');
const adminPage = read('app/admin/page.jsx');
const brandResearch = read('app/api/analyze-brand/webResearch.js');

// OpenAI's cancellable background lifecycle is now explicit.
assert.match(lifecycle, /openai\.responses\.cancel\(id/);
assert.match(lifecycle, /cancelCampaignResearchJobsForOccurrence/);
assert.match(lifecycle, /cleanupTerminalCampaignResearchJobs/);
assert.match(lifecycle, /emergencyCancelTrackedOpenAIBackgroundJobs/);
assert.match(lifecycle, /cooldownUntil/);

// A single occurrence is not allowed to leave multiple paid background responses alive.
assert.match(cron, /cancelOtherActiveCampaignResearchJobs\(\{/);
assert.match(cron, /reason: `superseded_before_round_\$\{researchRound\}`/);

// Success and terminal failure both clean up any still-running research.
assert.match(cron, /reason: "occurrence_completed"/);
assert.match(cron, /reason: "occurrence_failed_terminal"/);
assert.match(cron, /reason: "duplicate_claim_terminal_occurrence"/);
assert.match(cron, /cleanupTerminalCampaignResearchJobs\(\{/);
assert.match(cron, /workerName === "worker-1"/);
assert.match(cron, /max_tool_calls: 12/);
assert.match(cron, /max_tool_calls: 16/);
assert.match(brandResearch, /max_tool_calls: 18/);

// Admin has a real emergency stop, including the exact incident response IDs from the logs.
assert.match(adminRoute, /INCIDENT_RESPONSE_IDS/);
assert.match(adminRoute, /confirm !== true/);
assert.match(adminRoute, /emergencyCancelTrackedOpenAIBackgroundJobs/);
assert.match(adminRoute, /admin_emergency_stop:explicit_incident_cleanup/);
assert.match(adminPage, /t\("adminCommand\.tools\.stopJobs"\)/);
assert.match(adminPage, /stopOpenAIBackgroundJobs/);

// The previous v144.22 delivery and translation protections remain in place.
assert.match(cron, /const campaignRequiredVerifiedCount = websiteAccessProtected\s*\? CAROUSEL_PRODUCT_SLIDE_TARGET/);
assert.match(cron, /product_image_semantic_verified === true/);

console.log('v144.23 OpenAI background lifecycle checks passed');
