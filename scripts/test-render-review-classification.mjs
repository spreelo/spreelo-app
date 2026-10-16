import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import {reviewRenderedAdvertisingVideo} from '../lib/videoAdvertisingReview.js';
import {videoFailureDetails} from '../lib/videoFailureDiagnostics.js';
import {diagnoseFailedPost} from '../lib/adminFailureRecovery.js';
import {sendTerminalVideoAdminAlert} from '../lib/videoTerminalAdminAlert.js';
import {normalizeVideoDurationSeconds} from '../lib/videoDuration.js';

const frame=await sharp({create:{width:540,height:960,channels:3,background:'#122034'}}).png().toBuffer();
const reason="The closing card text is large and readable, but the CTA 'Upptäck nu' is not visually balanced or well centered; spacing and alignment make the card appear unfinished and less polished.";
const alignment={approved:false,issue:'unfinished_end_card',end_card_defect:'alignment_or_spacing_only',reason};
let request, reviews=0;
const reviewer=decision=>({responses:{create:async input=>{request=input;reviews++;return {output_text:JSON.stringify(decision)};}}});
const sampleFrames=async ({fractions})=>{assert.deepEqual(fractions,[0.14,0.42,0.68,0.96]);return fractions.map(()=>({buffer:frame}));};
const common={videoUrl:'https://example.com/existing-render.mp4',durationSeconds:6,sampleFrames,
  headline:'EGEN STIL',closingLine:'Upptäck nu',typographyPreflightPassed:true,deliveryFirstRender:true,allowReviewServiceOutage:true};
const advice=await reviewRenderedAdvertisingVideo({...common,openai:reviewer(alignment)});
assert.equal(advice.reviewStatus,'creative_advisory');
assert.equal(advice.creativeFeedback.issue,'wrong_alignment');
assert.equal(advice.creativeFeedback.reportedIssue,'unfinished_end_card');
assert.equal(advice.creativeFeedback.reason,reason,'the original actionable finding remains visible');
assert(request.text.format.schema.required.includes('end_card_defect'));
assert.match(request.input[0].content[0].text,/NEVER unfinished_end_card/);

// English prose alone must NEVER release old ambiguous rejections. A new
// explicit review of the actual saved render is needed, not a text regex.
const legacy={...alignment};delete legacy.end_card_defect;
await assert.rejects(()=>reviewRenderedAdvertisingVideo({...common,openai:reviewer(legacy)}),e=>e.code==='VIDEO_ADVERTISING_DESIGN_REJECTED');
for(const defect of ['missing_content','clipped_content','overlapping_content','other_visible_corruption']) {
  for(const issue of ['unfinished_end_card','wrong_alignment','none']) {
    await assert.rejects(()=>reviewRenderedAdvertisingVideo({...common,openai:reviewer({approved:true,issue,end_card_defect:defect,reason:'The CTA is partly clipped; alignment is also poor.'})}),
      e=>e.code==='VIDEO_ADVERTISING_DESIGN_REJECTED'&&e.review.issue==='unfinished_end_card'&&e.review.end_card_defect===defect);
  }
}
for(const issue of ['subject_overlap','stray_graphics']) {
  await assert.rejects(()=>reviewRenderedAdvertisingVideo({...common,openai:reviewer({...alignment,issue})}),e=>e.review.issue===issue);
}
console.log('PASS: reported alignment-only failure becomes recorded feedback; concrete corruption, contradictory approvals and old ambiguous reviews remain blocked');

