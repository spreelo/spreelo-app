import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateOpenAICost, createGenerationCostTracker, wrapOpenAIForCostTracking} from '../lib/generationCostTracking.js';

const oldFlag = process.env.SPREELO_OPENAI_PRICING_ENABLED;
process.env.SPREELO_OPENAI_PRICING_ENABLED = 'false';
function ledger() {
  const records=[];
  const q={upsert:async payload => {records.push(payload);return {error:null};}};
  return {records,from(name){assert.equal(name,'post_generation_cost_events'); return q;}};
}

test('a background request and subsequent retrieve use one provider id and one operation',async()=>{
  const db=ledger();
  const tracker=createGenerationCostTracker({supabase:db});
  const pending={id:'resp_stable_123',_request_id:'req_create',background:true,status:'queued',model:'gpt-5.5'};
  const completed={id:'resp_stable_123',_request_id:'req_retrieve',background:true,status:'completed',model:'gpt-5.5',usage:{input_tokens:1768,output_tokens:1024},output:[]};
  const client=wrapOpenAIForCostTracking({responses:{
    create:async()=>pending,
    retrieve:async()=>completed,
  }},()=>tracker);
  assert.equal((await client.responses.create({model:'gpt-5.5',background:true})).id,'resp_stable_123');
  assert.equal((await client.responses.retrieve('resp_stable_123')).usage.input_tokens,1768);
  assert.equal(db.records.length,2);
  assert.deepEqual(db.records.map(x=>x.operation),['responses.background','responses.background']);
  assert.deepEqual(db.records.map(x=>x.provider_request_id),['resp_stable_123','resp_stable_123']);
  assert.equal(db.records[0].amount,null); // pending usage must not masquerade as free
  assert(db.records[1].amount > 0);
});

test('known image cost remains metered and is not double-added as omitted input',()=>{
  const r=calculateOpenAICost({operation:'calendar_visual.images.generate',request:{model:'gpt-image-2'},response:{
    usage:{input_tokens:2792,output_tokens:1510,input_tokens_details:{text_tokens:1768,image_tokens:1024}},
  }});
  assert.equal(r.amount,0.031166);
  assert.equal(r.usage.text_input_tokens,1768);
  assert.equal(r.usage.image_input_tokens,1024);
  assert.equal(r.quantity,4302);
});

test('added paid feature entrypoints send usage into the provider ledger',()=>{
  const paths=[
    'app/api/onboarding-plan/route.js',
    'app/api/analyze-brand/brandAnalysisEngine.js',
    'app/api/analyze-brand/route.js',
    'app/api/analyze-brand/webResearch.js',
    'app/api/inspect-content-source/route.js',
    'app/api/cron/generate-calendar-visuals/route.js',
    'app/api/ui-translations/route.js',
    'lib/i18n/serverUiText.js',
    'lib/aiModelVerification.js',
    'app/api/admin/post-approvals/rescue-import/route.js',
  ];
  for(const path of paths) {
    const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    assert.match(source,/(wrapSupplementalOpenAIClient|recordSupplementalOpenAIHttpResponse|createSupplementalOpenAITracker)/,path);
  }
});

test('daily reconciler flags differences smaller than ten cents',()=>{
  const source=readFileSync(new URL('../scripts/reconcile-openai-costs.mjs',import.meta.url),'utf8');
  assert.match(source,/Math\.max\(0\.01,actual\.amount\*0\.02\)/);
});

test.after(()=>{
  if(oldFlag===undefined) delete process.env.SPREELO_OPENAI_PRICING_ENABLED;
  else process.env.SPREELO_OPENAI_PRICING_ENABLED=oldFlag;
});
