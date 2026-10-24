import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { supportedReasoningEfforts, initialReasoningEffort, normalizeReasoningEffort } from '../lib/aiModelReasoning.js';
import { calculateOpenAICost } from '../lib/generationCostTracking.js';

test('GPT-6.1 Sol supports reasoning levels but never none',()=>{
 assert.deepEqual(supportedReasoningEfforts('gpt-6.1-sol'),['low','medium','high','xhigh','max']);
 assert.throws(()=>normalizeReasoningEffort('gpt-6.1-sol','none'),/not supported/);
 assert.equal(initialReasoningEffort('editorial_headline','gpt-6.1-sol'),'low');
 assert.equal(normalizeReasoningEffort('gpt-6.1-sol','medium'),'medium');
});
test('existing GPT-5.6 Sol headline none remains available and product research low unchanged',()=>{
 assert.equal(initialReasoningEffort('editorial_headline','gpt-5.6-sol'),'none');
 assert.equal(initialReasoningEffort('product_research','gpt-5.5'),'low');
 assert.equal(normalizeReasoningEffort('gpt-5.6-sol','none'),'none');
});
test('GPT-6.1 Sol Standard estimate uses returned model and cached input rate',()=>{
 const cost=calculateOpenAICost({operation:'responses.create',request:{model:'gpt-5.5'},response:{id:'resp1',model:'gpt-6.1-sol',usage:{input_tokens:1000,output_tokens:300,input_tokens_details:{cached_tokens:200}}}});
 assert.equal(cost.model,'gpt-6.1-sol');
 assert.equal(cost.amount,0.00462);
 assert.match(cost.pricingVersion,/gpt-6.1-sol/);
});
test('nonstandard GPT-6.1 processing cannot be mispriced as Standard',()=>{
 const response={model:'gpt-6.1-sol',usage:{input_tokens:500,output_tokens:200}};
 assert.equal(calculateOpenAICost({operation:'responses.create',request:{model:'gpt-6.1-sol',service_tier:'fast'},response}).amount,null);
 assert.equal(calculateOpenAICost({operation:'responses.create',request:{model:'gpt-6.1-sol'},response:{...response,service_tier:'ultrafast'}}).amount,null);
 assert.equal(calculateOpenAICost({operation:'responses.create',request:{model:'gpt-6.1-sol'},response:{...response,usage:{...response.usage,input_tokens_details:{cache_write_tokens:120}}}}).amount,null);
});
test('new and unknown models never silently become free',()=>{
 assert.equal(calculateOpenAICost({operation:'responses.create',request:{model:'gpt-7-unknown'},response:{usage:{input_tokens:100,output_tokens:20}}}).amount,null);
});
test('AI Control Center includes model and reasoning selection with explicit opt-in',()=>{
 const ui=readFileSync(new URL('../app/admin/ai-control/page.jsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../app/api/admin/ai-control/route.js',import.meta.url),'utf8');
 assert.match(ui,/Reasoning level for/);assert.match(ui,/reasoning_effort/);
 assert.match(api,/normalizeReasoningEffort/);assert.match(api,/reasoning_effort/);
 assert.match(ui,/Save \/ switch|Spara \/ byt/);
});
