import assert from 'node:assert/strict';
const response = (data) => ({ok:true,json:async()=>data});
const now = new Date();
const day = new Date(Date.now()-2*86400_000).toISOString().slice(0,10);
const seen=[];
globalThis.fetch=async (input,options={})=>{
 const url=String(input); seen.push(url);
 if(url.includes('organization/costs')){
   const parsed=new URL(url);
   assert.equal(parsed.searchParams.get('project_ids[]'),'proj_spreelo_testing');
   assert.equal(parsed.searchParams.get('start_time'), String(Date.parse(day+'T00:00:00Z')/1000));
   return response({data:[{start_time:Date.parse(day+'T00:00:00Z')/1000,results:[{amount:{value:.12,currency:'usd'}}]}],has_more:false,next_page:null});
 }
 if(url.includes('post_generation_cost_events')){
   return response([{amount:.10,currency:'USD'},{amount:.02,currency:'USD'}]);
 }
 if(url.includes('openai_billing_reconciliations')){
   assert.equal(options.method,'POST');
   const row=JSON.parse(options.body);
   assert.equal(row.actual_usd,.12);
   assert.equal(row.status,'comparable');
   assert.equal(row.unpriced_events,0);
   return response([row]);
 }
 throw new Error('unexpected request: '+url);
};
