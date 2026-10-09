import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=path.resolve(import.meta.dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function evaluate(f,imports={},extras={}){
 const code=ts.transpileModule(read(f),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:k=>{
  if(k in imports)return imports[k];throw Error('Unexpected import '+k+' in '+f);
 },console,Response,Date,process,Number,Math,Map,Array,Object,String,JSON,Promise,Error,Set,URL,AbortSignal,Buffer,...extras},{filename:f});
 return module.exports;
}
const watch=evaluate('lib/aiMarketWatch.js',{'node:crypto':{createHash}});
assert.equal(watch.WATCH_SOURCES.length,1);
assert.equal(watch.WATCH_SOURCES[0].provider,'OpenAI');
assert.equal(watch.classifyNews('OpenAI SDK v7.30.0 feature release'),null);
assert.equal(watch.classifyNews('Introducing new ChatGPT tasks'),null);
assert.equal(watch.classifyNews('A partnership to bring AI to the workplace'),null);
assert.equal(watch.classifyNews('Introducing GPT-6 Sol and Luna')?.category,'model_release');
assert.equal(watch.classifyNews('GPT-image-2 is deprecated in the API')?.category,'deprecation');
assert.equal(watch.classifyNews('GPT Image 2 pricing updated')?.category,'pricing');
const fixture=`<rss><channel><item><title>OpenAI SDK v7.30.0</title><link>https://openai.com/a</link><description>GPT Image release</description></item><item><title>Introducing GPT Image 3</title><link>https://openai.com/news/new-gpt-image</link><description>&lt;h2&gt;&lt;a href=&quot;https://github.com/x&quot;&gt;SDK update&lt;/a&gt;&lt;/h2&gt;</description><pubDate>Thu, 08 Oct 2026 10:00:00 GMT</pubDate></item><item><title>Introducing GPT-6 Sol</title><link>https://evil.example/impersonation</link><description>Fake</description></item></channel></rss>`;
const items=watch.parseFeed(fixture,watch.WATCH_SOURCES[0]);
assert.equal(items.length,1);assert.equal(items[0].category,'model_release');
assert(items[0].title.startsWith('Modellnyhet från OpenAI'));
assert(!JSON.stringify(items[0]).includes('<h2>'));
assert.equal(items[0].url,'https://openai.com/news/new-gpt-image');
console.log('PASS: official provider feed, strict relevance, Swedish actionable descriptions, no HTML leakage');

let range=null,filters=[],newsReads=0;
const fakeDb={from(table){
 if(table==='ai_market_news'){
  const query={select(_fields,opts){assert.equal(opts.count,'exact');return query},
  in(field,values){filters.push([field,values]);return query},
  order(){return query},range(from,to){range=[from,to];newsReads++;return Promise.resolve({data:[{id:'sample',provider:'OpenAI',title:'Ny AI-modell',summary:'Påverkan'}],count:21,error:null})}};
  return query;
 }
 assert.equal(table,'ai_market_watch_runs');return {select(){return this},order(){return this},limit:async()=>({data:[]})};
}};
const api=evaluate('app/api/admin/ai-market-news/route.js',{
 '../../../../lib/adminAuth':{getAdminContext:async()=>({admin:fakeDb}),adminContextError:()=>Response.json({ok:false},{status:401})},
});
const result=await api.GET({url:'https://spreelo.example/api/admin/ai-market-news?page=2'});
assert.equal(result.status,200);
const payload=await result.json();
assert.equal(payload.page,2);assert.equal(payload.pageSize,10);assert.equal(payload.totalPages,3);
assert.equal(payload.total,21);assert.equal(newsReads,1);assert.deepEqual(range,[10,19]);
assert(filters.some(([field,values])=>field==='provider'&&values.includes('OpenAI')&&!values.includes('OpenAI SDK')));
assert(filters.some(([field,values])=>field==='category'&&!values.includes('model_or_release')));
console.log('PASS: admin news API keeps old SDK items out and pages ten at a time');

for(const file of ['app/admin/ai-control/page.jsx','lib/aiMarketWatch.js','app/api/admin/ai-market-news/route.js','app/api/admin/ai-control/route.js']){
 const ast=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,file.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);
 assert.equal(ast.parseDiagnostics.length,0,file+': '+ast.parseDiagnostics.map(x=>x.messageText).join(','));
}
const ui=read('app/admin/ai-control/page.jsx');
assert(ui.includes('loadNews(newsPage-1)')&&ui.includes('loadNews(newsPage+1)'));
assert(ui.includes('Prisjämförelser visas efter en lyckad daglig kontroll'));
assert(ui.includes('Tekniskt godkänd')&&ui.includes('Test krävs'));
const modelRoute=read('app/api/admin/ai-control/route.js');
assert(modelRoute.includes("m!=='kling-v3'"));
assert(modelRoute.includes("purpose.key==='kling_video' && model==='kling-v3'"));
assert.equal(read('supabase/v144_332_INSTALL_AI_CONTROL_ALL.sql'),read('supabase/v144_331_INSTALL_AI_CONTROL_ALL.sql'));
assert(!/update\s+public\.ai_model_settings\s+set/i.test(read('supabase/v144_332_INSTALL_AI_CONTROL_ALL.sql')));
console.log('PASS: JSX and API parse, Kling alias not offered as a new switch, price/mode clarity, SQL unchanged');
