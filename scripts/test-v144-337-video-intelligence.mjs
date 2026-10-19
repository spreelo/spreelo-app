import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(p, 'utf8');
const intel = await import('../lib/klingVideoIntelligence.js');
const references = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingAuditReferences.js'))}`);
const budget = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingPromptBudget.js'))}`);
const safety = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingCreativeSafety.js'))}`);
const { buildKlingPixelPreservingEdit } = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingQualityFallback.js'))}`);
const crop = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const fakeAi = values => ({ responses: { create: async request => {
  const value = values.shift();
  if (value instanceof Error) throw value;
  assert(value, 'Unexpected additional AI call');
  assert(request.text.format.strict);
  return { output_text: JSON.stringify(value) };
} } });
const evidence = { physical_subject: { kind: 'physical_product', name: 'Wheeled product', visible_surfaces: ['front'] }, confidence: 0.98,
  components: [{ name: 'Wheeled product', kind: 'physical', relation: 'integral' }],
  verified_actions: [{ id: 'move', kind: 'roll_straight', target_component: 'Wheeled product', action: 'Straight motion', evidence_type: 'visible_geometry',
    source_evidence: 'Visible wheels touching the ground', physical_motion_supported: true, preserves_source_view: true, confidence: 0.96 }] };
const plan = { mode: 'verified_use', action_id: 'move', risk: 'low', camera_mode: 'locked', environment_motion: 'none', product_pose: 'source_locked', shot_count: 1, finish_seconds: 5, initial_conditions: ['Wheels on ground'], stationary_objects: [] };
const direction = intel.renderKlingStructuredMotion(plan, evidence);
const review = { identity_safe: true, source_view_safe: true, functions_supported: true, scene_safe: true, causality_safe: true, confidence: 0.95, reason: 'Supported' };
const args = { model: 'test', intelligence: evidence, firstFrameDataUrl: 'data:image/png;base64,AA==', context: { fullProductInteractionSafe: true } };
assert(intel.motionPlanIsSupported(plan, evidence));
for (const changed of [{ action_id: 'unknown' }, { risk: 'high' }, { camera_mode: 'orbit' }, { motion_prompt: 'free prose' }]) assert(!intel.motionPlanIsSupported({ ...plan, ...changed }, evidence));
assert(!intel.motionPlanIsSupported(plan, { ...evidence, confidence: 0.3 }));
assert(!intel.motionPlanIsSupported(plan, { ...evidence, verified_actions: [{ ...evidence.verified_actions[0], preserves_source_view: false }] }));
assert.equal((await intel.planKlingVerifiedMotion({ ...args, openai: fakeAi([{ ...plan }, review]) })).source, 'scene_aware_cinematic_plan');
assert.equal((await intel.planKlingVerifiedMotion({ ...args, openai: fakeAi([{ ...plan }, { ...review, causality_safe: false }]) })).source, 'safe_cinematic_fallback');
assert.equal((await intel.planKlingVerifiedMotion({ ...args, context: { fullProductInteractionSafe: false }, openai: fakeAi([{ ...plan }, review]) })).mode, 'verified_use');
assert.equal((await intel.analyzeKlingProductIntelligence({ openai: fakeAi([new Error('unavailable')]), model: 'test', sourceDataUrl: args.firstFrameDataUrl })).verified_actions.length, 0);
console.log('PASS: evidence-backed motion, independent preflight, scene-verified use and cinematic outage fallback');

const goodAudit = Object.fromEntries(Object.keys(intel.videoQualitySchema.properties).filter(k => intel.videoQualitySchema.properties[k].type === 'boolean').map(k => [k, !['unverified_surface_exposed', 'invented_or_moved_identity_detail', 'object_materialized_or_disappeared'].includes(k)]));
Object.assign(goodAudit, { confidence: 0.98, issues: [], reason: 'All visible identity and causal relationships preserved' });
assert(intel.decideKlingVideoQuality(goodAudit).passed);
for (const field of Object.keys(goodAudit).filter(k => typeof goodAudit[k] === 'boolean' && !['commercial_motion_engaging','closing_action_resolved'].includes(k))) {
  const bad = { ...goodAudit, [field]: !goodAudit[field] };
  assert(!intel.decideKlingVideoQuality(bad).passed, field);
}
for (const confidence of [0, 0.89, undefined, NaN]) assert(!intel.decideKlingVideoQuality({ ...goodAudit, confidence }).passed);
assert(!intel.decideKlingVideoQuality({ ...goodAudit, issues: [{ code: 'bad_contact', time_seconds: 2, observation: 'Detached object moved without contact' }] }).passed);
assert(intel.decideKlingVideoQuality({ ...goodAudit, same_product_all_auditable_frames: false }, { productRequired: false }).passed);
assert.equal(intel.decideKlingVideoQuality({ ...goodAudit, physical_causality_preserved: false }, { productRequired: false }).decision, 'admin_review');
assert.equal(intel.decideKlingVideoQuality({ ...goodAudit, component_count_roles_attachments_preserved: false }).decision, 'pixel_preserving_animation');
const times = intel.klingQualitySampleTimes(6, 0.15);
assert.equal(times.length, 17);
assert.equal(times[0], 0.15);
assert.equal(times.at(-1), 5.98);
assert(times[1] - times[0] <= 0.13);
assert(times.every((t, i) => t >= 0.15 && t < 6 && (!i || t > times[i - 1])));
console.log('PASS: identity/event/anatomy gates fail closed; 17 ordered samples cover early action and final frame');

