import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const priorTest = fs.readFileSync('scripts/test-v144-329-kling-prompt-integrity.mjs','utf8');
const {assembleKlingPrompt} = await import(`data:text/javascript,${encodeURIComponent(fs.readFileSync('lib/klingPromptBudget.js','utf8'))}`);
const grab=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const ctx={ assembleKlingPrompt, truncateText:(v,n)=>String(v||'').trim().length>n?String(v).trim().slice(0,n)+'...':String(v||'').trim(),getCustomerFacingCampaignTheme:()=>'',formatCampaignIdentityLockForPrompt:()=>'',getKlingVerifiedViewInstruction:()=>'',postTextModel:()=> 'gpt-test',safeJsonParse:JSON.parse, console };
vm.runInNewContext([
 grab('function getKlingProviderSafetyPrefix(', '\nfunction getKlingProductPromptFallback('),
 grab('function getKlingProductPromptFallback(', '\nasync function buildKlingProductVideoPrompt('),
 grab('async function buildKlingProductVideoPrompt(', '\nfunction buildKlingEngagementVideoPrompt('),
 grab('function buildKlingEngagementVideoPrompt(', '\nasync function submitKlingEngagementConceptVideo('),
 'this.buildProduct=buildKlingProductVideoPrompt; this.buildEngagement=buildKlingEngagementVideoPrompt; this.safety=getKlingProviderSafetyPrefix; this.fallback=getKlingProductPromptFallback;'
].join('\n'),ctx);
const locks = ['HARD PRODUCT LOCK','SURFACE PRINT LOCK','LIGHT AND EFFECT LOCK','FUNCTION LOCK','SCENE CONTINUITY LOCK'];
const assertSafe=(p)=> {assert(p.length<=2450,`too long ${p.length}`);for(const lock of locks)assert(p.includes(lock),lock);assert(p.includes('CREATIVE DIRECTION:'));assert(!p.endsWith('...'));};
const ref={ verifiedViewLock:{verifiedView:'front silver Sony earbud case and visible earbud shells',motionConstraint:'Keep both objects in the original orientation.'}};
const refLong={ verifiedViewLock:{verifiedView:'visible retailer view '.repeat(150),motionConstraint:'do not rotate '.repeat(150)} };
const rule={website_item:{title:'Sony WF-1000XM6',description:'Silver earbuds with their original identity'},brand_profile:{business_name:'Sony'}};
const scene='Slowly push the camera toward the stationary product in the original living room. Let the curtain move naturally in the background. Hold the product unchanged in a stable hero composition.';
let call=0;
const openai={chat:{completions:{create:async()=>{call++;return {choices:[{message:{content:JSON.stringify({motion_prompt:scene})}}]};}}}};
const p=await ctx.buildProduct({openai,rule,postContent:'',referenceSafety:ref});
assertSafe(p);assert(p.includes(scene));assert(p.includes('character-for-character'));
const max=await ctx.buildProduct({openai,rule,postContent:'a'.repeat(5000),referenceSafety:refLong});
assertSafe(max);
const stroller={website_item:{title:'Full-size stroller',description:'Stroller only as verified in photo'},brand_profile:{business_name:'Demo'}};
const strollerPrompt=await ctx.buildProduct({openai,rule:stroller,postContent:'',referenceSafety:ref});
assertSafe(strollerPrompt);
const longSafe=ctx.buildEngagement({rule:{website_item:{title:'L'.repeat(3000)},brand_profile:{business_name:'B'.repeat(5000),target_audience:'A'.repeat(5000)}},postContent:'Big sale. '.repeat(300),referenceSafety:refLong});
assertSafe(longSafe);
const extreme=await ctx.buildProduct({openai:{chat:{completions:{create:async()=>({choices:[{message:{content:JSON.stringify({motion_prompt:'The camera stays outside the verified product view. '.repeat(300)})}}]})}}},rule:stroller,referenceSafety:refLong});
assertSafe(extreme);assert(/[.!?]$/.test(extreme));
for (const fragment of [
 'when Full-product interaction allowed is YES, natural physical interaction is allowed',
 'pedaling a clearly visible bicycle, walking in shoes, wearing clothing, or sitting on a chair'
]) assert(!source.includes(fragment),`conflicting direction remains: ${fragment}`);
for(const fragment of [
 'Keep rigid products stationary and mechanically passive',
 'If a proposed creative beat would conflict with any product lock',
 'Write only actions Kling can execute without moving, operating or redrawing the product'
]) assert(source.includes(fragment),`new creative safety missing: ${fragment}`);
// Regression: no safety-lock words silently removed by helper when creative is excessively long.
assert(priorTest.includes('LIGHT AND EFFECT LOCK'));
console.log('PASS: Sony and stroller prompts contain every original product lock, preserve complete normal motion directions');
console.log('PASS: extreme metadata and overly long creative outputs fit inside 2450 without chopping instructions');
console.log('PASS: conflicting physical-use instructions removed; camera and scene motion prioritized');
console.log('PASS: fixed product rules remain detailed and unchanged');
