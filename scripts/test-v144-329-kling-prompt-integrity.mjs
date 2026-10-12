import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(p, 'utf8');
const source = read('app/api/cron/run-automations/route.js');
const budget = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingPromptBudget.js'))}`);
const safety = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingCreativeSafety.js'))}`);
const grab = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
let candidate = 'A subtle camera push shows the unchanged product. Established background motion continues. Hold the final second.';
const ctx = { ...budget, ...safety, PRODUCT_RESEARCH_FAST_MODEL: 'test',
  planKlingVerifiedMotion: async () => ({ motion_prompt: candidate, mode: 'camera_environment', action_ids: [] }),
  truncateText: (v,n) => String(v || '').slice(0,n), getCustomerFacingCampaignTheme: () => '', formatCampaignIdentityLockForPrompt: () => '',
};
vm.runInNewContext([
  grab('function getKlingProviderSafetyPrefix(', '\nfunction getKlingProductPromptFallback('),
  grab('function getKlingProductPromptFallback(', '\nasync function buildKlingProductVideoPrompt('),
  grab('async function buildKlingProductVideoPrompt(', '\nfunction buildKlingEngagementVideoPrompt('),
  grab('function buildKlingEngagementVideoPrompt(', '\nasync function submitKlingEngagementConceptVideo('),
  'this.build = buildKlingProductVideoPrompt; this.fallback = getKlingProductPromptFallback; this.engagement = buildKlingEngagementVideoPrompt;',
].join('\n'), ctx);
const view = { verifiedViewLock: { verifiedView: 'Top-front source view', motionConstraint: 'No rotation of case or earbuds.' } };
const rule = { website_item: { title: 'Verified product' }, brand_profile: { business_name: 'Store' } };
const check = prompt => { assert(prompt.length <= 2450); assert(/[.!?]$/.test(prompt)); for (const lock of ['HARD PRODUCT LOCK', 'SURFACE PRINT LOCK', 'LIGHT AND EFFECT LOCK', 'FUNCTION LOCK', 'SCENE CONTINUITY LOCK']) assert(prompt.includes(lock)); };
const normal = await ctx.build({ rule, referenceSafety: view });
check(normal); assert(normal.includes(candidate)); assert(normal.includes('No rotation of case or earbuds.'));
candidate = 'A longer camera movement remains outside the verified product. '.repeat(60);
const limited = await ctx.build({ rule, referenceSafety: view });
check(limited); assert.equal(view.motionPlan.source, 'passive_plan_fallback'); assert.equal(view.motionPlan.rejected_plan_reason, 'reviewed_plan_exceeds_provider_budget');
assert(limited.includes('mechanically passive'));
check(ctx.fallback({ rule, referenceSafety: view, postContent: 'x'.repeat(5000) }));
check(ctx.engagement({ rule, referenceSafety: view, postContent: 'Engagement. '.repeat(500) }));
assert.throws(() => budget.assembleKlingPrompt({ safety: 'x'.repeat(2450), direction: 'A complete scene.' }));
assert.equal(budget.completeKlingSentences('First sentence. Second sentence. Third sentence.', 30), 'First sentence.');
const provider = read('lib/kling.js');
assert.match(provider, /KLING_PROMPT_TOO_LONG/);
assert.match(provider, /const exactPrompt = String\(prompt\)\.trim\(\)/);
assert.doesNotMatch(provider, /String\(prompt\)\.trim\(\)\.slice\(0, 2500\)/);
assert.doesNotMatch(read('lib/aiModelControl.js'), /runway|\bwan\b/i);
console.log('PASS: complete provider locks and verified view, unchanged normal plan, whole safe replacement of oversized reviewed plan, prompt budget and Kling-only guard');
