import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {
  MAX_FINALIZATION_ATTEMPTS, finalizationJobGate, nextFinalizationControl,
  classifyProductionFailure, canRegenerateTypographyAfterKnownRejection,
  VIDEO_PRODUCTION_VERSION,
} from '../lib/videoProductionController.js';
import {ensureTypographyContrast} from '../lib/animatedTypographyQuality.js';
import {CREATIVE_DIRECTOR_BRIEF, creativeCorrectionInstruction} from '../lib/videoCreativeDirector.js';

assert.equal(VIDEO_PRODUCTION_VERSION,347);
assert.equal(MAX_FINALIZATION_ATTEMPTS,3);
const at=Date.parse('2026-10-15T00:10:00.000Z');
const technical=new Error('Storage temporarily unavailable');
let result=nextFinalizationControl({error:technical,nowMs:at});
assert.equal(result.terminal,false);
assert.equal(result.control.attempts,1);
assert.equal(result.control.next_retry_at,'2026-10-15T00:15:00.000Z');
assert.equal(result.control.provider_regeneration_allowed,false);
assert.equal(finalizationJobGate({video_status:'finalization_retry',video_background_selection:{finalization_control:result.control}},at+60_000).action,'defer');
result=nextFinalizationControl({error:technical,current:result.control,nowMs:at+5*60_000});
assert.equal(result.terminal,false);
assert.equal(result.control.attempts,2);
assert.equal(result.control.next_retry_at,'2026-10-15T00:25:00.000Z');
result=nextFinalizationControl({error:technical,current:result.control,nowMs:at+15*60_000});
assert.equal(result.terminal,true);
assert.equal(result.control.attempts,3);
assert.equal(result.control.next_retry_at,null);
assert.equal(finalizationJobGate({video_status:'finalization_retry',video_background_selection:{finalization_control:result.control}}).action,'review');
for(const code of ['KLING_TYPOGRAPHY_DESIGN_FAILED','VIDEO_ADVERTISING_DESIGN_REJECTED','KLING_RENDER_DESIGN_REJECTED','SHOTSTACK_SUBMISSION_UNKNOWN','KLING_TYPOGRAPHY_SUBMISSION_UNKNOWN']) {
  const error=Object.assign(new Error('Rejected'),{code});
  assert(classifyProductionFailure(error).permanent,code);
  assert.equal(nextFinalizationControl({error,nowMs:at}).terminal,true);
}
assert.equal(finalizationJobGate({video_status:'finalization_retry',video_background_selection:{text_overlay_status:'failed'}}).action,'review');
assert.equal(finalizationJobGate({video_status:'finalization_retry',video_background_selection:{shotstack_design_review:{status:'rejected'}}}).action,'review');
assert(canRegenerateTypographyAfterKnownRejection({code:'VIDEO_ADVERTISING_DESIGN_REJECTED'},1));
assert(!canRegenerateTypographyAfterKnownRejection({code:'VIDEO_ADVERTISING_DESIGN_REJECTED'},2));
assert(!canRegenerateTypographyAfterKnownRejection(Object.assign(new Error('Network timed out'),{code:'VIDEO_DESIGN_REVIEW_UNAVAILABLE'}),1));
assert.match(creativeCorrectionInstruction({review:{issue:'too_small',reason:'Text is tiny'}}),/too_small: Text is tiny/);
assert.match(CREATIVE_DIRECTOR_BRIEF,/no product-category|preset product-category/i);
console.log('PASS: known creative faults terminate, transient faults have durable 5/10-minute backoff and maximum 3 attempts; no blind regeneration');

const background=await sharp({create:{width:1080,height:1920,channels:3,background:{r:146,g:146,b:146}}}).png().toBuffer();
const lettering=await sharp({create:{width:1080,height:1920,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
  .composite([{input:await sharp({create:{width:390,height:55,channels:4,background:{r:145,g:145,b:145,alpha:255}}}).png().toBuffer(),left:160,top:720}])
  .png().toBuffer();
const judged=await ensureTypographyContrast({overlayBuffer:lettering,backgroundBuffers:[background],textBox:{left:150,top:700,width:500,height:100},preserveDesign:true});
assert.equal(judged.analysis.contrastCoverage,0);
assert.equal(judged.analysis.contrastMetricOnly,true);
assert.equal(judged.analysis.artworkPreserved,true);
assert(judged.buffer.equals(lettering),'Do not repaint GPT Image design');
console.log('PASS: 0% pixel contrast is a diagnostic signal, not a false terminal rejection; artwork unchanged for true visual reviewer');

const route=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');
const animation=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const reviewer=fs.readFileSync('lib/videoAdvertisingReview.js','utf8');
assert(route.includes('const productionGate = finalizationJobGate(post)'));
assert(!route.includes('&& !hasRecoverableTypographyFailure(post)'));
assert(route.includes('nextFinalizationControl({'));
assert(route.includes('await markKlingPostFailed(supabase,post,decision.stage'));
assert(route.includes("shotstack_submission_status:'submitting'"));
assert(route.includes("error.code = postprocess.quality_fallback ? 'QUALITY_FALLBACK_SUBMISSION_UNKNOWN' : 'SHOTSTACK_SUBMISSION_UNKNOWN'"));
assert(route.includes('text_overlay_approved_attempt: approvedArtwork.designAttempt'));
assert(route.includes('creativeCorrectionInstruction(designFeedback)'));
assert(route.includes('finalization_control:decision.control'));
assert(route.includes('CREATIVE_DIRECTOR_BRIEF'));
assert(animation.includes('creativeCorrectionInstruction(lastError)'));
assert(animation.includes('animated_advertising_design_needs_review'));
assert(reviewer.includes('FINAL COMPOSITED visible frames'));
console.log('PASS: code wired into actual Kling and animation routes, Shotstack submission ambiguity blocked, original visual audit and product guard retained');
