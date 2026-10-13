import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagnoseFailedPost } from '../lib/adminFailureRecovery.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const failed=(failure={},other={})=>({status:'failed',id:'occurrence-abc',content_type_id:'website_item',failure,...other});
let diagnosis=diagnoseFailedPost(failed({failure_code:'worker_cron_unhandled_failure', failure_message_internal:'Project not specified.'}),'sv');
assert.equal(diagnosis.category,'database');
assert.equal(diagnosis.allowRegenerate,false);
assert.match(diagnosis.title,/Supabase/);
assert.match(diagnosis.instruction,/återanvändas|återställ/);

diagnosis=diagnoseFailedPost(failed({failure_code:'social_publish_failed',failure_stage:'social_publish'}),'sv');
assert.equal(diagnosis.category,'publishing');
assert.equal(diagnosis.allowRegenerate,false);
assert.match(diagnosis.instruction,/inte Regenerate/);

diagnosis=diagnoseFailedPost(failed({failure_code:'KLING_FINISHED_PRODUCT_IDENTITY_REJECTED',failure_stage:'kling_finished_product_identity'}, {
  id:'11112222-aaaa-bbbb-cccc-222233334444',video_provider:'kling',video_status:'failed',
  content_type_id:'ai_product_video',video_background_selection:{product_video_validation:{status:'failed'}}
}),'sv');
assert.equal(diagnosis.category,'audit');
assert.equal(diagnosis.action,'kling_retry');
assert.equal(diagnosis.allowRegenerate,false);
assert.match(diagnosis.safety,/debiteras/);

diagnosis=diagnoseFailedPost(failed({failure_code:'source_unavailable'},{work_item_id:'work-1',work_item:{rescue_status:'needed'}}),'sv');
assert.equal(diagnosis.action,'rescue');
assert.equal(diagnosis.allowRegenerate,false);
assert.match(diagnosis.instruction,/Rescue-ZIP/);

diagnosis=diagnoseFailedPost(failed({failure_code:'source_unavailable'},{work_item_id:'work-1',work_item:{rescue_status:'ready'}}),'sv');
assert.equal(diagnosis.allowRegenerate,true);
assert.match(diagnosis.instruction,/Regenerate/);

diagnosis=diagnoseFailedPost(failed({failure_code:'video_finalization_failed'},{work_item_id:'work-1',content_type_id:'ai_product_video', video_provider:'kling',work_item:{rescue_status:'needed'}}),'sv');
assert.equal(diagnosis.category,'video');
assert.equal(diagnosis.allowRegenerate,false);
assert.match(diagnosis.instruction,/uppgifts-ID/);

diagnosis=diagnoseFailedPost(failed({failure_code:'completely_undocumented_error'}),'sv');
assert.equal(diagnosis.category,'unknown');
assert.equal(diagnosis.confirmed,false);
assert.equal(diagnosis.allowRegenerate,false);

diagnosis=diagnoseFailedPost({status:'approved'},'sv');
assert.equal(diagnosis,null);

const page=read('app/admin/post-approvals/page.jsx');
assert.match(page,/import \{ diagnoseFailedPost \}/);
assert.match(page,/admin-v144340-failure-list-note/);
assert.match(page,/admin-v144340-failure-guide/);
assert.match(page,/selectedFailureGuide\.recordedMessage/);
assert.match(page,/selectedPost\.status !== "failed" \|\| canRegenerateFailedPost/);
assert.match(page,/confirm\(String\(locale\)/);
assert.match(read('app/globals.css'),/167-v144-340-failure-recovery-guide\.css/);
console.log('v144.340 failed-post explanation, recovery decision and UI safeguards: OK');