// Exercise the real Kling render continuation, with paid providers unavailable.
// Cached artwork and the SAME completed render must be reused in both outcomes.
const source=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');
const code=source.slice(source.indexOf('async function getKlingFinalVideoSource('),source.indexOf('async function finalizeReadyTask('));
async function continueRender(decision,{persistError=null,oldRejection=false}={}) {
  const writes=[],polled=[];
  const selection={mode:'kling_professional_advertising_postprocess',shotstack_render_id:'a4b21bcb-8d81-4905-bbce-a9cc5d015f6d',
    kling_source_storage_url:'https://example.com/paid-source.mp4',end_card_url:'https://example.com/approved-card.png',
    text_overlay_copy:{headline:'EGEN STIL'},ad_creative_plan:{cta:'Upptäck nu'},delivered_duration_seconds:6,
    ...(oldRejection?{shotstack_design_review:{status:'rejected',reason:`Advertising visual quality rejected (unfinished_end_card): ${reason}`}}:{})};
  const post={id:'909f5888-d8b8-4de0-9096-eaaae6b761dc',kling_task_id:'939891107906453525',video_background_selection:selection};
  const supabase={from(table){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{},error:null};},
    update(values){writes.push({table,values});return this;},then(resolve){return Promise.resolve({error:persistError}).then(resolve);}};}};
  const context=vm.createContext({Date,console:{info(){},warn(){}},normalizeVideoDurationSeconds,
    getKlingAdvertisingPostprocess:p=>p.video_background_selection,
    createFinishedKlingTypographyOnce:async({selection:cached})=>cached,
    isRecoverableAestheticRejection:()=>false,
    waitForShotstackRender:async ({renderId})=>{polled.push(renderId);return {url:common.videoUrl};},
    reviewRenderedAdvertisingVideo,sampleRemoteVideoFrames:sampleFrames,KLING_PRODUCT_IDENTITY_AUDIT_MODEL:'mock',
    // Any new paid submission will throw because its API is deliberately absent.
  });
  vm.runInContext(code,context);
  let result,error;
  try {result=await context.getKlingFinalVideoSource({openai:reviewer(decision),supabase,post,task:{videoUrl:selection.kling_source_storage_url,durationSeconds:6}});} catch(e){error=e;}
  return {result,error,writes,polled,post};
}
const delivered=await continueRender(alignment);
assert.ifError(delivered.error);
assert.equal(delivered.result.videoUrl,common.videoUrl);
assert.deepEqual(delivered.polled,['a4b21bcb-8d81-4905-bbce-a9cc5d015f6d']);
assert.equal(delivered.writes[0].values.video_background_selection.shotstack_design_review.status,'creative_advisory');
assert.equal(delivered.writes[0].values.video_background_selection.kling_source_storage_url,'https://example.com/paid-source.mp4');
const damaged={approved:false,issue:'unfinished_end_card',end_card_defect:'clipped_content',reason:'The final CTA is clipped at the right edge.'};
const blocked=await continueRender(damaged);
assert.equal(blocked.error.code,'KLING_RENDER_DESIGN_REJECTED');
const checkpoint=blocked.writes[0].values.video_background_selection;
assert.equal(checkpoint.shotstack_design_review.review.end_card_defect,'clipped_content');
assert.equal(checkpoint.shotstack_design_review.render_url,common.videoUrl);
assert.equal(checkpoint.shotstack_render_id,blocked.polled[0]);
const dbFailure=await continueRender(damaged,{persistError:new Error('database unavailable')});
assert.match(dbFailure.error.message,/could not save review checkpoint: database unavailable/);
assert.equal(dbFailure.error.cause.review.reason,damaged.reason);
const before=reviews;
const old=await continueRender(alignment,{oldRejection:true});
assert.equal(old.error.code,'KLING_RENDER_DESIGN_REJECTED');
assert.equal(reviews,before,'previously blocked jobs are not silently unlocked');
assert.equal(old.polled.length,0);
console.log('PASS: real continuation reuses source/render, persists rejection evidence and URL, reports failed checkpoint writes and keeps old jobs locked');

const diagnostic=videoFailureDetails(blocked.error,{provider:'kling',stage:'kling_advertising_design',taskId:blocked.post.kling_task_id});
assert.equal(diagnostic.visual_review.reason,damaged.reason);
assert.equal(diagnostic.render_id,checkpoint.shotstack_render_id);
assert.match(diagnostic.action,/Starta inte en ny Kling-generering/);
const guide=diagnoseFailedPost({status:'failed',video_status:'failed',video_provider:'kling',video_background_selection:{failure_diagnostic:diagnostic}},'sv');
assert.equal(guide.category,'video');assert.equal(guide.allowRegenerate,false);
assert.equal(guide.reason,damaged.reason);assert.match(guide.instruction,/samma render-ID/);
assert.equal(diagnoseFailedPost({status:'failed',video_background_selection:{failure_diagnostic:diagnostic}},'en').allowRegenerate,false);

// Mock email transport: no incident or message is sent to a real service.
const priorKey=process.env.RESEND_API_KEY,priorFetch=globalThis.fetch;
let email,incident;
try {
  process.env.RESEND_API_KEY='test-only';
  globalThis.fetch=async(_url,{body})=>{email=JSON.parse(body);return {ok:true};};
  await sendTerminalVideoAdminAlert({supabase:{rpc:async(_name,params)=>{incident=params;return {data:{should_email:true}};}},post:blocked.post,
    code:blocked.error.code,message:blocked.error.message,stage:'kling_advertising_design',diagnostic});
  assert.match(email.text,/Åtgärd:/);assert.match(email.text,/Starta inte en ny Kling-generering/);
  assert(email.text.includes(`Granskningsfynd: ${damaged.reason}`));
  assert(email.text.includes(diagnostic.render_id));
  assert.equal(incident.p_metadata.visual_review.reason,damaged.reason);
} finally {globalThis.fetch=priorFetch;if(priorKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=priorKey;}
console.log('PASS: structured original reason, existing render ID and concrete recovery instructions reach diagnostics, admin view and email');
