import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateApprovedTextCost, calculateApprovedImageCost, findApprovedOpenAIPrice } from '../lib/openaiApprovedPricing.js';
import { calculateOpenAICost, createGenerationCostTracker, wrapOpenAIForCostTracking } from '../lib/generationCostTracking.js';
// Test the new engine explicitly; the production default is OFF.
process.env.SPREELO_OPENAI_PRICING_ENABLED = 'true';
const now = new Date().toISOString();
const rate = { model:'gpt-5.5', service_tier:'standard', version:'approved-1',
  input_usd_per_m:5,cached_input_usd_per_m:0.5,output_usd_per_m:30,approved:true,
  valid_from:'2020-01-01T00:00:00Z',valid_until:null,
  source_url:'https://developers.openai.com/api/docs/pricing',source_fingerprint:'reviewed' };
const response = {id:'resp_demo_1',model:'gpt-5.5',service_tier:'default',usage:{input_tokens:1000,output_tokens:100,input_tokens_details:{cached_tokens:200}},output:[]};
function db({storedRate=rate,error=null}={}) {
  const records = [];
  const query = {select(){return this;},eq(){return this;},lte(){return this;},order(){return this;},limit(){return Promise.resolve({data:storedRate?[storedRate]:[],error});},upsert(payload){records.push(payload);return Promise.resolve({error:null});}};
  return {records,from(name){ if(name==='openai_price_versions'||name==='post_generation_cost_events') return query; throw new Error('Unexpected query '+name); }};
}
test('approved tariff calculates weighted token cost; never claims invoice verification',()=>{
  const cost=calculateApprovedTextCost({model:'gpt-5.5',usage:response.usage,rate,operation:'responses.create',response,at:now});
  assert.equal(cost.amount,0.0071);
  assert.equal(cost.exact,false);
  assert.match(cost.note,/NOT invoice/);
});
test('approved rate must be exact model, tier, and effective date',()=>{
  assert.equal(calculateApprovedTextCost({model:'gpt-5.5-latest',usage:response.usage,rate,at:now}).amount,null);
  assert.equal(calculateApprovedTextCost({model:'gpt-5.5',usage:response.usage,rate:{...rate,valid_until:'2021-01-01T00:00:00Z'},at:now}).amount,null);
});
test('unpriced tools, missing token usage and long context must remain incomplete',()=>{
  assert.equal(calculateApprovedTextCost({model:'gpt-5.5',usage:null,rate,at:now}).amount,null);
  assert.equal(calculateApprovedTextCost({model:'gpt-5.5',usage:{input_tokens:272001,output_tokens:2},rate,at:now}).amount,null);
  assert.equal(calculateApprovedTextCost({model:'gpt-5.5',usage:response.usage,rate,response:{...response,output:[{type:'web_search_call'}]},at:now}).amount,null);
});
test('runtime tracker integrates registry; does not change model call',async()=>{
  const storage=db();
  const tracker=createGenerationCostTracker({supabase:storage});
  const cost=await tracker.recordOpenAI('responses.create',{model:'gpt-5.5'},response);
  assert.equal(cost.amount,0.0071);
  assert.equal(storage.records.length,1);
  assert.equal(storage.records[0].pricing_version,'approved-1');
  assert.equal(storage.records[0].exact,false);
  assert.equal(storage.records[0].provider_request_id,'resp_demo_1');
});
test('unknown models cannot silently become free', async()=>{
  const storage=db({storedRate:null});
  const tracker=createGenerationCostTracker({supabase:storage});
  const cost=await tracker.recordOpenAI('responses.create',{model:'future-model'}, {...response,model:'future-model'});
  assert.equal(cost.amount,null);
  assert.equal(cost.exact,false);
});
test('registry unavailable never prevents a generated response from being delivered',async()=>{
  const storage=db({error:{message:'temporary registry unavailable'}});
  const tracker=createGenerationCostTracker({supabase:storage});
  let sent=0;
  const client=wrapOpenAIForCostTracking({responses:{create:async () => {sent++;return response;}}},()=>tracker);
  const got=await client.responses.create({model:'gpt-5.5'});
  assert.equal(got.id,response.id);
  assert.equal(sent,1);
  assert.equal(storage.records.length,1);
  assert.equal(storage.records[0].exact,false);
});
test('nonstandard tier cannot be priced using standard rates',async()=>{
  const storage=db();
  const tracker=createGenerationCostTracker({supabase:storage});
  const cost=await tracker.recordOpenAI('responses.create',{model:'gpt-5.5'},{...response,service_tier:'priority'});
  assert.equal(cost.amount,null);
});
test('approved engine never treats an image without usage as free',()=>{
  const imgRate={...rate,model:'gpt-image-2',pricing_kind:'image',image_input_usd_per_m:4,cached_image_input_usd_per_m:1};
  const result=calculateApprovedImageCost({model:'gpt-image-2',usage:null,rate:imgRate,operation:'images.generate',at:now});
  assert.equal(result.amount,null);
  assert.equal(result.exact,false);
});
test('overlapping approved records rejected',async()=>{
  const mock={from:()=>({select(){return this},eq(){return this},lte(){return this},order(){return this},limit(){return Promise.resolve({data:[rate,rate],error:null})}})};
  await assert.rejects(findApprovedOpenAIPrice(mock,'gpt-5.5','2025-06-03T00:00:00Z'),/Overlapping/);
});

test('approved image tariff handles separately metered text and image tokens',()=>{
 const imgRate={...rate,model:'gpt-image-2',pricing_kind:'image',input_usd_per_m:2.5,cached_input_usd_per_m:.625,
   image_input_usd_per_m:4,cached_image_input_usd_per_m:1,output_usd_per_m:15};
 const usage={input_tokens:300,output_tokens:1000,input_tokens_details:{text_tokens:100,image_tokens:200}};
 const cost=calculateApprovedImageCost({model:'gpt-image-2',usage,rate:imgRate,operation:'images.edit',at:now});
 assert.equal(cost.amount,0.01605);assert.equal(cost.exact,false);
});
test('image tariff rejects unallocated cached input',()=>{
 const imgRate={...rate,model:'gpt-image-2',pricing_kind:'image',image_input_usd_per_m:4,cached_image_input_usd_per_m:1};
 const cost=calculateApprovedImageCost({model:'gpt-image-2',usage:{input_tokens:300,output_tokens:1000,input_tokens_details:{text_tokens:100,image_tokens:200,cached_tokens:60}},rate:imgRate,at:now});
 assert.equal(cost.amount,null);
});

test('release default/off path preserves existing cost tracking without querying new tables',async()=>{
  process.env.SPREELO_OPENAI_PRICING_ENABLED = 'false';
  try {
    const writes=[];
    const legacyStorage={from(table){
      assert.equal(table,'post_generation_cost_events','OFF mode must never query price registry');
      return {upsert(payload){writes.push(payload);return Promise.resolve({error:null})}};
    }};
    const tracker=createGenerationCostTracker({supabase:legacyStorage});
    const cost=await tracker.recordOpenAI('responses.create',{model:'gpt-5.5'},response);
    assert.equal(cost.exact,true);
    assert.equal(cost.amount,0.0071);
    assert.equal(writes.length,1);
    assert.equal(writes[0].pricing_version,'2026-10-02');
  } finally {process.env.SPREELO_OPENAI_PRICING_ENABLED='true'}
});
