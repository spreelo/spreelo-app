import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = file => fs.readFileSync(file, 'utf8');
const intel = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingVideoIntelligence.js'))}`);
const guard = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingCreativeSafety.js'))}`);
const budget = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingPromptBudget.js'))}`);
const fixtures = JSON.parse(read('scripts/fixtures/v144-341-rejected-production-plans.json'));
for (const fixture of fixtures) {
  assert.equal(intel.motionPlanIsSupported(fixture.plan, fixture.intelligence), false, fixture.case);
  assert.equal(intel.sanitizeKlingProductIntelligence(fixture.intelligence).verified_actions.length, 0);
}
assert.equal(guard.validateKlingCreativeDirection(fixtures[0].plan.motion_prompt).ok, false);
for (const unsafe of [
  'The camera glides from left to right, revealing the right side of the box.',
  'The box pivots gently to the right as the couple smiles.',
  'Start with a smooth close-up pan over the packaging. Cut to the couple and return to the shot.',
]) assert.equal(guard.validateKlingCreativeDirection(unsafe).ok, false, unsafe);
console.log('PASS: actual Nintendo/Dreame plans rejected; indirect angle changes and cuts blocked');

const packaging = { physical_subject: { kind: 'packaging', name: 'Box', visible_surfaces: ['front', 'left', 'top'] }, confidence: 0.98,
  components: [{ name: 'Box', kind: 'physical', relation: 'integral' }, { name: 'Printed console', kind: 'depicted', relation: 'depicted' }],
  verified_actions: [{ id: 'launch', kind: 'present', action: 'next generation release', target_component: 'Box', evidence_type: 'retailer_quote', source_evidence: 'Nästa generationen av Nintendo Switch är här', physical_motion_supported: true, preserves_source_view: true, confidence: 1 }] };
assert.equal(intel.sanitizeKlingProductIntelligence(packaging, packaging.verified_actions[0].source_evidence).verified_actions.length, 0);
const action = kind => ({ id: 'action', kind, action: 'Bounded physical movement', target_component: 'Subject', evidence_type: 'visible_geometry', source_evidence: 'Source pixels show physical construction and contact', physical_motion_supported: true, preserves_source_view: true, confidence: 0.98 });
const evidence = kind => ({ physical_subject: { kind: 'physical_product', name: 'Subject', visible_surfaces: ['front'] }, confidence: 0.98, components: [], verified_actions: [action(kind)] });
const plan = { risk: 'low', strategy: 'The camera orbits around the product. Cut to a new scene.', mode: 'verified_use', action_id: 'action', camera_mode: 'locked', environment_motion: 'none', product_pose: 'source_locked', shot_count: 1, finish_seconds: 5, initial_conditions: [], stationary_objects: [] };
for (const kind of ['present', 'carry_straight', 'walk_same_view', 'roll_straight']) for (const camera_mode of ['locked', 'digital_push']) {
  const selected = { ...plan, camera_mode };
  assert(intel.motionPlanIsSupported(selected, evidence(kind)), kind);
  const direction = intel.renderKlingStructuredMotion(selected, evidence(kind));
  if (camera_mode === 'digital_push') assert(direction.includes('at most 7%'));
  assert(!direction.includes('orbits') && !direction.includes('Cut to'));
  assert(direction.includes('"Subject"'));
  assert(guard.validateKlingCreativeDirection(direction).ok, direction);
  assert(direction.includes('hold the final second'));
}
for (const changed of [{ camera_mode: 'lateral_pan' }, { shot_count: 2 }, { product_pose: 'rotate' }, { finish_seconds: 6 }, { motion_prompt: 'Pan across the box.' }, { action_ids: ['action'] }, { causal_sequence: ['contradiction'] }]) assert(!intel.motionPlanIsSupported({ ...plan, ...changed }, evidence('carry_straight')));
const depicted = { ...evidence('carry_straight'), physical_subject: { kind: 'depiction', name: 'Subject' } };
assert(!intel.motionPlanIsSupported(plan, depicted));
const detached = { ...evidence('move_separate_part_straight'), components: [{ name: 'Subject', kind: 'physical', relation: 'mechanically_attached' }] };
assert(!intel.motionPlanIsSupported(plan, detached));
const inferredDock = { ...action('move_separate_part_straight'), source_evidence: 'The robot is positioned inside the docking station, indicating automated docking functionality' };
assert.equal(intel.sanitizeKlingProductIntelligence({ ...detached, verified_actions: [inferredDock] }).verified_actions.length, 0);
const exact = { ...detached, components: [{ name: 'Subject', kind: 'physical', relation: 'separate' }], verified_actions: [{ ...action('move_separate_part_straight'), evidence_type: 'retailer_quote', source_evidence: 'The unit can move straight independently on its wheels.' }] };
assert.equal(intel.sanitizeKlingProductIntelligence(exact, 'Different description.').verified_actions.length, 0);
const grounded = intel.sanitizeKlingProductIntelligence(exact, exact.verified_actions[0].source_evidence);
assert(intel.motionPlanIsSupported(plan, grounded));
assert(!intel.renderKlingStructuredMotion(plan, grounded).includes('sliding fully inside'));
console.log('PASS: depicted components, slogans, false attachments and image-inferred docking rejected; bounded natural use preserved');

