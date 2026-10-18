import {createUiTranslationCache} from '../lib/i18n/uiTranslationCache.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {ALL_UI_NAMESPACES,getDefaultLabelsForNamespaces} from '../lib/i18n/defaultLabels.js';
import {BROWSER_CACHE_MAX_CHARS,BROWSER_CACHE_MAX_ENTRIES,BROWSER_CACHE_MAX_ENTRY_CHARS,isRebuildableBrowserCache,pruneBrowserCaches,prepareBrowserStorage,writeBrowserCache,createPersistentAuthStorage} from '../lib/browserStorage.js';
const require=createRequire(import.meta.url),{parse}=require('next/dist/compiled/babel/parser');
class QuotaStorage {
 constructor(limit=1024*1024){this.limit=limit;this.items=new Map();}
 get length(){return this.items.size;}
 key(i){return [...this.items.keys()][i]??null;}
 getItem(k){return this.items.get(k)??null;}
 removeItem(k){this.items.delete(k);}
 setItem(k,v){v=String(v);const total=[...this.items].filter(([key])=>key!==k).reduce((n,[key,value])=>n+key.length+value.length,0)+k.length+v.length;if(total>this.limit)throw new DOMException('Fixture storage full','QuotaExceededError');this.items.set(k,v);}
}
let checks=0;async function check(label,fn){await fn();checks++;console.log('PASS:',label);}
await check('full legacy cache is recovered before authentication without losing state',()=>{
 const s=new QuotaStorage();const saved={'sb-project-auth-token':'old-auth','sb-project-auth-token-code-verifier':'pkce','spreelo_app_language':'sv','spreelo_current_brand_id_user':'brand','spreelo_calendar_campaign_handoff':'unsaved-handoff','unrelated':'foreign-data','spreelo_creator_welcome_hidden_v310_user':'true','spreelo_last_login_email':'fixture@example.test'};
 for(const [k,v] of Object.entries(saved))s.setItem(k,v);
 const key='spreelo_ui_labels_v29_sv',used=[...s.items].reduce((n,[k,v])=>n+k.length+v.length,0);s.setItem(key,'x'.repeat(s.limit-used-key.length));
 assert.throws(()=>s.setItem('probe','1'),{name:'QuotaExceededError'});assert.equal(prepareBrowserStorage(s),true);
 for(const [k,v] of Object.entries(saved))assert.equal(s.getItem(k),v,k);assert.equal(s.getItem(key),null);assert.equal(s.getItem('spreelo_storage_capacity_probe_v344'),null);
});
await check('multiple versions/locales/plans are bounded by entry count and total size',()=>{
 const s=new QuotaStorage(2*1024*1024);for(let i=0;i<100;i++)assert.equal(writeBrowserCache(s,`spreelo_plan_recommendation_v296_brand_goal_${i}`,'x'.repeat(16000)),true);
 const entries=[...s.items].filter(([k])=>isRebuildableBrowserCache(k));assert(entries.length<=BROWSER_CACHE_MAX_ENTRIES);assert(entries.reduce((n,[k,v])=>n+k.length+v.length,0)<=BROWSER_CACHE_MAX_CHARS);
 const key='spreelo_ui_labels_v30_sv';assert.equal(writeBrowserCache(s,key,'x'.repeat(BROWSER_CACHE_MAX_ENTRY_CHARS+1)),false);assert.equal(s.getItem(key),null);
});
await check('cache writes preserve headroom for new sign-in and token refresh',()=>{
 const s=new QuotaStorage(256*1024);s.setItem('customer-draft','d'.repeat(100000));
 for(let i=0;i<12;i++)writeBrowserCache(s,`spreelo_ui_labels_v${i}_sv`,'x'.repeat(60000));
 const auth=createPersistentAuthStorage(()=>s);auth.setItem('sb-project-auth-token','s'.repeat(40000));assert.equal(s.getItem('sb-project-auth-token').length,40000);assert.equal(s.getItem('customer-draft').length,100000);
});
await check('auth write recovers quota introduced after initialization',()=>{
 const s=new QuotaStorage();prepareBrowserStorage(s);const auth=createPersistentAuthStorage(()=>s);auth.setItem('sb-project-auth-token','old-token');
 const key='spreelo_plan_recommendation_v296_legacy';const used=[...s.items].reduce((n,[k,v])=>n+k.length+v.length,0);s.setItem(key,'x'.repeat(s.limit-used-key.length));auth.setItem('sb-project-auth-token','new-token'.repeat(200));assert.equal(auth.getItem('sb-project-auth-token'),'new-token'.repeat(200));assert.equal(s.getItem(key),null);
});
await check('unknown data is never evicted and failed persistent writes never become memory success',()=>{
 const s=new QuotaStorage();s.setItem('foreign-data','x'.repeat(s.limit-'foreign-data'.length));
 const auth=createPersistentAuthStorage(()=>s);assert.throws(()=>auth.setItem('sb-project-auth-token','token'),{name:'QuotaExceededError'});assert.equal(s.getItem('sb-project-auth-token'),null);assert(s.getItem('foreign-data'));
 assert.throws(()=>prepareBrowserStorage(s),{name:'QuotaExceededError'});assert.equal(writeBrowserCache(s,'spreelo_ui_labels_v30_sv','{}'),false);
});
await check('blocked storage stays an error; logout removes only the requested auth key',()=>{
 const blocked={getItem(){throw new DOMException('Fixture blocked','SecurityError');},setItem(){throw new DOMException('Fixture blocked','SecurityError');}};const auth=createPersistentAuthStorage(()=>blocked);
 assert.throws(()=>auth.getItem('key'),{name:'SecurityError'});assert.throws(()=>auth.setItem('key','value'),{name:'SecurityError'});assert.equal(writeBrowserCache(blocked,'spreelo_ui_labels_v30_sv','{}'),false);
 const s=new QuotaStorage();s.setItem('sb-project-auth-token','token');s.setItem('draft','keep');createPersistentAuthStorage(()=>s).removeItem('sb-project-auth-token');assert.equal(s.getItem('draft'),'keep');assert.equal(s.getItem('sb-project-auth-token'),null);
});
await check('eviction allowlist excludes auth, preferences, handoffs and unknown caches',()=>{
 for(const k of ['sb-project-auth-token','spreelo_calendar_campaign_handoff','spreelo_current_brand_id','spreelo_app_language','spreelo_custom_cache','other_ui_labels_v30_sv'])assert.equal(isRebuildableBrowserCache(k),false,k);
 assert.throws(()=>writeBrowserCache(new QuotaStorage(),'sb-project-auth-token','invalid'),/Only rebuildable/);
});
function namedFunction(file,name){const source=fs.readFileSync(file,'utf8');let found;const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id?.name===name)found=n;for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);};walk(parse(source,{sourceType:'module',plugins:['jsx']}));assert(found);return source.slice(found.start,found.end);}
await check('the complete current UI dictionary fits the per-entry budget',()=>{
 const s=new QuotaStorage();const text=JSON.stringify(getDefaultLabelsForNamespaces(ALL_UI_NAMESPACES));assert(text.length<BROWSER_CACHE_MAX_ENTRY_CHARS);assert.equal(writeBrowserCache(s,'spreelo_ui_labels_v30_sv',text),true);assert.equal(s.getItem('spreelo_ui_labels_v30_sv'),text);
});
await check('actual translation writer retains complete in-memory labels when disk cache is oversized',()=>{
 const s=new QuotaStorage();const memory=new Map([['sv',{existing:'kept'}]]);const fn=createUiTranslationCache({getStorage:()=>s,memory}).write;
 fn('sv',{newLabel:'x'.repeat(BROWSER_CACHE_MAX_ENTRY_CHARS+1)});assert.equal(memory.get('sv').existing,'kept');assert(memory.get('sv').newLabel.length>BROWSER_CACHE_MAX_ENTRY_CHARS);assert.equal(s.length,0);
});
await check('actual client prepares storage before creating the SDK with a persistent adapter',()=>{
 let prepared=false,configured=false;const storage=new QuotaStorage();storage.setItem('sb-project-auth-token','same-key-same-session');
 const source=fs.readFileSync('lib/supabaseClient.js','utf8').replace(/^import .*;\n/gm,'').replace('export const supabase','const supabase');
 vm.runInNewContext(source,{window:{localStorage:storage},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture'}},console,prepareBrowserStorage:s=>{assert.equal(s,storage);prepared=true;},createPersistentAuthStorage,invalidateBrowserSession(){},createClient:(url,key,options)=>{assert(prepared);assert.equal(options.auth.storage.getItem('sb-project-auth-token'),'same-key-same-session');assert.equal(options.auth.persistSession,true);configured=true;return {auth:{onAuthStateChange(){}}};}});assert(configured);
});
console.log(`v144.344: ${checks} storage regression groups passed. No live provider calls.`);
