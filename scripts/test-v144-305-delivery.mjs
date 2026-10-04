import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {completeShotstackDelivery} from '../lib/shotstackDelivery.js';
function setup({review=false,test=false,admin=false,released=false,failMail=false}={}){
 const delivery={lease_token:'token',status:'pending',history_done:false,credits_done:false};
 const post={id:'same-post',user_id:'user',brand_profile_id:'brand',automation_rule_id:'rule',status:'pending_approval',
  video_status:'ready',approval_token:'saved-token',content:'Exact caption',admin_review_status:released?'released':'not_required',
  approval_email_sent_at:released?'2026-10-04T02:00:00Z':null,
  video_background_selection:{shotstack_checkpoint:{origin:admin?'admin':'automation',occurrence_id:'occurrence',delivery_context:{website_item:{title:'Exact product'}}}}};
 const writes=[],counts={mail:0,history:0,credits:0};let failed=false;
 const supabase={async rpc(name){
  if(name==='claim_shotstack_delivery')return {data:delivery.status==='completed'?{claimed:false,status:'completed'}:{claimed:true,delivery},error:null};
  if(name==='settle_shotstack_delivery_credit'){counts.credits++;delivery.credits_done=true;return {error:null};}
  throw new Error(`unexpected ${name}`);
 },from(table){const query={eq(){return query;},select(){return query;},then(resolve,reject){return Promise.resolve({data:[{post_id:post.id}],error:null}).then(resolve,reject);}};
 return {update(values){writes.push({table,values});if(table==='shotstack_post_deliveries')Object.assign(delivery,values);if(table==='posts')Object.assign(post,values);return query;},upsert(values){writes.push({table,values});return query;}};
 }};
 const options={supabase,post,rule:{},reviewRequired:review,isAdminTest:test,getRecipient:async()=>({email:'customer@example.com'}),
  saveHistory:async({context})=>{counts.history++;assert.equal(context.website_item.title,'Exact product');},
  sendEmail:async({post,delivery})=>{counts.mail++;assert.equal(post.approval_token,'saved-token');if(failMail&&!failed){failed=true;throw new Error('temporary delivery failure');}delivery.mail_sent_at=new Date().toISOString();}};
 return {options,counts,post,delivery,writes};
}
for(const kind of [{review:true},{test:true},{admin:true}]){
 const t=setup(kind);const result=await completeShotstackDelivery(t.options);assert(result.completed);assert(result.reviewRequired);
 assert.equal(t.counts.mail,0);assert.equal(t.post.admin_review_status,'pending');assert(t.writes.some(w=>w.table==='admin_review_cases'&&w.values.status==='awaiting_spreelo'));
 await completeShotstackDelivery(t.options);assert.equal(t.counts.history,1);assert.equal(t.counts.credits,1);
}
const direct=setup();assert((await completeShotstackDelivery(direct.options)).emailed);assert.equal(direct.counts.mail,1);assert.equal(direct.post.admin_review_status,'not_required');assert(direct.writes.some(w=>w.table==='admin_review_cases'&&w.values.status==='sent_directly'));
assert(direct.writes.some(w=>w.table==='admin_generation_work_items'&&w.values.status==='history'));
await completeShotstackDelivery(direct.options);assert.equal(direct.counts.mail,1);assert.equal(direct.counts.credits,1);
const interrupted=setup({failMail:true});assert((await completeShotstackDelivery(interrupted.options)).deliveryPending);assert.equal(interrupted.post.video_status,'ready');assert.equal(interrupted.post.admin_review_status,'pending');assert.equal(interrupted.delivery.status,'pending');
assert((await completeShotstackDelivery(interrupted.options)).completed);assert.equal(interrupted.counts.history,1);assert.equal(interrupted.counts.credits,1);
const released=setup({review:true,released:true});assert((await completeShotstackDelivery(released.options)).completed);assert.equal(released.counts.mail,0);assert.equal(released.post.admin_review_status,'released');
// Kling settlement happened at task submission: delivery must not repeat it.
for(const settings of [{}, {review:true}, {test:true}, {failMail:true}]){
 const t=setup(settings);t.options.submissionAlreadySettled=true;t.post.video_provider='kling';
 t.post.video_background_selection={};
 const first=await completeShotstackDelivery(t.options);
 if(settings.failMail){assert(first.deliveryPending);assert((await completeShotstackDelivery(t.options)).completed);}
 else assert(first.completed);
 assert.equal(t.counts.history,0);assert.equal(t.counts.credits,0);
 assert.equal(t.delivery.history_done,true);assert.equal(t.delivery.credits_done,true);
 assert(t.writes.some(w=>w.table==='admin_review_cases'&&w.values.status===(settings.review||settings.test?'awaiting_spreelo':'sent_directly')));
 await completeShotstackDelivery(t.options);
 assert.equal(t.counts.mail,settings.review||settings.test?0:settings.failMail?2:1);
}
// Exercise the actual email implementation, including stable payload and provider key.
const source=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const begin=source.indexOf('export async function sendApprovalEmail');const emailCode=source.slice(begin,source.indexOf('async function publishTextPostToFacebook',begin)).replace('export async','async');
const bodies=[],headers=[];let fail=true;const emailDelivery={lease_token:'lease'};
const context=vm.createContext({console,Date,Error,Object,String,JSON,AbortSignal,APP_URL:'https://app.example.com',RESEND_FROM_EMAIL:'from@example.com',
 detectLikelyUiLocaleFromText:()=> 'en',resolveUiLocaleFromLanguageName:()=> 'en',resolveBestServerLocale:()=> 'en',
 getServerTranslations:async()=>({t:key=>key}),normalizeContentFormat:x=>x,getNextRuleInPlan:async()=>null,getUpcomingPlanUrlForFinalWeeklyRule:async()=>null,
 buildApprovalEmailHtml:()=>'<p>Saved</p>',buildApprovalEmailText:()=> 'Saved',
 fetch:async(url,args)=>{bodies.push(args.body);headers.push(args.headers);if(fail){fail=false;throw new Error('response interrupted');}return {ok:true,json:async()=>({id:'same-email'})};}});
vm.runInContext(emailCode,context);
const options={supabase:direct.options.supabase,resendApiKey:'test',to:'customer@example.com',rule:{},postContent:'Saved',approvalToken:'token',postId:'same-post',contentFormat:'animated_video',durableDelivery:emailDelivery};
await assert.rejects(context.sendApprovalEmail(options),/interrupted/);
options.to='changed@example.com';await context.sendApprovalEmail(options);
assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);assert.equal(headers[0]['Idempotency-Key'],headers[1]['Idempotency-Key']);assert.equal(headers[0]['Idempotency-Key'],'shotstack-approval/same-post');
emailDelivery.email_first_attempt_at=new Date(Date.now()-24*3600_000).toISOString();emailDelivery.mail_sent_at=null;
await assert.rejects(context.sendApprovalEmail(options),e=>e.code==='EMAIL_RECONCILIATION_REQUIRED');assert.equal(bodies.length,2);
const deliverySource=fs.readFileSync('lib/shotstackDelivery.js','utf8');assert(!deliverySource.includes('queueShotstackRender'));assert(!deliverySource.includes('images.edit'));
assert(source.includes('delivery_completed:recoveredDelivery?.completed'));
console.log('v144.305 delivery: direct customer, admin gate, test gate, released post, interrupted mail, same saved payload/key, duplicate steps and no paid regeneration passed.');
