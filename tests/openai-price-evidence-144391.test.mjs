import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenAIPublishedPrices } from '../lib/openaiPricingDiscovery.js';
import { parseOfficialModelDetail, fetchSpreeloModelPriceEvidence } from '../lib/openaiModelPriceEvidence.js';

function textPage(model,input,cache,output) { return `# ${model}\n# Pricing\nPricing is based on the number of tokens used, or other metrics based on the model type. For tool-specific models there may be a fee per call.\n## Text tokens\nPer 1M tokens\nBatch API price\nInput\n$${input}\nCached input\n$${cache}\nOutput\n$${output}\nQuick comparison\nInput GPT-5.5 $100\nModalities\nText Input and output`; }
function imagePage(model) {return `# ${model}\n# Pricing\nPricing is based on the number of tokens used, or other metrics based on the model type.\n## Text tokens\nPer 1M tokens\nBatch API price\nInput $5.00\nCached input $1.25\n## Image tokens\nPer 1M tokens\nBatch API price\nInput $8.00\nCached input $2.00\nOutput $30.00\nModalities\nText Input only`; }

test('model pages yield published standard rates for all three Spreelo text models',()=>{
  for(const [model,input,cache,output] of [['gpt-4.1-mini',.4,.1,1.6],['gpt-5.5',5,.5,30],['gpt-5.6-sol',4,.4,20]]){
    assert.deepEqual(parseOfficialModelDetail(model,textPage(model,input,cache,output)),{model,pricing_kind:'text',input_usd_per_m:input,cached_input_usd_per_m:cache,output_usd_per_m:output});
  }
});
test('separates image/text modalities from image model detail and avoids invented text output',()=>{
  assert.deepEqual(parseOfficialModelDetail('gpt-image-2.5-flare',imagePage('gpt-image-2.5-flare')),
    {model:'gpt-image-2.5-flare',pricing_kind:'image',input_usd_per_m:5,cached_input_usd_per_m:1.25,output_usd_per_m:30,image_input_usd_per_m:8,cached_image_input_usd_per_m:2});
});
test('refuses marketing summary, duplicate conflicting prices and unrelated model pages',()=>{
  assert.equal(parseOfficialModelDetail('gpt-5.5','GPT-5.5 Price $5 and $30, no token rates'.repeat(10)),null);
  assert.equal(parseOfficialModelDetail('gpt-5.5',textPage('gpt-5.5',5,.5,30).replace('Quick comparison','Input $6 Cached input $0.6 Output $36 Quick comparison')),null);
  assert.equal(parseOfficialModelDetail('gpt-5.4',textPage('gpt-5.4',3,.3,16)),null);
  assert.equal(parseOfficialModelDetail('gpt-image-2.5-flare',imagePage('gpt-image-2.5-flare').replace('Output $30.00','')),null);
});
test('image table carries omitted row-span model and combines text/image rates (Markdown)',()=>{
 const md=`## Image generation models\nStandard\nPrices per 1M tokens.\nModel | Modality | Input | Output | Cached input\n--- | --- | --- | --- | ---\ngpt-image-2 | Image | $4.00 | $15.00 | $1.00\nText | $2.50 | - | $0.625\n`;
 const result=parseOpenAIPublishedPrices(md);
 assert.equal(result.candidates.length,1);
 assert.deepEqual(result.candidates[0],{model:'gpt-image-2',pricing_kind:'image',input_usd_per_m:2.5,cached_input_usd_per_m:.625,output_usd_per_m:15,image_input_usd_per_m:4,cached_image_input_usd_per_m:1});
});
test('image table carries rowspan model and combines text/image rates (HTML)',()=>{
 const html=`<table><tr><th>Model</th><th>Modality</th><th>Input</th><th>Output</th><th>Cached input</th></tr><tr><td rowspan="2">gpt-image-2</td><td>Image</td><td>$4.00</td><td>$15.00</td><td>$1.00</td></tr><tr><td>Text</td><td>$2.50</td><td>-</td><td>$0.625</td></tr></table>`;
 const result=parseOpenAIPublishedPrices(html.padEnd(300));
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].model,'gpt-image-2');
});
test('conflicting image processing tiers are ambiguous, no guessed standard candidate',()=>{
 const md=`Model | Modality | Input | Output | Cached input\n--- | --- | --- | --- | ---\ngpt-image-2.5-flare | Image | $8.00 | $30.00 | $2.00\nText | $5.00 | - | $1.25\n\nModel | Modality | Input | Output | Cached input\n--- | --- | --- | --- | ---\ngpt-image-2.5-flare | Image | $4.00 | $15.00 | $1.00\nText | $2.50 | - | $0.625\n`;
 const result=parseOpenAIPublishedPrices(md);
 assert.deepEqual(result.ambiguousModels,['gpt-image-2.5-flare']);
 assert.equal(result.candidates.length,0);
});
test('fetches markdown model detail, falls back to canonical HTML without ever synthesizing a price',async()=>{
 const calls=[];
 const fetcher=async url=>{calls.push(url);if(url.includes('gpt-5.5.md'))return {ok:true,text:async()=>textPage('gpt-5.5',5,.5,30)};
   if(url.includes('gpt-5.6-sol')&&!url.endsWith('.md'))return {ok:true,text:async()=>`<html><h1>gpt-5.6-sol</h1><h2>Pricing</h2><p>Pricing is based on the number of tokens used.</p><h3>Text tokens</h3><p>Per 1M tokens</p><p>Input $4 Cached input $0.4 Output $20</p><h3>Modalities</h3></html>`};
   return {ok:false,status:404};};
 const found=await fetchSpreeloModelPriceEvidence({fetcher});
 assert.deepEqual(found.map(x=>x.model).sort(),['gpt-5.5','gpt-5.6-sol']);
 assert.ok(found.every(x=>x.source_url.startsWith('https://developers.openai.com/api/docs/models/')));
 assert.ok(calls.some(url=>url.endsWith('gpt-5.6-sol.md')));
});
