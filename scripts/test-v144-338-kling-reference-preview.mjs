import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const read = p => fs.readFileSync(p, 'utf8');
const refs = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingAuditReferences.js'))}`);
const preview = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingAdminVideo.js'))}`);
const clone = value => JSON.parse(JSON.stringify(value));
const full = { id: 'post', user_id: 'customer', kling_task_id: 'paid-task', kling_reference_image_url: 'https://store.test/scene.png', image_url: 'https://store.test/scene.png', video_background_selection: {
  verified_product_image_url: 'https://store.test/original.png', reference_safety: { verifiedViewLock: { verifiedView: 'source-facing front', motionConstraint: 'Keep the same original front.' } },
  kling_source_url: 'https://provider.test/paid.mp4', kling_source_status: 'succeeded',
} };
const project = (post, select) => Object.fromEntries(select.split(',').map(x => x.trim()).filter(x => Object.hasOwn(post, x)).map(x => [x,post[x]]));
const selected = project(full,refs.KLING_FINALIZER_POST_SELECT);
assert.equal(refs.assertKlingAuditReferences(selected).sceneUrl, full.kling_reference_image_url);
const oldProjection = project(full,'id, user_id, video_background_selection, kling_task_id');
assert.throws(() => refs.assertKlingAuditReferences(oldProjection), error => error.code === 'KLING_AUDIT_REFERENCES_MISSING' && error.missingReferences.includes('scene_image'));
for (const field of ['image_url','kling_reference_image_url','video_background_selection']) assert(refs.KLING_FINALIZER_POST_SELECT.split(',').map(x => x.trim()).includes(field));
console.log('PASS: reproduced the production missing-column failure; new actual cron projection includes both scene-image fields');

function database(post, options = {}) {
  let stored = clone(post), writes = 0;
  const api = { from: () => {
    let isWrite = false;
    const q = { select: () => q, eq: () => q,
      update: data => { isWrite = true; writes++; stored = { ...stored, ...clone(data) }; return q; },
      maybeSingle: async () => options.error ? { error: { message: 'unavailable' } } : { data: options.dropBackup && isWrite ? { ...stored, video_background_selection: {} } : clone(stored) },
      then: resolve => resolve({ error: options.error ? { message: 'unavailable' } : null }),
    }; return q;
  }, get stored() { return stored; }, get writes() { return writes; } };
  return api;
}
const db = database(full);
await refs.verifyPreparedKlingAuditReferences({ supabase: db, postId: full.id });
assert.equal(db.stored.video_background_selection.kling_audit_references.scene_image_url, full.kling_reference_image_url);
assert.equal(db.stored.video_background_selection.kling_audit_references.product_image_url, full.video_background_selection.verified_product_image_url);
let submissions = 0;
async function submitAfterVerification(post, options) { await refs.verifyPreparedKlingAuditReferences({ supabase: database(post,options), postId: post.id }); submissions++; }
const missing = clone(full); delete missing.video_background_selection.verified_product_image_url;
await assert.rejects(() => submitAfterVerification(missing), error => error.code === 'KLING_AUDIT_REFERENCES_MISSING');
await assert.rejects(() => submitAfterVerification(full,{error:true}), /no paid submission/);
await assert.rejects(() => submitAfterVerification(full,{dropBackup:true}), error => error.code === 'KLING_AUDIT_REFERENCES_MISSING');
assert.equal(submissions,0);
await submitAfterVerification(full); assert.equal(submissions,1);
const concept = { id:'concept',image_url:'https://store.test/concept.png',video_background_selection:{identity_validation_required:false} };
await refs.verifyPreparedKlingAuditReferences({supabase:database(concept),postId:'concept'});
const contract = db.stored;
contract.video_background_selection.identity_validation_required = false;
assert(refs.klingAuditReferences(contract).productRequired,'Mutable metadata must not weaken an immutable product reference contract');
console.log('PASS: source/start/view contract persisted and read back before paid submission; missing data or storage errors produce zero submissions');

const legacy = clone(full); delete legacy.video_background_selection.reference_safety;
await refs.restoreKlingLegacyViewLock({supabase:database(legacy),post:legacy});
assert.equal(legacy.video_background_selection.reference_safety.verifiedViewLock.source,'legacy_strict_same_view_recovery');
assert.doesNotThrow(() => refs.assertKlingAuditReferences(legacy));
const noOriginal = clone(missing); delete noOriginal.video_background_selection.reference_safety;
assert.equal(await refs.restoreKlingLegacyViewLock({supabase:database(noOriginal),post:noOriginal}),false);
assert.throws(() => refs.assertKlingAuditReferences(noOriginal));
assert(refs.recoverableKlingReferenceFailure({...full,video_status:'failed',video_error:'Kling quality audit reference prerequisites are missing'}));
assert(refs.recoverableKlingReferenceFailure({...full,video_status:'failed',video_error:'Kling generation did not finish within 6 hours.'}));
assert(!refs.recoverableKlingReferenceFailure({...full,video_status:'failed',video_error:'Actual Kling provider failure'}));
assert(!refs.recoverableKlingReferenceFailure({...full,video_status:'failed',video_error:'reference prerequisites are missing',video_background_selection:{...full.video_background_selection,product_video_validation:{status:'failed'}}}));
console.log('PASS: safe legacy view recovery uses the authoritative original; generated scene can never substitute for it; confirmed quality rejection never auto-reopens');

