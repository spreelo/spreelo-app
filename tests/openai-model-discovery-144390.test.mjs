import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenAIPublishedPrices, samePrices, validOpenAIModelId } from '../lib/openaiPricingDiscovery.js';
import { syncOpenAIModelCatalog } from '../lib/openaiCatalogSync.js';

const docs = `# Pricing\nStandard\nPrices per 1M tokens.\nModel | Input | Output | Cached input\n--- | --- | --- | ---\ngpt-new-a | $2.00 | $10.00 | $0.20\ngpt-dual | $3.00 | $12.00 | $0.30\n\nFast\nModel | Input | Output | Cached input\n--- | --- | --- | ---\ngpt-dual | $6.00 | $24.00 | $0.60\n`;
const html = '<html><body><h1>Pricing</h1><table><tr><th>Model</th><th>Input</th><th>Output</th><th>Cached input</th></tr><tr><td>gpt-unique</td><td>$1.50</td><td>$8.00</td><td>$0.15</td></tr></table></body></html>';

test('Markdown extracts unambiguous and flags tiers', () => {
 const p=parseOpenAIPublishedPrices(docs);
 assert.equal(p.status,'parsed');assert.equal(p.candidates.length,1);
 assert.equal(p.candidates[0].model,'gpt-new-a');
 assert.deepEqual(p.ambiguousModels,['gpt-dual']);
});
test('HTML table extracts same price tuple',()=>{
 const p=parseOpenAIPublishedPrices(html);
 assert.equal(p.candidates[0].model,'gpt-unique');
 assert.equal(p.candidates[0].cached_input_usd_per_m,.15);
});
test('image needs full text and image breakup',()=>{
 const s='Model | Modality | Input | Output | Cached input\n--- | --- | --- | --- | ---\ngpt-image-5 | Image | $4.00 | $15.00 | $1.00\n | Text | $2.50 | - | $0.625\n';
 const p=parseOpenAIPublishedPrices(s);assert.equal(p.candidates.length,1);
 assert.equal(p.candidates[0].pricing_kind,'image');assert.equal(p.candidates[0].image_input_usd_per_m,4);
 assert.equal(p.candidates[0].input_usd_per_m,2.5);
});
test('blank/invalid document does not invent prices',()=>{
 assert.equal(parseOpenAIPublishedPrices('<div>unknown</div>').candidates.length,0);
 assert.equal(parseOpenAIPublishedPrices('Model | Input | Output | Cached input\n---|---|---|---\ngpt-new|not-a-price|$1|$2').candidates.length,0);
 assert.equal(validOpenAIModelId('ft:organization:secrets'),false);
});
test('samePrices compares values but rejects changed rates',()=>{
 const p={model:'gpt-a',input_usd_per_m:1,cached_input_usd_per_m:.1,output_usd_per_m:5};
 assert.equal(samePrices(p,{...p,input_usd_per_m:'1.000'}),true);
 assert.equal(samePrices(p,{...p,output_usd_per_m:10}),false);
});