const automation = read('app/api/cron/run-automations/route.js');
const ctx = { ...budget, ...safety, planKlingVerifiedMotion: intel.planKlingVerifiedMotion, passiveKlingMotionPlan: intel.passiveKlingMotionPlan, PRODUCT_RESEARCH_FAST_MODEL: 'test',
  getCustomerFacingCampaignTheme: () => 'Summer', formatCampaignIdentityLockForPrompt: () => 'Only summer',
};
vm.runInNewContext(crop(automation, 'function getKlingProviderSafetyPrefix(', '\nfunction getKlingProductPromptFallback(') + '\n' + crop(automation, 'async function buildKlingProductVideoPrompt(', '\nfunction buildKlingEngagementVideoPrompt(') + '\nthis.build=buildKlingProductVideoPrompt;', ctx);
const referenceSafety = { productIntelligence: evidence, fullProductInteractionSafe: true, verifiedViewLock: { verifiedView: 'Verified top-front source view' } };
const prompt = await ctx.build({ openai: fakeAi([{ ...plan }, review]), rule: {}, referenceSafety, referenceFrameBuffer: Buffer.from('test') });
assert(prompt.length <= 2450);
assert(prompt.includes(direction));
assert(prompt.includes('COMPONENT ROLE LOCK') && prompt.includes('SURFACE PRINT LOCK') && prompt.includes('SCENE CONTINUITY LOCK'));
assert.equal(referenceSafety.motionPlan.submitted_prompt, direction);
const worst = await ctx.build({ rule: {}, referenceSafety: { verifiedViewLock: { verifiedView: 'x'.repeat(1000) } } });
assert(worst.length <= 2450 && /[.!?]$/.test(worst));
console.log('PASS: actual provider prompt retains complete reviewed direction and hard locks within API budget');

// Exercise the finalizer's real audit/cache orchestration without remote services.
const finalizer = read('app/api/cron/finalize-kling-videos/route.js');
function dbMock() {
  const writes = [];
  return { writes, from: () => {
    let data;
    const q = { update: d => { data = d; return q; }, eq: () => q,
      then: resolve => { writes.push(data); resolve({ error: null }); } };
    return q;
  } };
}
let inspections = 0;
const db = dbMock();
const frames = times.map(time => ({ time, buffer: Buffer.from('frame') }));
const auditCtx = { ...intel, ...references, KLING_PRODUCT_IDENTITY_AUDIT_MODEL: 'test',
  normalizeVideoDurationSeconds: (...v) => v.find(x => Number(x) > 0),
  fetchKlingVerifiedProductReferenceDataUrl: async () => 'data:image/png;base64,AA==',
  sampleRemoteVideoFrames: async () => frames,
  inspectKlingVideoQuality: async () => { inspections++; return { ...goodAudit }; },
  console, Date, String, Number, Promise,
};
vm.runInNewContext(crop(finalizer, 'async function validateFinishedKlingProductIdentity(', '\nasync function saveKlingQualitySelection(') + '\nthis.audit=validateFinishedKlingProductIdentity;', auditCtx);
const post = { id: 'post', kling_task_id: 'task-one', kling_reference_image_url: 'https://scene.test/frame.png', video_background_selection: { verified_product_image_url: 'https://store.test/image.png', reference_safety: { verifiedViewLock: { verifiedView: 'front', motionConstraint: 'Keep the front view.' } }, scene_trim_start_seconds: 0.15 } };
const task = { videoUrl: 'https://video.test/source.mp4', durationSeconds: 6 };
assert((await auditCtx.audit({ openai: {}, supabase: db, post, task })).passed);
assert((await auditCtx.audit({ openai: {}, supabase: db, post, task })).cached);
assert.equal(inspections, 1);
post.video_background_selection.product_video_validation.version = 336;
await auditCtx.audit({ openai: {}, supabase: db, post, task });
assert.equal(inspections, 2, 'Old identity-only audit must not bypass new quality checks');
post.kling_task_id = 'task-two';
await auditCtx.audit({ openai: {}, supabase: db, post, task });
assert.equal(inspections, 3);
auditCtx.inspectKlingVideoQuality = async () => { inspections++; return { ...goodAudit, physical_causality_preserved: false }; };
post.kling_task_id = 'task-three';
assert(!(await auditCtx.audit({ openai: {}, supabase: db, post, task })).passed);
assert(!(await auditCtx.audit({ openai: {}, supabase: db, post, task })).passed);
assert.equal(inspections, 4, 'Confirmed failure must be cached on resume');
const concept = { ...post, video_background_selection: { identity_validation_required: false } };
assert(!(await auditCtx.audit({ openai: {}, supabase: db, post: concept, task })).passed);
assert.equal(inspections, 5, 'Engagement concept must still run event quality inspection');
console.log('PASS: new audits, task/source cache isolation, cached rejection and engagement event inspection');