assert.equal(preview.adminVideoSources(full).previewUrl,full.video_background_selection.kling_source_url);
assert(preview.adminVideoSources(full).isSourcePreview);
assert.equal(preview.adminVideoSources({...full,video_url:'https://store.test/final.mp4'}).previewUrl,'https://store.test/final.mp4');
assert.equal(preview.adminVideoSources({image_url:'https://store.test/image.png'}).previewUrl,'');
assert.equal(preview.adminVideoSources({video_background_selection:{kling_source_url:'javascript:alert(1)'}}).previewUrl,'');
const page = read('app/admin/post-approvals/page.jsx');
assert(page.includes('<video key={video.previewUrl} src={video.previewUrl}'));
assert(page.includes('admin.approvals.sourceVideoPending'));
assert(page.includes('adminVideoSources(selectedPost).previewUrl ? t("admin.approvals.video")'));
console.log('PASS: admin previews paid raw clip, prefers final delivery when ready, and identifies video media correctly');

const source = read('app/api/cron/finalize-kling-videos/route.js');
const grab = (start,end) => source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
let downloads = 0, uploads = 0;
const copyCtx = { POST_VIDEOS_BUCKET:'post-videos',console,
  downloadKlingVideo:async () => {downloads++;return Buffer.from('paid-mp4');},
  normalizeVideoDurationSeconds:(...v)=>v.find(x=>Number(x)>0),
};
vm.runInNewContext(grab('async function saveKlingQualitySelection(', '\nasync function getKlingQualityFallbackSource(') + '\n' + grab('async function preserveKlingSourceVideo(', '\nasync function setReviewCaseFailure(') + '\n' + grab('function getCachedKlingSource(', '\nfunction finalizationLeaseIsFresh(') + '\nthis.copy=preserveKlingSourceVideo;this.cached=getCachedKlingSource;',copyCtx);
const copyDb = database(full);
copyDb.storage = {from:()=>({upload:async () => {uploads++;return {};},getPublicUrl:()=>({data:{publicUrl:'https://store.test/paid-source.mp4'}})})};
const copyPost = clone(full); copyPost.kling_task_status = 'failed';
const task = {status:'succeeded',videoUrl:full.video_background_selection.kling_source_url,durationSeconds:6};
assert.equal((await copyCtx.copy({supabase:copyDb,post:copyPost,task})).videoUrl,'https://store.test/paid-source.mp4');
await copyCtx.copy({supabase:copyDb,post:copyPost,task});
assert.equal(downloads,1);assert.equal(uploads,1);
assert.equal(copyPost.video_url,undefined,'Raw source must never be written into customer-ready video_url');
assert.equal(copyCtx.cached(copyPost).status,'succeeded','Local failure must not overwrite a successful cached provider result');
assert.equal(copyCtx.cached(copyPost).videoUrl,'https://store.test/paid-source.mp4');
let refreshes = 0;
copyCtx.downloadKlingVideo = async url => {
  if (url.includes('provider.test/paid.mp4')) { const error = new Error('expired'); error.httpStatus = 403; throw error; }
  return Buffer.from('paid-mp4');
};
copyCtx.isKlingTaskSuccessful = value => value === 'succeeded';
copyCtx.getKlingImageToVideoTask = async id => { assert.equal(id,'paid-task'); refreshes++; return {status:'succeeded',videoUrl:'https://provider.test/refreshed.mp4'}; };
const expiredPost = clone(full);
await copyCtx.copy({supabase:copyDb,post:expiredPost,task});
assert.equal(refreshes,1);
assert.equal(expiredPost.video_background_selection.kling_source_url,'https://provider.test/refreshed.mp4');
console.log('PASS: expired provider link refreshed with a read-only lookup of the same paid task before MP4 preservation');
const queue = read('app/api/cron/run-automations/route.js');
assert.equal((queue.match(/await verifyPreparedKlingAuditReferences\(/g)||[]).length,3);
assert(read('app/api/admin/post-approvals/retry-kling/route.js').includes('await verifyPreparedKlingAuditReferences('));
assert(source.includes('if (!task && submittedAtMs > 0 && ageHours > maxPendingHours)'));
assert(source.includes('finalizeError?.code === "KLING_AUDIT_REFERENCES_MISSING"'));
const release = read('app/api/admin/post-approvals/route.js');
assert(release.includes('post.video_status !== "ready" || !post.video_url'));
console.log('PASS: paid MP4 copied once before inspection; saved source resumes after old timeout; no customer release of an unfinished raw clip');

// Render the actual JSX component: a cached raw video must win over its poster
// and even stale carousel slides. No external site or browser session is used.
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const mediaStart = page.indexOf('function MediaPreview(');
const mediaEnd = page.indexOf('\nexport default function', mediaStart);
assert(mediaEnd > mediaStart);
const transformed = await transform(page.slice(mediaStart,mediaEnd), { filename:'MediaPreview.jsx',
  jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}},target:'es2020'},module:{type:'commonjs'},
});
const componentCtx = { React, adminVideoSources:preview.adminVideoSources,
  getPostMediaItems:()=>[], AlertTriangle:()=>React.createElement('span'), ExternalLink:()=>React.createElement('span'),
};
vm.runInNewContext(transformed.code+'\nthis.component=MediaPreview;',componentCtx);
const html = renderToStaticMarkup(React.createElement(componentCtx.component,{post:{...full,slides:[{image_url:'https://store.test/stale.png'}]},t:key=>key}));
assert(html.includes('<video'));
assert(html.includes('https://provider.test/paid.mp4'));
assert(html.includes('admin.approvals.sourceVideoPending'));
assert(!html.includes('stale.png'));
console.log('PASS: actual admin JSX renders the raw video player and open-video link despite an existing poster or stale slides');
