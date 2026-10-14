// Reproduce the former failure and the corrected persistence using the actual
// installed Supabase SDK in Chromium. Provider requests use local fixtures only.
import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';import chromium from '@sparticuz/chromium';
const sdk=fs.readFileSync('node_modules/@supabase/supabase-js/dist/umd/supabase.js','utf8');
const storageSource=fs.readFileSync('lib/browserStorage.js','utf8').replace(/^export /gm,'');
const clientSource=fs.readFileSync('lib/supabaseClient.js','utf8').replace(/^import .*;\n/gm,'').replace('export const supabase','const supabase');
const port=Number(process.env.STORAGE_TEST_PORT||3153),origin=`http://127.0.0.1:${port}`;
const server=http.createServer((q,r)=>r.end('<html><body>storage fixture</body></html>'));await new Promise(r=>server.listen(port,'127.0.0.1',r));let browser;
try{
 browser=await puppeteer.launch({executablePath:process.env.LOGIN_TEST_CHROMIUM_PATH||await chromium.executablePath(),args:chromium.args,headless:true,pipe:true});
 const page=(await browser.pages())[0]||await browser.newPage();await page.setRequestInterception(true);let verifies=0,users=0;
 const user={id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},identities:[]};
 const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'offline'].join('.');
 page.on('request',q=>{
  if(!q.url().startsWith('https://example.supabase.co'))return new URL(q.url()).origin===origin?q.continue():q.abort();
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'};
  if(q.method()==='OPTIONS')return q.respond({status:204,headers});
  if(q.url().includes('/verify')){verifies++;return q.respond({status:200,headers,body:JSON.stringify({user,access_token:token,refresh_token:'fixture-refresh',expires_in:3600,token_type:'bearer'})});}
  users++;return q.respond({status:200,headers,body:JSON.stringify(user)});
 });
 async function seedFull(){await page.evaluate(()=>{localStorage.clear();localStorage.setItem('spreelo_calendar_campaign_handoff','fixture-unsaved');let lo=0,hi=8*1024*1024;while(lo<hi){let mid=Math.ceil((lo+hi)/2);try{localStorage.setItem('spreelo_ui_labels_v29_sv','x'.repeat(mid));lo=mid;}catch{hi=mid-1;}}localStorage.setItem('spreelo_ui_labels_v29_sv','x'.repeat(lo));});}
 async function initialize(fixed){await page.addScriptTag({content:sdk});if(fixed){await page.addScriptTag({content:storageSource});await page.addScriptTag({content:`(()=>{const createClient=window.supabase.createClient;const process={env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-anon'}};const invalidateBrowserSession=()=>{};${clientSource}\nwindow.client=supabase;})()`});}else await page.evaluate(()=>window.client=supabase.createClient('https://example.supabase.co','fixture-anon'));}
 const signIn=()=>page.evaluate(async()=>{const result=await client.auth.verifyOtp({email:'fixture@example.test',token:'123456',type:'email'});return {accepted:!!result.data.session,error:result.error?.name,localSession:!!(await client.auth.getSession()).data.session,persisted:!!localStorage.getItem('sb-example-auth-token')};});
 await page.goto(origin);await seedFull();await initialize(false);const before=await signIn();
 await page.goto(origin+'/after');await initialize(false);const after=await page.evaluate(async()=>{const r=await client.auth.getUser();return {user:!!r.data.user,error:r.error?.name};});
 assert(before.accepted&&before.localSession&&!before.persisted);assert.equal(after.user,false);assert.equal(after.error,'AuthSessionMissingError');assert.equal(users,0);
 console.log('PASS reproduction: full cache -> OTP accepted in memory -> hard navigation loses session -> AuthSessionMissingError without user request');
 await page.goto(origin);await seedFull();await initialize(true);const corrected=await signIn();assert(corrected.accepted&&corrected.persisted);
 assert.equal(await page.evaluate(()=>localStorage.getItem('spreelo_calendar_campaign_handoff')),'fixture-unsaved');
 await page.goto(origin+'/after');await initialize(true);const restored=await page.evaluate(async()=>{const stored=await client.auth.getSession();const checked=await client.auth.getUser();return {session:!!stored.data.session,user:!!checked.data.user};});assert(restored.session&&restored.user);assert.equal(verifies,2);assert.equal(users,1);
 console.log('PASS correction: same full cache recovered; actual client persists session across hard navigation; server-verified account and unsaved handoff preserved');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