// Exercise fallback continuation using an existing authoritative-photo asset.
let submissions = 0, waits = 0;
const fallbackCtx = { buildKlingPixelPreservingEdit, console,
  queueShotstackRender: async () => { submissions++; return 'render-one'; },
  waitForShotstackRender: async () => { waits++; if (waits === 1) throw new Error('still processing'); return { url: 'https://video.test/safe.mp4' }; },
};
vm.runInNewContext(crop(finalizer, 'async function saveKlingQualitySelection(', '// v144.42:') + '\nthis.fallback=getKlingQualityFallbackSource;', fallbackCtx);
const safePost = { id: 'safe', kling_task_id: 'paid-original', video_background_selection: { verified_product_image_url: 'https://store.test/true.png', quality_fallback: { frame_url: 'https://store.test/safe-frame.png' } } };
await assert.rejects(() => fallbackCtx.fallback({ supabase: db, post: safePost }), /still processing/);
assert.equal(safePost.video_background_selection.quality_fallback.render_id, 'render-one');
assert.equal((await fallbackCtx.fallback({ supabase: db, post: safePost })).videoUrl, 'https://video.test/safe.mp4');
assert.equal((await fallbackCtx.fallback({ supabase: db, post: safePost })).videoUrl, 'https://video.test/safe.mp4');
assert.equal(submissions, 1);
assert.equal(waits, 2);
safePost.video_background_selection.quality_fallback = { status: 'submitting' };
await assert.rejects(() => fallbackCtx.fallback({ supabase: db, post: safePost }), e => e.code === 'QUALITY_FALLBACK_SUBMISSION_UNKNOWN');
assert.equal(submissions, 1);
const edit = buildKlingPixelPreservingEdit({ imageUrl: 'https://store.test/true.png' });
const clip = edit.timeline.tracks[0].clips[0];
assert.equal(clip.length, 6);
assert.match(clip.asset.js, /scale:1.06,duration:6/);
assert(!clip.asset.js.includes('x:') && !clip.asset.js.includes('y:'));
assert.throws(() => buildKlingPixelPreservingEdit({ imageUrl: 'javascript:alert(1)' }));
assert.match(automation, /submissionAlreadySettled:post.video_provider === "kling" \|\| Boolean\(post.video_background_selection\?\.quality_fallback\?\.original_task_id\)/);
const page = read('app/admin/post-approvals/page.jsx');
const labelCtx = {};
vm.runInNewContext(crop(page, 'function adminPostFormatLabel(', '\nfunction isProductDrivenPost(') + '\nthis.label=adminPostFormatLabel;', labelCtx);
assert.equal(labelCtx.label({ content_type_id: 'ai_product_video', kling_task_id: 'paid-original', video_provider: 'shotstack', video_background_selection: { quality_fallback: { status: 'ready' } } }), 'Animerad video');
assert.equal(labelCtx.label({ video_provider: 'kling' }), 'AI-video');
console.log('PASS: one safe render across continuation, ambiguous submission blocks retries, 6% fixed-centre continuous animation and correct admin format');

