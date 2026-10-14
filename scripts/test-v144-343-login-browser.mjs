// Optional production-build browser smoke test. All Supabase/API responses are
// intercepted with fixtures. No email, AI generation or live account is used.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
const port=Number(process.env.LOGIN_TEST_PORT||3147),origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{stdio:['ignore','pipe','pipe'],env:{...process.env,
 OPENAI_API_KEY:'sk-offline-build-placeholder',NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'offline-build-placeholder',SUPABASE_SERVICE_ROLE_KEY:'offline-build-placeholder',STRIPE_SECRET_KEY:'sk_test_offline_build_placeholder'}});
let browser,serverLog='';server.stdout.on('data',b=>serverLog+=b);server.stderr.on('data',b=>serverLog+=b);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try {
 let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(origin+'/login');if(r.ok){ready=true;break;}}catch{}await pause(100);}assert(ready,serverLog);
 browser=await puppeteer.launch({executablePath:process.env.LOGIN_TEST_CHROMIUM_PATH||await chromium.executablePath(),headless:true,pipe:true,args:[...chromium.args,'--no-sandbox','--disable-gpu']});
 const page=(await browser.pages())[0]||await browser.newPage();
 for(let i=0;i<30;i++){try{page.mainFrame();break;}catch{}await pause(100);}await page.setViewport({width:1440,height:1000});await page.setRequestInterception(true);
 const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{},identities:[],created_at:'2026-01-01T00:00:00Z'};
 const token=['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})).toString('base64url'),'offline-signature'].join('.');
 const brand={id:'22222222-2222-4222-8222-222222222222',business_name:'Fixture brand',is_default:true};
 let authCalls=0,otpCalls=0,codeRequests=0,authUnavailable=false;
 page.on('request',async req=>{
  const url=new URL(req.url());const headers={'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS,PATCH,DELETE','content-type':'application/json'};
  const respond=(value,status=200)=>req.respond({status,headers,body:JSON.stringify(value)});
  if(url.hostname==='example.supabase.co') {
   if(req.method()==='OPTIONS')return req.respond({status:204,headers});
   if(url.pathname.endsWith('/verify')){otpCalls++;return respond({access_token:token,refresh_token:'fixture-refresh-token',token_type:'bearer',expires_in:3600,user});}
   if(url.pathname.endsWith('/user')){authCalls++;return authUnavailable||authCalls<=2?respond({code:'unexpected_failure',msg:'Fixture temporary outage'},503):respond(user);}
   if(url.pathname.includes('/brand_profiles'))return respond([brand]);
   if(url.pathname.includes('/social_connections'))return respond([{id:'channel',status:'connected',platform:'instagram'}]);
   if(url.pathname.includes('/rpc/'))return respond(null);
   return respond([]);
  }
  if(url.origin===origin) {
   if(url.pathname.startsWith('/api/')){
    if(url.pathname==='/api/auth/send-code'){codeRequests++;return respond({ok:true});}
    if(url.pathname==='/api/admin/me')return respond({isAdmin:true});
    if(url.pathname==='/api/ui-translations')return respond({ok:true,labels:{}});
    return respond({ok:true});
   }
   return req.continue();
  }
  // No external requests can escape the fixture boundary.
  return req.abort();
 });
 await page.goto(origin+'/login',{waitUntil:'networkidle0'});
 await page.type('#login-email',user.email);await page.click('button.login-refresh-primary');
 await page.waitForSelector('.login-refresh-otp input');
 for(let i=0;i<6;i++)await page.type(`.login-refresh-otp input:nth-child(${i+1})`,String(i+1));
 await page.click('button.login-refresh-primary');await page.waitForFunction(()=>location.pathname==='/',{timeout:15000});
 await page.waitForSelector('aside',{timeout:10000});await pause(1500);
 assert.equal(new URL(page.url()).pathname,'/');assert.equal(otpCalls,1);assert(authCalls>=3);
 console.log('PASS browser: actual OTP form survives two auth 503 responses and reaches dashboard once');
 authUnavailable=true;await page.reload({waitUntil:'networkidle0'});
 await page.waitForSelector('.workspace-loader-retry',{timeout:15000});assert.equal(new URL(page.url()).pathname,'/');
 assert(await page.evaluate(()=>Boolean(localStorage.getItem('sb-example-auth-token'))));
 console.log('PASS browser: persistent provider outage displays recovery while preserving session and URL');
 authUnavailable=false;await Promise.all([page.waitForNavigation({waitUntil:'networkidle0',timeout:15000}),page.click('.workspace-loader-retry')]);await page.waitForSelector('aside',{timeout:15000});
 assert.equal(new URL(page.url()).pathname,'/');assert.equal(otpCalls,1);
 assert.equal(codeRequests,1);
 console.log('PASS browser: retry restores dashboard without another OTP or email request');
 await Promise.all([page.waitForNavigation({waitUntil:'networkidle0'}),page.click('.sidebar-logout-button')]);
 assert.equal(new URL(page.url()).pathname,'/login');assert.equal(await page.evaluate(()=>localStorage.getItem('sb-example-auth-token')),null);assert.equal(codeRequests,1);
 console.log('PASS browser: explicit logout removes session and returns to login; no automatic code request');
} finally {if(browser)await browser.close();server.kill('SIGTERM');}