function makeDb() {
 const data={openai_pricing_audit:[],openai_model_catalog:[],openai_price_versions:[],openai_model_discovery_runs:[]};
 let serial=1;
 function builder(table) {
  const q={table,op:'select',rows:null,orderKey:null,desc:false,limitCount:null,filters:[]};
  const chain={
   select(){q.op='select';return chain;}, insert(rows){q.op='insert';q.rows=Array.isArray(rows)?rows:[rows];return chain;},
   upsert(rows){q.op='upsert';q.rows=Array.isArray(rows)?rows:[rows];return chain;},
   update(rows){q.op='update';q.rows=[rows];return chain;},
   eq(k,v){q.filters.push(row=>row[k]===v);return chain;},
   not(k,op,v){if(op==='is'&&v===null)q.filters.push(row=>row[k]!=null);return chain;},
   order(k,{ascending=true}={}){q.orderKey=k;q.desc=!ascending;return chain;},
   limit(n){q.limitCount=n;return chain;},
   then(resolve,reject){
    try{
     if(q.op==='select'){
      let rows=data[table].filter(row=>q.filters.every(fn=>fn(row)));
      if(q.orderKey)rows=rows.sort((a,b)=>q.desc ? String(b[q.orderKey]).localeCompare(String(a[q.orderKey])):String(a[q.orderKey]).localeCompare(String(b[q.orderKey])));
      if(q.limitCount)rows=rows.slice(0,q.limitCount);
      return Promise.resolve({data:structuredClone(rows),error:null}).then(resolve,reject);
     }
     if(q.op==='update'){for(const row of data[table].filter(v=>q.filters.every(fn=>fn(v)))) Object.assign(row,q.rows[0]);return Promise.resolve({data:null,error:null}).then(resolve,reject);}
     for(const row of q.rows){
      const r=structuredClone(row);
      if(table==='openai_model_discovery_runs') r.checked_at=new Date().toISOString();
      if(table==='openai_pricing_audit')r.checked_at=new Date().toISOString();
      if(table==='openai_price_versions')r.created_at=new Date().toISOString();
      if(table==='openai_model_catalog'){const i=data[table].findIndex(x=>x.model===r.model);if(i!==-1){data[table][i]=r;continue;}}
      if(table==='openai_price_versions'&&data[table].some(x=>x.model===r.model&&x.version===r.version))continue;
      data[table].push(r);
     }
     return Promise.resolve({data:null,error:null}).then(resolve,reject);
    }catch(e){return Promise.reject(e).then(resolve,reject)}
   }
  };
  return chain;
 }
 return {from:builder,data};
}
const fakePage='<!doctype html><html><body><h1>Pricing</h1>'+html.padEnd(1200,' ')+'</body></html>';
function fakeFetch(url) {
 if(url.includes('/v1/models'))return Promise.resolve({ok:true,json:async()=>({data:[
  {id:'gpt-unique',created:1760000000,owned_by:'openai'},
  {id:'gpt-unpriced',created:1760000001,owned_by:'openai'}]})});
 if(url.endsWith('.md'))return Promise.resolve({ok:false});
 return Promise.resolve({ok:true,status:200,text:async()=>fakePage});
}
test('sync discovers new models, proposes only unambiguous tariffs, does not approve',async()=>{
 const db=makeDb();
 const run=await syncOpenAIModelCatalog({db,apiKey:'mock-key',fetcher:fakeFetch,now:new Date('2026-10-22T10:00:00Z'),force:true});
 assert.equal(run.status,'success');assert.equal(run.newModels,2);assert.equal(run.proposedPrices,1);
 assert.equal(db.data.openai_price_versions[0].approved,false);
 assert.equal(db.data.openai_model_catalog.find(x=>x.model==='gpt-unpriced').pricing_status,'missing');
});
test('repeat sync is idempotent for published price and preserves first_seen',async()=>{
 const db=makeDb();const now=new Date('2026-10-22T10:00:00Z');
 await syncOpenAIModelCatalog({db,apiKey:'mock-key',fetcher:fakeFetch,now,force:true});
 const again=await syncOpenAIModelCatalog({db,apiKey:'mock-key',fetcher:fakeFetch,now:new Date(now.getTime()+3600_000),force:true});
 assert.equal(again.newModels,0);assert.equal(again.proposedPrices,0);
 assert.equal(db.data.openai_price_versions.length,1);
 assert.equal(db.data.openai_model_catalog.find(x=>x.model==='gpt-unique').first_seen_at,now.toISOString());
});
test('when /v1/models fails, published models remain non-approved, result partial',async()=>{
 const db=makeDb();const fetcher=url=>url.includes('/v1/models')?Promise.resolve({ok:false,status:401}):fakeFetch(url);
 const run=await syncOpenAIModelCatalog({db,apiKey:'bad',fetcher,now:new Date('2026-10-22T10:00:00Z'),force:true});
 assert.equal(run.status,'partial');assert.equal(db.data.openai_price_versions[0].approved,false);
});

test('unchanged pending price receives refreshed page proof without duplicate',async()=>{
 const db=makeDb(); const first=new Date('2026-10-22T10:00:00Z');
 await syncOpenAIModelCatalog({db,apiKey:'mock',fetcher:fakeFetch,now:first,force:true});
 const oldId=db.data.openai_price_versions[0].version;
 const newFetcher=url=> url.includes('/v1/models')?fakeFetch(url):Promise.resolve({ok:true,status:200,text:async()=>fakePage+'<!-- changed public footer -->'});
 await syncOpenAIModelCatalog({db,apiKey:'mock',fetcher:newFetcher,now:new Date(first.getTime()+3600000),force:true});
 assert.equal(db.data.openai_price_versions.length,1);
 assert.equal(db.data.openai_price_versions[0].version,oldId);
 assert.equal(db.data.openai_price_versions[0].source_fingerprint,db.data.openai_pricing_audit.at(-1).source_fingerprint);
});
test('actual published price change creates a second unapproved proposal',async()=>{
 const db=makeDb();const t=new Date('2026-10-22T10:00:00Z');
 await syncOpenAIModelCatalog({db,apiKey:'mock',fetcher:fakeFetch,now:t,force:true});
 const modifiedPage=fakePage.replace('$1.50','$2.50');
 const fetcher=url=>url.includes('/v1/models')?fakeFetch(url):Promise.resolve({ok:true,status:200,text:async()=>modifiedPage});
 const run=await syncOpenAIModelCatalog({db,apiKey:'mock',fetcher,now:new Date(t.getTime()+3600000),force:true});
 assert.equal(run.proposedPrices,1);
 assert.equal(db.data.openai_price_versions.length,2);
 assert.ok(db.data.openai_price_versions.every(x=>x.approved===false));
});
