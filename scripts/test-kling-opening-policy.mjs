import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { persistKlingOpeningAssets } from '../lib/klingOpeningAssets.js';
import { adminOpeningImages } from '../lib/klingAdminVideo.js';

const source = fs.readFileSync('app/api/cron/run-automations/route.js', 'utf8');
assert(!source.includes('reviewKlingOpeningSceneIdentity'), 'No remaining separate identity request/gate');
const original = { imageUrl: 'https://store.test/original.png', imageStoragePath: 'u/p-original.png' };
const opening = { imageUrl: 'https://store.test/opening.png', imageStoragePath: 'u/p-opening.png' };
const item = { title: 'I Support Ukraine - Herr - T-shirt', image_url: 'https://retailer.test/product.png' };
const clone = value => structuredClone(value);
function database(fault = '') {
  let stored = { id: 'p', video_background_selection: { kling_source_storage_url: 'saved-film', shotstack_render_id: 'existing-render' } };
  const writes = [];
  return {
    writes, get stored() { return clone(stored); },
    async rpc() { return { data: true }; },
    from(table) {
      assert.equal(table, 'posts');
      let values;
      const commit = () => {
        if (values && fault !== 'write') { stored = { ...stored, ...clone(values) }; writes.push(clone(values)); }
        return { data: fault === 'missing' ? null : clone(stored), error: fault === (values ? 'write' : 'read') ? { message: 'database unavailable' } : null };
      };
      const q = { select: () => q, eq: () => q, update: data => { values = data; return q; },
        maybeSingle: async () => { const r = commit(); if (values && fault === 'dropped' && r.data) r.data.video_background_selection.opening_image_comparison = null; return r; },
        then: (resolve, reject) => Promise.resolve(commit()).then(resolve, reject),
      };
      return q;
    },
  };
}
const args = { postId: 'p', original, opening, websiteItem: item, openingSceneMode: 'direct_scene', referenceSafety: { verifiedViewLock: { verifiedView: 'front' } } };
const db = database();
const comparison = await persistKlingOpeningAssets({ ...args, supabase: db });
assert.equal(comparison.identity_review.status, 'disabled');
assert.equal(comparison.identity_review.confidence, null);
assert.equal(comparison.opening_kind, 'generated_scene');
assert.equal(db.stored.video_background_selection.kling_source_storage_url, 'saved-film');
assert.equal(db.stored.video_background_selection.shotstack_render_id, 'existing-render');
assert.equal(db.stored.video_url, undefined);
for (const fault of ['read', 'write', 'missing', 'dropped']) {
  await assert.rejects(persistKlingOpeningAssets({ ...args, supabase: database(fault) }), /Check database access.*no video was ordered/);
}
await assert.rejects(persistKlingOpeningAssets({ ...args, original: { imageUrl: 'javascript:alert(1)' }, supabase: db }), /Check image storage/);
console.log('PASS: comparison is durable and confirmed, truthful about disabled review, preserves existing paid jobs, and fails visibly on database/storage errors');