const review = { identity_safe: true, source_view_safe: true, functions_supported: true, scene_safe: true, causality_safe: true, confidence: 0.95, reason: 'Grounded in actual scene' };
function fakeAi(values, requests = []) { return { responses: { create: async request => { requests.push(request); const value = values.shift(); if (value instanceof Error) throw value; assert(value, 'Unexpected extra AI call'); return { output_text: JSON.stringify(value) }; } } }; }
const args = { model: 'test', intelligence: evidence('walk_same_view'), firstFrameDataUrl: 'data:image/png;base64,AA==', context: { fullProductInteractionSafe: true } };
const requests = [];
const approved = await intel.planKlingVerifiedMotion({ ...args, openai: fakeAi([{ ...plan }, review], requests) });
assert.equal(requests.length, 2);
const reviewText = requests[1].input[0].content[0].text;
assert.equal(JSON.parse(reviewText.slice(reviewText.indexOf('{"plan":'))).exact_provider_direction, approved.motion_prompt);
assert(approved.version >= 346);
assert.equal(approved.source, 'scene_aware_cinematic_plan');
for (const values of [[new Error('Outage')], [fixtures[0].plan], [{ ...plan }, { ...review, source_view_safe: false }]]) {
  const fallback = await intel.planKlingVerifiedMotion({ ...args, openai: fakeAi(values) });
  assert.equal(fallback.source, 'safe_cinematic_fallback');
  assert(fallback.motion_prompt.includes('at most 7%'));
  assert.deepEqual(fallback.action_ids, []);
}
assert.equal((await intel.planKlingVerifiedMotion({ ...args, context: { fullProductInteractionSafe: false }, openai: fakeAi([{ ...plan }, review]) })).mode, 'verified_use');
console.log('PASS: exact cinematic direction independently reviewed; invalid plans/outages use source-view digital push without provider retries');

const source = read('app/api/cron/run-automations/route.js');
const crop = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const context = { ...intel, ...budget, ...guard, PRODUCT_RESEARCH_FAST_MODEL: 'test', getCustomerFacingCampaignTheme: () => '', formatCampaignIdentityLockForPrompt: () => '' };
vm.runInNewContext(crop('function getKlingProviderSafetyPrefix(', '\nfunction getKlingProductPromptFallback(') + crop('async function buildKlingProductVideoPrompt(', '\nfunction buildKlingEngagementVideoPrompt(') + '\nthis.build=buildKlingProductVideoPrompt;', context);
const referenceSafety = { productIntelligence: evidence('carry_straight'), fullProductInteractionSafe: true, verifiedViewLock: { verifiedView: 'Camera orbit injected into old view text' } };
const finalPrompt = await context.build({ openai: fakeAi([{ ...plan }, review]), rule: {}, referenceSafety, referenceFrameBuffer: Buffer.from('test') });
assert(finalPrompt.length <= 2450);
assert(finalPrompt.includes('frame 0 is authoritative'));
assert(!finalPrompt.includes('retailer reference defines') && !finalPrompt.includes('Camera orbit injected'));
assert.equal(referenceSafety.motionPlan.submitted_full_prompt, finalPrompt);
assert.equal(referenceSafety.motionPlan.submitted_prompt, referenceSafety.motionPlan.motion_prompt);
const boxSafety = { productIntelligence: intel.sanitizeKlingProductIntelligence(packaging), fullProductInteractionSafe: true };
const boxPlan = { ...plan, mode: 'camera_environment', action_id: '', environment_motion: 'existing_people_react' };
const boxPrompt = await context.build({ openai: fakeAi([boxPlan, review]), rule: {}, referenceSafety: boxSafety, referenceFrameBuffer: Buffer.from('test') });
assert(boxPrompt.includes('packaging itself'));
assert(boxPrompt.includes('People already visible in the first frame react naturally'));
assert(!boxPrompt.includes('pan over') && !boxPrompt.includes('Cut to'));
assert.equal(boxSafety.motionPlan.submitted_prompt, intel.renderKlingStructuredMotion(boxPlan, boxSafety.productIntelligence));
assert.equal(intel.KLING_QUALITY_VERSION, 337, 'Do not invalidate old paid-job quality caches just to change motion planning');
console.log('PASS: actual automation sends the complete reviewed bounded prompt, anchors visible identity in its real input, and retains old audit cache version');