// Delivery must recognize that the original Kling occurrence was already
// settled, even after the successful fallback changes its display provider.
let deliveryPost, deliveryArgs;
const deliveryCtx = {
  console, getAdminPostReviewGate: async () => true,
  completeShotstackDelivery: async args => { deliveryArgs = args; return { completed: true }; },
};
vm.runInNewContext(crop(automation, 'export async function completeShotstackDeliveryForPost(', '\nexport async function sendApprovalEmail(').replace('export async', 'async') + '\nthis.deliver=completeShotstackDeliveryForPost;', deliveryCtx);
const deliveryDb = { from: table => {
  const q = { select: () => q, eq: () => q, single: async () => ({ data: deliveryPost }), maybeSingle: async () => ({ data: table === 'automation_rules' ? { id: 'rule' } : {} }) };
  return q;
} };
deliveryPost = { id: 'post', video_provider: 'shotstack', video_background_selection: { quality_fallback: { original_task_id: 'paid-original' } } };
await deliveryCtx.deliver({ supabase: deliveryDb, postId: 'post' });
assert.equal(deliveryArgs.submissionAlreadySettled, true);
deliveryPost = { id: 'post', video_provider: 'shotstack' };
await deliveryCtx.deliver({ supabase: deliveryDb, postId: 'post' });
assert.equal(deliveryArgs.submissionAlreadySettled, false);
deliveryPost = { id: 'post', video_provider: 'kling' };
await deliveryCtx.deliver({ supabase: deliveryDb, postId: 'post' });
assert.equal(deliveryArgs.submissionAlreadySettled, true);
console.log('PASS: fallback delivery preserves original credit settlement; ordinary Shotstack settlement still runs');

// The advertising render of a safe fallback also resumes its saved job and
// blocks ambiguous submissions, independently of the original-photo render.
let adSubmissions = 0, adWaits = 0;
const adDb = dbMock();
const adSupabase = { ...adDb, from: table => {
  if (table === 'brand_profiles') { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: {} }) }; return q; }
  return adDb.from(table);
} };
const adCtx = {
  console, KLING_END_CARD_SECONDS: 1.3, KLING_END_CARD_TRANSITION_SECONDS: 0.3,
  getKlingAdvertisingPostprocess: post => post.video_background_selection,
  createFinishedKlingTypographyOnce: async ({ selection }) => selection,
  normalizeVideoDurationSeconds: (...v) => v.find(x => Number(x) > 0),
  ensureKlingEndCard: async ({ selection }) => selection,
  ensureKlingLogoOverlay: async ({ selection }) => selection,
  selectBestVideoMusic: async () => null,
  buildVideoOverlayEdit: args => args,
  queueShotstackRender: async () => { adSubmissions++; return 'advertising-one'; },
  waitForShotstackRender: async () => { adWaits++; if (adWaits === 1) throw new Error('processing'); return { url: 'https://video.test/final.mp4' }; },
  reviewRenderedAdvertisingVideo: async () => ({passed:true}), sampleRemoteVideoFrames: async () => [], KLING_PRODUCT_IDENTITY_AUDIT_MODEL:'test',
};
vm.runInNewContext(crop(finalizer, 'async function saveKlingQualitySelection(', '\nasync function getKlingQualityFallbackSource(') + '\n' + crop(finalizer, 'async function getKlingFinalVideoSource(', '\nasync function finalizeReadyTask(') + '\nthis.render=getKlingFinalVideoSource;', adCtx);
const adPost = { id: 'ad-post', video_background_selection: { quality_fallback: { status: 'ready' }, text_overlay_url: 'https://store.test/text.png', scene_trim_start_seconds: 0.05, end_card_url: 'https://store.test/end.png' } };
await assert.rejects(() => adCtx.render({ openai: {}, supabase: adSupabase, post: adPost, task }), /processing/);
assert.equal(adPost.video_background_selection.shotstack_render_id, 'advertising-one');
assert.equal((await adCtx.render({ openai: {}, supabase: adSupabase, post: adPost, task })).videoUrl, 'https://video.test/final.mp4');
assert.equal(adSubmissions, 1);
const ambiguousAd = { id: 'unknown', video_background_selection: { quality_fallback: { status: 'ready' }, quality_postprocess_submission: 'submitting' } };
await assert.rejects(() => adCtx.render({ openai: {}, supabase: adSupabase, post: ambiguousAd, task }), e => e.code === 'QUALITY_FALLBACK_SUBMISSION_UNKNOWN');
assert.equal(adSubmissions, 1);
console.log('PASS: safe advertising render resumes its saved id and ambiguous submission cannot create a second job');
