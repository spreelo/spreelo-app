// Actual production app, synthetic auth/data/translation fixtures only.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer,request as proxyRequest} from 'node:http';
import fs from 'node:fs/promises';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import {getDefaultLabelsForNamespaces} from '../lib/i18n/defaultLabels.js';
import {isLanguageNeutralUiSource} from '../lib/i18n/translationValidation.js';

const port=Number(process.env.UI_TEST_PORT||3148),origin=`http://127.0.0.1:${port}`;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port+100)],{stdio:['ignore','pipe','pipe'],env:{...process.env,OPENAI_API_KEY:'sk-offline-build-placeholder',NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'offline-build-placeholder',SUPABASE_SERVICE_ROLE_KEY:'offline-build-placeholder'}});
let browser,log='';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
// A same-origin proxy lets one HTTP response genuinely hang, without CORS
// rejection or leaving Puppeteer's interception itself paused.
let actualHangingRequests=0;
const hangingServer=createServer((req,res)=>{
 if(req.url==='/__ui_translations_hang'){actualHangingRequests++;return;}
 const upstream=proxyRequest({hostname:'127.0.0.1',port:port+100,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
 upstream.on('error',()=>{res.writeHead(503);res.end();});req.pipe(upstream);
});
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{spreelo_creator_welcome_hidden_v310:true,spreelo_theme_calendar_welcome_hidden_v319:true},identities:[],created_at:'2026-01-01T00:00:00Z'};
const token=['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})).toString('base64url'),'offline-signature'].join('.');
const session={access_token:token,refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
const brand={id:'22222222-2222-4222-8222-222222222222',business_name:'Fixture',is_default:true,country_code:'SE',content_language:'Swedish',website_product_mode_available:true,website_url:'https://example.test',website_product_source_url:'https://example.test/products'};
let translationMode='normal',translationCalls=0;
const localized=(namespaces,locale)=>Object.fromEntries(Object.entries(getDefaultLabelsForNamespaces(namespaces)).map(([key,value])=>[key,isLanguageNeutralUiSource(value)?value:`${locale.toUpperCase()} ${value}`]));
const errors=[];
try {
 await new Promise(resolve=>hangingServer.listen(port,'127.0.0.1',resolve));
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/login')).ok)break;}catch{}await pause(100);}
 browser=await puppeteer.launch({executablePath:process.env.LOGIN_TEST_CHROMIUM_PATH||await chromium.executablePath(),headless:true,pipe:true,args:[...chromium.args,'--no-sandbox','--disable-gpu','--disable-overlay-scrollbar','--disable-features=OverlayScrollbar,FluentScrollbar']});
 const page=(await browser.pages())[0]||await browser.newPage();
 await page.setViewport({width:1440,height:900});await page.setRequestInterception(true);
 page.on('pageerror',e=>errors.push(String(e)));
 if(process.env.UI_TEST_DEBUG)page.on('console',m=>{if(m.type()==='error'||m.type()==='warn')console.log('BROWSER',m.text());});
 page.on('request',async req=>{
  const url=new URL(req.url()),headers={'content-type':'application/json','access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS,PATCH,DELETE'};
  const respond=(data,status=200)=>req.respond({status,headers,body:JSON.stringify(data)});
  try {
   if(url.hostname==='example.supabase.co'){
    if(req.method()==='OPTIONS')return req.respond({status:204,headers});
    if(url.pathname.endsWith('/user'))return respond(user);
    if(url.pathname.endsWith('/token'))return respond(session);
    if(url.pathname.includes('/brand_profiles'))return respond(req.headers().accept?.includes('vnd.pgrst.object')?brand:[brand]);
    if(url.pathname.includes('/social_connections'))return respond([{id:'channel',platform:'facebook',status:'connected',brand_profile_id:brand.id}]);
    if(url.pathname.includes('/user_credit_balances'))return respond({credits_remaining:150,monthly_credit_limit:500,subscription_plan:'growth',plan_name:'Growth',subscription_status:'active'});
    if(url.pathname.includes('/brand_campaign_opportunities'))return respond([{id:'opportunity',brand_profile_id:brand.id,title:'Fixture campaign',event_type:'awareness_theme',event_year:new Date().getFullYear(),is_active:true,relevance_score:90}]);
    if(url.pathname.includes('/rpc/'))return respond(null);
    return respond([]);
   }
   if(url.origin===origin){
    if(url.pathname==='/api/ui-translations'){
     translationCalls++;if(translationMode==='timeout')return req.continue({url:`${origin}/__ui_translations_hang`});await pause(650);
     if(translationMode==='failure')return respond({error:'fixture unavailable'},503);
     return respond({labels:localized(url.searchParams.get('namespaces').split(','),url.searchParams.get('locale'))});
    }
    if(url.pathname==='/api/admin/me')return respond({isAdmin:true});
    if(url.pathname.startsWith('/api/'))return respond({ok:true});
    return req.continue();
   }
   return req.abort();
  }catch(error){if(!String(error).includes('Invalid InterceptionId'))errors.push(String(error));}
 });
 await page.evaluateOnNewDocument(session=>{
  if(!sessionStorage.getItem('ui-seeded')){
   localStorage.setItem('spreelo_app_language','sv');localStorage.setItem('spreelo_app_language_source','manual');
   localStorage.setItem('sb-example-auth-token',JSON.stringify(session));
   localStorage.setItem('spreelo_creator_welcome_hidden_v310_fixture@example.test','true');
   localStorage.setItem('spreelo_theme_calendar_welcome_hidden_v319_fixture@example.test','true');
   sessionStorage.setItem('ui-seeded','true');
  }
  window.uiPaints=[];
  const sample=()=>{
   if(document.querySelector('[data-ui-locale-ready="true"]')){
    const headings=[...document.querySelectorAll('h1,h2,.sp85-settings-card-title strong')].filter(e=>e.getBoundingClientRect().width).map(e=>e.textContent.trim());
    if(headings.length)window.uiPaints.push({lang:document.documentElement.lang,headings});
   }
   requestAnimationFrame(sample);
  };requestAnimationFrame(sample);
 },session);
 const settle=async()=>{try{await page.waitForSelector('[data-ui-locale-ready="true"]',{timeout:3000});await page.waitForSelector('aside',{timeout:3000});assert.equal(await page.$('.ui-locale-loading'),null,'translations never install a page mask');}catch(error){console.log('UI failure state',await page.evaluate(()=>({language:document.documentElement.lang,url:location.href,text:document.body.innerText.slice(0,1200),errors:window.uiPaints,ready:document.readyState})));console.log('page errors',errors);throw error;}};
 const assertPaints=async(locale)=>{
  const paints=await page.evaluate(()=>window.uiPaints);assert(paints.length,'sampled visible paints');
  for(const paint of paints){assert.equal(paint.lang,locale,JSON.stringify(paint));assert(!paint.headings.some(h=>['Create your plan','Plan settings','SCHEDULE','STRATEGY'].includes(h)),JSON.stringify(paint));}
 };
 await page.goto(origin+'/automation',{waitUntil:'networkidle0'});await settle();await pause(150);
 await assertPaints('sv');assert((await page.$eval('.sp85-settings-card-schedule strong',e=>e.textContent)).startsWith('SV '));
 console.log('PASS browser: cold Swedish page uses local label placeholders; no exposed English first paint or page mask');
 await page.goto(origin+'/calendar',{waitUntil:'networkidle0'});await settle();await pause(100);await assertPaints('sv');
 assert((await page.$eval('body',e=>e.textContent)).includes('SV Awareness theme'));
 console.log('PASS browser: real calendar routes awareness_theme through translated labels');
 await page.goto(origin+'/automation',{waitUntil:'networkidle0'});await settle();await pause(100);await assertPaints('sv');
 console.log('PASS browser: hard navigation restores Swedish from cache with no English first paint');
 translationMode='timeout';const cachedStart=Date.now();await page.reload({waitUntil:'domcontentloaded'});await settle();
 assert(Date.now()-cachedStart<2500,'cached page cannot wait for translation validation');
 assert((await page.$eval('.sp85-settings-card-schedule strong',e=>e.textContent)).startsWith('SV '));
 await assertPaints('sv');
 console.log('PASS browser: saved Swedish labels and usable page arrive under 2.5s even while server validation hangs');
 translationMode='normal';

 const button=await page.$('.sp85-settings-card-schedule .custom-picker-button');assert(button,'actual start-date picker');await button.evaluate(e=>e.scrollIntoView({block:'center'}));
 const geometry=()=>page.evaluate(()=>({width:document.documentElement.clientWidth,scrollY:window.scrollY,rects:[...document.querySelectorAll('.sp85-settings-card,.sp85-date-control')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.width];})}));
 const before=await geometry();await button.click();await page.waitForSelector('.plan-v308-calendar-layer');const opened=await geometry();
 assert.equal(before.width,opened.width,'viewport width stays stable when scroll is locked');assert.deepEqual(before.rects,opened.rects,'cards/date field do not move sideways');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.plan-v308-calendar-layer'));
 assert.deepEqual((await geometry()).rects,before.rects);assert(await button.evaluate(e=>document.activeElement===e),'Escape restores focus');
 await button.click();await page.waitForSelector('.plan-v308-calendar-layer');await page.click('.custom-calendar-day:not(:disabled):not(.muted)');await page.waitForFunction(()=>!document.querySelector('.plan-v308-calendar-layer'));
 assert.deepEqual((await geometry()).rects,before.rects);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
 console.log('PASS browser: real date picker open/Escape/date selection preserve horizontal geometry and restore scroll/focus');

 await page.setViewport({width:390,height:844});await button.evaluate(e=>e.scrollIntoView({block:'center'}));await button.click();await page.waitForSelector('.plan-v308-calendar-layer');
 const mobile=await page.$eval('.custom-calendar-popover',e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,width:window.innerWidth}));assert(mobile.left>=0&&mobile.right<=mobile.width);
 await page.keyboard.press('Escape');await page.setViewport({width:1440,height:900});
 console.log('PASS browser: mobile calendar stays within viewport');

 await page.evaluate(()=>{localStorage.setItem('spreelo_app_language','de');window.dispatchEvent(new CustomEvent('spreelo_app_language_changed',{detail:{locale:'de'}}));});
 await page.waitForFunction(()=>document.documentElement.lang==='de'&&document.querySelector('.sp85-settings-card-schedule strong')?.textContent.startsWith('DE '));
 assert((await page.$eval('.sp85-settings-card-schedule strong',e=>e.textContent)).startsWith('DE '));
 // Same-locale selection must not acquire an unreleasable readiness hold.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('spreelo_app_language_changed',{detail:{locale:'de'}})));await pause(100);assert.equal(await page.$('.ui-locale-loading'),null);
 console.log('PASS browser: language change reaches a second locale; reselecting it never traps readiness');

 translationMode='failure';await page.evaluate(()=>{localStorage.setItem('spreelo_app_language','sv');for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k.startsWith('spreelo_ui_labels_'))localStorage.removeItem(k);}});
 await page.goto(origin+'/automation',{waitUntil:'networkidle0'});await settle();assert.equal(await page.evaluate(()=>!!localStorage.getItem('sb-example-auth-token')),true);
 console.log('PASS browser: unavailable translation service never blocks the page; session and usable UI survive');

 translationMode='timeout';await page.reload({waitUntil:'domcontentloaded'});const began=Date.now();await settle();
 assert(Date.now()-began<2500,'page usable before the 12s background timeout');
 const unlocked=await page.evaluate(()=>({inert:!!document.querySelector('[data-ui-locale-ready]')?.inert,lang:document.documentElement.lang,heading:document.querySelector('h1')?.textContent}));
 assert.equal(unlocked.inert,false);assert.equal(unlocked.lang,'sv');assert.equal(unlocked.heading,'…','only missing labels get a placeholder during an unfinished request');
 const coldButton=await page.$('.sp85-settings-card-schedule .custom-picker-button');assert(coldButton);await coldButton.click();await page.waitForSelector('.plan-v308-calendar-layer');await page.keyboard.press('Escape');
 assert(actualHangingRequests>0,'the real hanging HTTP fixture must have received a request');
 assert.equal(await page.evaluate(()=>!!localStorage.getItem('sb-example-auth-token')),true);
 console.log('PASS browser: cold page and actual date picker usable in under 2.5s while translation HTTP response is still hanging');
 await page.waitForFunction(()=>document.querySelector('h1')?.textContent!=='…',{timeout:16000});
 assert.equal(await page.$('.ui-locale-loading'),null);
 console.log('PASS browser: background timeout keeps the page usable and permits the existing source fallback');
 translationMode='normal';await page.goto(origin+'/login?lang=en',{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>!document.querySelector('.ui-locale-loading'));
 assert.equal(await page.evaluate(()=>document.documentElement.lang),'en','an explicitly chosen English locale stays English');
 await page.select('#login-language-select','de');await page.waitForFunction(()=>document.documentElement.lang==='de'&&document.querySelector('#login-language-select')?.value==='de');
 await page.select('#login-language-select','de');await pause(100);assert.equal(await page.$('.ui-locale-loading'),null);
 assert.equal(await page.evaluate(()=>localStorage.getItem('spreelo_app_language')),'de');
 console.log('PASS browser: explicit English URL and real login language selector preserve preference; selecting same language stays usable');
 await page.evaluate(()=>{localStorage.setItem('spreelo_app_language','sv');window.dispatchEvent(new StorageEvent('storage',{key:'spreelo_app_language',newValue:'sv'}));});
 await page.waitForFunction(()=>document.documentElement.lang==='sv'&&document.querySelector('#login-language-select')?.value==='sv');
 assert.equal(await page.evaluate(()=>localStorage.getItem('spreelo_app_language')),'sv','cross-tab preference must not be overwritten by the old URL locale');
 console.log('PASS browser: cross-tab language preference synchronizes without an old URL overriding it');
 assert.deepEqual(errors,[],'no page errors / hydration mismatch');assert(translationCalls>0);
 if(process.env.UI_TEST_OUTPUT){await fs.mkdir(process.env.UI_TEST_OUTPUT,{recursive:true});await page.screenshot({path:`${process.env.UI_TEST_OUTPUT}/ui-fallback.png`});}
 console.log('PASS 144.362 production browser suite; no live account, paid model or customer message used');
}finally{if(browser)await browser.close();server.kill('SIGTERM');hangingServer.closeAllConnections();hangingServer.close();}
