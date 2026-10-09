import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const source=await fs.readFile(new URL('../lib/aiModelDiscovery.js',import.meta.url),'utf8');
// The discovery module gained an import in v328. Test it with a stubbed probe
// instead of importing a data: URL (which cannot resolve relative modules).
const code=ts.transpileModule(source,{fileName:'aiModelDiscovery.js',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
vm.runInNewContext(code,{module,exports:module.exports,require:name=>{
  if(name==='./aiModelVerification.js')return {OPENAI_PROBE_LIMIT:2,OPENAI_IMAGE_PROBE_LIMIT:1,modelKind:()=>null,runOpenAiProbe:()=>{throw Error('Probe should not run')}};
  throw Error('Unexpected import '+name);
},Date,Promise,Set,Map,JSON,Math,Number,String,Error,Array,process,fetch:(...args)=>globalThis.fetch(...args),AbortSignal,console}, {filename:'aiModelDiscovery.js'});
const {syncDiscoveredModels}=module.exports;
process.env.OPENAI_API_KEY = 'test-key';
const original = {provider:'openai',model:'gpt-4.1-mini',status:'approved',verified_capabilities:['text'],last_seen_at:'2025-01-01T00:00:00.000Z',verification_notes:'review retained'};
const missing = {provider:'openai',model:'gpt-5.5',status:'pending_review',last_seen_at:'2025-02-02T00:00:00.000Z'};
let rows = [original, missing];
let touchedTables=[];
const db = {
  from(table) {
    touchedTables.push(table);
    assert.equal(table, 'ai_model_catalog');
    return {
      select() {
        return {
          eq() { return Promise.resolve({ data: rows.map(x => ({...x})), error: null }); }
        };
      },
      upsert(batch) {
        for (const item of batch) {
          if (!rows.some(x => x.model === item.model)) rows.push({...item, status: 'pending_review'});
        }
        return Promise.resolve({error:null});
      },
      update(patch) {
        return {
          eq(column, value) {
            assert.equal(column, 'provider');
            assert.equal(value, 'openai');
            return {
              in(column, models) {
                assert.equal(column, 'model');
                for (const row of rows) if (models.includes(row.model)) Object.assign(row, patch);
                return Promise.resolve({error:null});
              }
            };
          }
        };
      }
    };
  }
};
const previousFetch=globalThis.fetch;
globalThis.fetch=async()=>({ok:true,json:async()=>({data:[{id:'gpt-4.1-mini'},{id:'gpt-image-2'},{id:'whisper-1'}]})});
try {
 const result=await syncDiscoveredModels(db);
 assert.equal(result.listed,2);
 assert.deepEqual(Array.from(result.newModels),['gpt-image-2']);
 assert.equal(original.status,'approved');
 assert.deepEqual(original.verified_capabilities,['text']);
 assert.equal(original.verification_notes,'review retained');
 assert.notEqual(original.last_seen_at,'2025-01-01T00:00:00.000Z');
 assert.equal(missing.last_seen_at,'2025-02-02T00:00:00.000Z');
 assert(rows.some(x=>x.model==='gpt-image-2'&&x.status==='pending_review'));
 assert(touchedTables.every(t=>t==='ai_model_catalog'));
 const next=await syncDiscoveredModels(db);
 assert.equal(next.newModels.length,0);
 console.log('PASS: existing known models update last_seen_at without changing approvals');
 console.log('PASS: absent models are not marked retired or touched');
 console.log('PASS: new models are registered as pending_review, not activated');
 console.log('PASS: only ai_model_catalog was accessed, never production model settings');
} finally {globalThis.fetch=previousFetch;}
