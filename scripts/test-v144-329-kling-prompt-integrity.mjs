import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(p, 'utf8');
const source = read('app/api/cron/run-automations/route.js');
const helper = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingPromptBudget.js'))}`);
const grab = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const context = {
  assembleKlingPrompt:helper.assembleKlingPrompt,
  truncateText:(v,n)=>String(v||'').trim().length>n?String(v).trim().slice(0,n)+'...':String(v||'').trim(),
  getCustomerFacingCampaignTheme:()=>'',
  formatCampaignIdentityLockForPrompt:()=>'',
  getKlingVerifiedViewInstruction:()=>'',
  postTextModel:()=>'gpt-test',
  safeJsonParse:JSON.parse,
  console,
};
vm.runInNewContext([
  grab('function getKlingProviderSafetyPrefix(', '\nfunction getKlingProductPromptFallback('),
  grab('function getKlingProductPromptFallback(', '\nasync function buildKlingProductVideoPrompt('),
  grab('async function buildKlingProductVideoPrompt(', '\nfunction buildKlingEngagementVideoPrompt('),
  grab('function buildKlingEngagementVideoPrompt(', '\nasync function submitKlingEngagementConceptVideo('),
  'this.buildProduct = buildKlingProductVideoPrompt; this.fallback = getKlingProductPromptFallback; this.buildEngagement = buildKlingEngagementVideoPrompt; this.fixed = getKlingProviderSafetyPrefix;',
].join('\n'),context);

const rule={website_item:{title:'Sony wireless earbuds',description:'Silver wireless earbuds and case'},brand_profile:{business_name:'Sony'}};
const view={verifiedViewLock:{verifiedView:'the exact silver charging case front and earbud outer shells',motionConstraint:'No rotation of case or earbuds.'}};
const candidate='A subtle camera push-in shows the unchanged earbuds on the marble table. Background person picks up a book while the camera remains on the verified view. The product stays still and unlit.';
const openai={chat:{completions:{create:async()=>({choices:[{message:{content:JSON.stringify({motion_prompt:candidate})}}]})}}};
const p=await context.buildProduct({openai,rule,postContent:'Try the new earbuds',referenceSafety:view});
assert(p.length<=2450,`Product prompt exceeds limit: ${p.length}`);
assert(p.includes(candidate),'Creative directions must fit fully if under the allocation');
assert(p.includes('LIGHT AND EFFECT LOCK'),'Product prompt must forbid invented lights');
assert(p.includes('character-for-character'),'Product logos must stay locked');
assert(p.includes('No rotation of case or earbuds.'),'Model must receive exact product view constraint');
assert(!p.endsWith('...'),'No prompt may end with truncation ellipsis');
console.log('PASS: Sony product prompt contains whole creative direction + verified view + light and surface locks; length',p.length);

const tooLongCreative=Array(35).fill('Camera moves quietly behind the coffee table without touching the product.').join(' ');
const long=await context.buildProduct({openai:{chat:{completions:{create:async()=>({choices:[{message:{content:JSON.stringify({motion_prompt:tooLongCreative})}}]})}}},rule,referenceSafety:view});
assert(long.length<=2450);
assert(!long.endsWith('...') && /[.!?;]$/.test(long));
assert(/[.!?;]$/.test(long) && long.split('Camera moves quietly').length>1);
console.log('PASS: Oversize AI creative description is reduced to complete sentences, not cut mid sentence; length',long.length);

const f=context.fallback({rule,postContent:'a'.repeat(5000),referenceSafety:view});
assert(f.length<=2450 && !f.endsWith('...'));
assert(f.includes('LIGHT AND EFFECT LOCK'));
console.log('PASS: Deterministic fallback prompt is complete and within budget; length',f.length);

const e=context.buildEngagement({rule,postContent:'Engagement campaign. '.repeat(100),referenceSafety:view});
assert(e.length<=2450 && !e.endsWith('...'));
assert(e.includes('LIGHT AND EFFECT LOCK'));
console.log('PASS: Engagement video prompt is complete and within budget; length',e.length);

const retry=read('app/api/admin/post-approvals/retry-kling/route.js');
assert.match(retry,/assembleKlingPrompt\(\{ safety: retryLock, direction: creative, maxCreative: 1200 \}\)/);
assert.doesNotMatch(retry,/\.slice\(0,\s*2500\)/);
const provider=read('lib/kling.js');
assert.match(provider,/KLING_PROMPT_TOO_LONG/);
assert.match(provider,/const exactPrompt = String\(prompt\)\.trim\(\)/);
assert.doesNotMatch(provider,/String\(prompt\)\.trim\(\)\.slice\(0, 2500\)/);
const control=read('lib/aiModelControl.js');
assert.match(control,/key:'kling_video'.*provider:'kling'/);
assert.doesNotMatch(control,/runway|\bwan\b/i);
console.log('PASS: retry + paid provider use explicit prompt-length safety; only Kling video provider is registered');
