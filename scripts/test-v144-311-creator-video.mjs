import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import { normalizeKlingLayout } from '../lib/klingLayout.js';

// Exercise the production initialization callback under fresh, hidden-guide,
// repeated-render, editing, campaign and manual-entry states.
const page = fs.readFileSync('app/automation/page.jsx', 'utf8');
const marker = page.indexOf('// Initialize the draft independently');
const start = page.indexOf('useEffect(() => {', marker) + 'useEffect(() => {'.length;
const end = page.indexOf('\n  }, [loading', start);
const init = page.slice(start, end);
function context(overrides = {}) {
  const calls = [];
  return vm.createContext({loading:false,currentBrandId:'brand',currentBrandProfile:{},currentUserEmail:'a@example.com',initialAutoPlanBrandsRef:{current:new Set()},window:{location:{search:''}},URLSearchParams,isRecentCalendarCampaignHandoff:()=>false,getStoredCalendarCampaignHandoff:()=>null,editingRuleId:'',savedPlanSummary:null,planCreationMode:'auto',slots:[],autoPlanGoal:'sell_more',autoPlanPostCount:5,applyDynamicAutoPlan:args=>{calls.push(args);return Promise.resolve();},calls,...overrides});
}
const run = state => vm.runInContext(`(function(){${init}\n})()`, state);
const fresh=context();run(fresh);run(fresh);
assert.equal(fresh.calls.length,1);assert.equal(fresh.calls[0].goalId,'sell_more');assert.equal(fresh.calls[0].postCount,5);
// No dependency on the welcome preference or whether the user has older plans.
const hidden=context({showSmartOnboarding:false,hasCompletedFirstPlan:true});run(hidden);assert.equal(hidden.calls.length,1);
for (const overrides of [{loading:true},{currentBrandProfile:null},{editingRuleId:'saved'},{savedPlanSummary:{}},{planCreationMode:'manual'},{planCreationMode:'select'},{planCreationMode:'campaign'},{slots:[{id:'edited'}]},{autoPlanGoal:''},{window:{location:{search:'?plan=saved'}}},{window:{location:{search:'?campaignId=campaign'}}},{isRecentCalendarCampaignHandoff:()=>true}]) {
 const state=context(overrides);run(state);assert.equal(state.calls.length,0,JSON.stringify(overrides));
}
const loading=context({loading:true});run(loading);loading.loading=false;run(loading);assert.equal(loading.calls.length,1);
assert(!init.includes('/api/onboarding-plan'));assert(!init.includes('savePlan'));
console.log('Initial plan: fills Sell more once after loading; hidden welcome, existing/editable plans, manual and campaign guards passed.');

// Exercise the real deterministic closing renderer with isolated storage;
// fallback must produce readable lettering without a fake interactive button.
const source=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');
const functionStart=source.indexOf('async function createKlingCtaOverlay');
const functionEnd=source.indexOf('function layoutDeterministicTypography',functionStart);
let svgText='', uploads=0;
const sharpCapture=input=>{if(Buffer.isBuffer(input)&&input.toString().startsWith('<svg'))svgText=input.toString();return sharp(input);};
const closing=vm.createContext({Buffer,sharp:sharpCapture,Math,Number,Date,normalizeKlingLayout,getKlingPlacementBox:()=>({left:64,top:1320,width:620,height:180}),normalizeKlingCreativeLine:v=>v,getFallbackKlingCta:()=> 'Explore the collection',getProductTypographyProfile:()=>({family:'DejaVu Sans',direction:'ltr'}),escapeProductSvg:v=>v,layoutDeterministicTypography:()=>({lines:['Explore the collection'],fontSize:56,lineHeight:65}),uploadKlingCtaOverlay:async({buffer})=>{uploads++;assert.equal((await sharp(buffer).metadata()).width,1080);return {imageUrl:'closing.png',storagePath:'closing.png'};}});
vm.runInContext(source.slice(functionStart,functionEnd),closing);
const result=await closing.createKlingCtaOverlay({supabase:{},post:{},selection:{},creativePlan:{cta:'Explore the collection',cta_layout:normalizeKlingLayout(null,{left:64,top:1320,width:620,height:180},0,true)}});
assert.equal(uploads,1);assert.equal(result.cta_overlay_copy,'Explore the collection');assert(!svgText.includes('<rect'));assert(!svgText.includes('→'));assert(svgText.includes('font-size="56"'));
await closing.createKlingCtaOverlay({supabase:{},post:{},selection:result,creativePlan:{}});assert.equal(uploads,1);
assert(source.includes('design_direction: truncate(parsed?.design_direction, 600)'));
assert(fs.readFileSync('lib/klingEndCard.js','utf8').includes('No website address, button'));
console.log('Closing line: plain mobile-readable typography, no button/arrow; cached layers reused; per-video art direction wired through.');