// Execute BOTH real preparation paths. A later motion error must retain the
// exact generated image rather than replacing it with the original/fallback.
const rescueStart = source.indexOf('export async function submitAdminRescueAiProductVideo(');
const rescueEnd = source.indexOf('\nfunction normalizeSlideText(', rescueStart);
const rescue = source.slice(rescueStart, rescueEnd).replace('export ', '');
const normalStart = source.indexOf('            let referenceSafety = await assessKlingReferenceSafety(sourceImageBuffer,');
const normalEnd = source.indexOf('            // This RPC is the hard cost guard.', normalStart);
assert(normalStart > 0 && normalEnd > normalStart);
const normal = `async function normalPreparation() { let finalImagePrompt, imageUrl, imageStoragePath, klingPrompt;
  ${source.slice(normalStart, normalEnd)}
  return { imageUrl, openingComparison };
}`;
for (const path of ['normal', 'rescue']) {
  for (const scenario of ['success', 'motion_rejected', 'checkpoint_failed', 'image_generation_failed']) {
    const supabase = database(scenario === 'checkpoint_failed' ? 'write' : '');
    let submissions = 0, images = 0, preflights = 0;
    const globals = {
      Buffer, console: { info() {}, warn() {} }, supabase, openai: {},
      rule: { id: 'r', user_id: 'u', website_item: item }, post: { id: 'p' }, candidate: { item },
      klingRuleContext: { website_item: item }, sourceImageBuffer: Buffer.from('original'), generatedContent: 'copy',
      persistKlingOpeningAssets,
      fetchImageBufferForOverlay: async () => Buffer.from('original'),
      assessKlingReferenceSafety: async () => ({ verifiedViewLock: { verifiedView: 'front' }, commercialStory: { status: 'planned' } }),
      generateKlingDirectSceneOpeningFrame: async () => {
        images++;
        if (scenario === 'image_generation_failed') throw new Error('image provider timeout');
        return { buffer: Buffer.from('actual-generated-image'), source: 'gpt_image_2_direct_scene', identityReviewStatus: 'disabled', identityConfidence: null };
      },
      selectKlingNaturalStartBackground: async () => ({ source: 'fallback' }),
      createKlingProductReferenceFrame: async () => ({ frameBuffer: Buffer.from('fallback'), referenceSafety: {} }),
      uploadGeneratedImageToStorage: async ({ fileSuffix, imageBase64 }) => {
        const isOriginal = fileSuffix.endsWith('verified-product');
        if (!isOriginal && scenario !== 'image_generation_failed') assert.equal(Buffer.from(imageBase64, 'base64').toString(), 'actual-generated-image');
        return isOriginal ? original : opening;
      },
      buildKlingAdvertisingOverlayCopy: () => ({ headline: item.title }),
      isEngagementAiVideoRule: () => false,
      buildKlingProductVideoPrompt: async ({ referenceSafety }) => {
        preflights++;
        assert(supabase.stored.video_background_selection.opening_image_comparison, 'Checkpoint must precede motion preflight');
        if (scenario === 'motion_rejected' || referenceSafety.commercialStory?.status === 'opening_unavailable') {
          throw Object.assign(new Error('Motion planning stopped; inspect the saved images'), { code: 'KLING_MOTION_PLAN_REVIEW_REQUIRED' });
        }
        return 'motion';
      },
      getCustomerFacingCampaignTheme: () => '', KLING_TEXT_OVERLAY_START_SECONDS: 0, KLING_AI_VIDEO_DURATION_SECONDS: 5,
      verifyPreparedKlingAuditReferences: async () => {
        assert.equal(supabase.stored.video_background_selection.opening_image_comparison.opening_image_url, opening.imageUrl, 'Later preparation retains the comparison');
      },
      submitKlingImageToVideo: async () => { submissions++; return { taskId: 'new-task', status: 'submitted' }; },
    };
    const context = vm.createContext(globals);
    vm.runInContext(path === 'rescue' ? rescue : normal, context);
    const run = () => path === 'rescue'
      ? context.submitAdminRescueAiProductVideo({ openai: {}, supabase, rule: globals.rule, postContent: 'copy', userId: 'u', postId: 'p' })
      : context.normalPreparation();
    if (scenario === 'success') await run();
    else await assert.rejects(run(), scenario === 'checkpoint_failed' ? /Check database access/ : /Motion planning stopped/);
    assert.equal(images, 1, 'No extra image retry');
    assert.equal(submissions, path === 'rescue' && scenario === 'success' ? 1 : 0);
    assert.equal(preflights, scenario === 'checkpoint_failed' ? 0 : 1);
    if (scenario !== 'checkpoint_failed') {
      const saved = supabase.stored.video_background_selection.opening_image_comparison;
      assert.equal(saved.original_image_url, original.imageUrl);
      assert.equal(saved.opening_image_url, opening.imageUrl);
      assert.equal(saved.opening_kind, scenario === 'image_generation_failed' ? 'pixel_preserving_fallback' : 'generated_scene');
    }
  }
}
console.log('PASS: real normal/rescue preparations retain images across motion failures; checkpoint failure prevents preflight/submission; real generation failure stays blocked and is labelled fallback');

assert.deepEqual(adminOpeningImages(db.stored), { originalUrl: original.imageUrl, openingUrl: opening.imageUrl, isFallback: false });
assert.equal(adminOpeningImages({ image_url: opening.imageUrl }), null, 'Legacy poster must not be mislabelled as a rejected generated image');
assert.equal(adminOpeningImages({ video_background_selection: { opening_image_comparison: { original_image_url: original.imageUrl, opening_image_url: 'javascript:alert(1)' } } }), null);
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const page = fs.readFileSync('app/admin/post-approvals/page.jsx', 'utf8');
const component = page.slice(page.indexOf('function OpeningImageComparison('), page.indexOf('function MediaPreview('));
const transformed = await transform(component, { filename: 'OpeningComparison.jsx', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } }, target: 'es2020' }, module: { type: 'commonjs' } });
const ctx = vm.createContext({ React, adminOpeningImages, ExternalLink: () => React.createElement('span') });
vm.runInContext(transformed.code + '\nthis.Comparison=OpeningImageComparison;', ctx);
const render = post => renderToStaticMarkup(React.createElement(ctx.Comparison, { post, t: key => key }));
const html = render(db.stored);
assert.equal((html.match(/<img /g) || []).length, 2);
assert(html.includes(`href="${original.imageUrl}"`) && html.includes(`href="${opening.imageUrl}"`));
assert(html.includes('admin.approvals.generatedOpeningImage'));
assert.equal(render({}), '');
const fallbackPost = { video_background_selection: { opening_image_comparison: { ...comparison, opening_kind: 'pixel_preserving_fallback' } } };
assert(render(fallbackPost).includes('admin.approvals.fallbackReferenceImage'));
assert(page.includes('<OpeningImageComparison post={selectedPost} t={t} />'));
console.log('PASS: actual admin JSX shows both linked images with truthful labels and leaves legacy posts without invented evidence');
