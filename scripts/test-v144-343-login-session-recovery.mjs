import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createBrowserSessionReader, getBrowserUserOrRedirect, confirmCodeLoginSession, sessionFailureDetails} from '../lib/browserSession.js';
import {createLoginCodeRateLimit} from '../lib/loginCodeRateLimit.js';
import {isLoginCodeRateLimitError, loginCodeRequestError, remainingLoginCodeCooldown, saveLoginCodeCooldown} from '../lib/loginCodeCooldown.js';
const require = createRequire(import.meta.url);
const {parse} = require('next/dist/compiled/babel/parser');
const verified = {id:'verified-account'};
const session = token => ({access_token:token, user:{id:'untrusted-local-account'}});
const okSession = s => ({data:{session:s},error:null});
const okUser = user => ({data:{user},error:null});
const failure = (code,status=503) => ({data:{user:null},error:{code,status}});
const reader = (auth, options={}) => createBrowserSessionReader(auth,{wait:async()=>{},timeoutMs:100,...options});
let checks=0;
async function check(label, fn) {await fn(); checks++;console.log('PASS:',label);}
function functionSource(path,name) {
 const source=fs.readFileSync(path,'utf8'); const ast=parse(source,{sourceType:'module',plugins:['jsx']});let found;
 function walk(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id?.name===name)found=node;for(const v of Object.values(node))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}
 walk(ast);assert(found,`${name} exists`);return source.slice(found.start,found.end);
}
const runFunction = (path,name,context={}) => vm.runInNewContext(`(${functionSource(path,name)})`,context);
await check('only the server-verified user reaches protected pages',async()=>{
 const r=reader({getSession:async()=>okSession(session('A')),getUser:async token=>{assert.equal(token,'A');return okUser(verified);}});
 const result=await r.read();assert.equal(result.status,'authenticated');assert.deepEqual(result.session.user,verified);assert.deepEqual(result.user,verified);
});
for(const error of [failure('over_request_rate_limit',429),failure('unexpected_failure',503),{error:new TypeError('Failed to fetch')}]) await check(`temporary ${error.error.code||'network'} failure retries without signing out`,async()=>{
 let calls=0;const result=await reader({getSession:async()=>okSession(session('A')),getUser:async()=>++calls===1?error:okUser(verified)}).read();assert.equal(result.status,'authenticated');assert.equal(calls,2);
});
await check('persistent network error, empty provider response and timeout stay unavailable',async()=>{
 for(const getUser of [async()=>failure('network',503),async()=>okUser(null),()=>new Promise(()=>{})]) {
  const result=await reader({getSession:async()=>okSession(session('A')),getUser},{timeoutMs:5}).read();assert.equal(result.status,'unavailable');assert.equal(result.user,null);assert.equal(result.session,null);
 }
});
await check('missing session and confirmed expired session require a new login',async()=>{
 assert.equal((await reader({getSession:async()=>okSession(null),getUser:async()=>assert.fail('no token')}).read()).status,'signed_out');
 assert.equal((await reader({getSession:async()=>okSession(session('A')),getUser:async()=>failure('session_expired',401)}).read()).status,'signed_out');
});
await check('auth initialization can settle before the missing-session decision',async()=>{
 let calls=0;assert.equal((await reader({getSession:async()=>okSession(++calls===1?null:session('A')),getUser:async()=>okUser(verified)}).read()).status,'authenticated');
});
await check('a delayed response for an old token cannot eject the new session',async()=>{
 let token='A'; const tokens=[];
 const result=await reader({getSession:async()=>okSession(session(token)),getUser:async t=>{tokens.push(t);if(t==='A'){token='B';return failure('session_not_found',401);}return okUser(verified);}}).read();assert.equal(result.status,'authenticated');assert.deepEqual(tokens,['A','B']);
});
await check('a successful stale response cannot revive explicit logout or previous account',async()=>{
 let token='A';const auth={getSession:async()=>okSession(token?session(token):null),getUser:async()=>{token=null;return okUser(verified);}};
 assert.equal((await reader(auth).read()).status,'signed_out');
 token='A';auth.getUser=async t=>{token='B';return okUser(t==='A'?{id:'old-account'}:verified);};assert.equal((await reader(auth).read()).user.id,verified.id);
});
await check('layout and page share verification; verified cache expires, invalidates and respects logout',async()=>{
 let calls=0,time=0,token='A';const r=reader({getSession:async()=>okSession(token?session(token):null),getUser:async()=>{calls++;return okUser(verified);}},{now:()=>time});
 const a=r.read(),b=r.read();assert.equal(a,b);await Promise.all([a,b]);assert.equal(calls,1);await r.read();assert.equal(calls,1);
 time=10001;await r.read();assert.equal(calls,2);r.invalidate();await r.read();assert.equal(calls,3);token=null;assert.equal((await r.read()).status,'signed_out');
});
await check('temporary dashboard failure dispatches recovery, never redirects or clears auth',async()=>{
 let events=0;globalThis.window={location:{href:'/current'},dispatchEvent:()=>events++};globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail;}};
 const auth={getSession:async()=>okSession(session('A')),getUser:async()=>failure('network',503),signOut:async()=>assert.fail('must not sign out')};
 assert.equal(await getBrowserUserOrRedirect({auth}),null);assert.equal(window.location.href,'/current');assert.equal(events,1);
 auth.getSession=async()=>okSession(null);assert.equal(await getBrowserUserOrRedirect({auth}),null);assert.equal(window.location.href,'/login');delete globalThis.window;delete globalThis.CustomEvent;
});
await check('code confirmation rejects a different account',async()=>{
 const result=await confirmCodeLoginSession({auth:{getSession:async()=>okSession(session('B')),getUser:async()=>okUser({id:'another-account'})}},verified.id);
 assert.equal(result.status,'unavailable');assert.equal(result.error.code,'AUTH_LOGIN_ACCOUNT_CHANGED');assert.equal(result.user,null);
});
await check('diagnostics exclude token, raw message and email',async()=>{
 assert.deepEqual(sessionFailureDetails({code:'network',status:503,message:'secret-token user@example.com'},'verify_user'),{code:'network',status:503,stage:'verify_user'});
});
await check('actual login handler verifies an accepted OTP once and retries confirmation without a new code',async()=>{
 let otpCalls=0,confirmCalls=0,redirects=0,welcome=0;const messages=[];const acceptedCodeRef={current:null};
 const fn=runFunction('app/login/page.jsx','handleVerifyCode',{
  loading:false,verifying:false,email:'test@example.com',otpDigits:['1','2','3','4','5','6'],normalizeEmail:v=>v,normalizeOtp:v=>v,
  setVerifying:()=>{},setMessage:x=>messages.push(x),setMessageType:()=>{},t:x=>x,withTimeout:p=>p,acceptedCodeRef,
  supabase:{auth:{verifyOtp:async()=>{otpCalls++;return {data:{session:session('A'),user:verified}};}}},
  confirmCodeLoginSession:async()=>++confirmCalls===1?{status:'unavailable',error:{code:'network'}}:{status:'authenticated',user:verified,session:session('A')},
  sessionFailureDetails,console:{warn(){}},requestWelcomeEmail:()=>welcome++,redirectAfterLogin:async()=>redirects++
 });
 await fn({preventDefault(){}});assert.equal(redirects,0);assert(messages.includes('layout.sessionTemporaryError'));
 await fn({preventDefault(){}});assert.equal(otpCalls,1);assert.equal(redirects,1);assert.equal(welcome,1);
});
await check('actual dashboard stops before data access when session verification is unavailable',async()=>{
 const source=functionSource('app/page.jsx','loadDashboard');let calls=0;const context={getBrowserUserOrRedirect:async()=>null,supabase:{from:()=>{calls++;assert.fail('unverified data access');}}};
 for(const name of source.match(/\bset[A-Z]\w*/g)||[])context[name]=()=>{};
 await vm.runInNewContext(`(${source})`,context)();assert.equal(calls,0);
});
await check('actual layout displays recovery on unavailable, redirects only on confirmed sign-out',async()=>{
 let error='',href='/';const context={setCheckingSession(){},setSessionCheckError:x=>error=x,t:x=>x,console,window:{location:{get href(){return href;},set href(x){href=x;}}},
  getSessionWithRetry:async()=>({session:null,error:{code:'network',status:503}})};
 await runFunction('components/AppLayout.jsx','checkUser',context)();assert.equal(href,'/');assert.equal(error,'layout.sessionTemporaryError');
 context.getSessionWithRetry=async()=>({session:null,error:null});await runFunction('components/AppLayout.jsx','checkUser',context)();assert.equal(href,'/login');
});
await check('actual admin-access check retains its timeout and role verification',async()=>{
 let admin=false,checked=false,calls=0;
 const source=fs.readFileSync('components/AppLayout.jsx','utf8');
 const timeout=Number(source.match(/const SESSION_REQUEST_TIMEOUT_MS = (\d+)/)?.[1]);assert(timeout>0);
 const fn=runFunction('components/AppLayout.jsx','checkAdminAccess',{supabase:{auth:{getSession:async()=>okSession(session('A'))}},
  withTimeout:async(p,ms)=>{assert.equal(ms,timeout);return p;},SESSION_REQUEST_TIMEOUT_MS:timeout,
  fetch:async(_url,options)=>{assert.equal(options.headers.Authorization,'Bearer A');calls++;return {ok:true,json:async()=>({isAdmin:true})};},setIsAdmin:x=>admin=x,setAdminAccessChecked:x=>checked=x});
 assert.equal(await fn(),true);assert.equal(calls,1);assert(admin&&checked);
});
await check('actual workspace routing preserves in-memory session via Next router',async()=>{
 const paths=[];const query={select(){return this;},eq(){return this;},limit:async()=>({data:[{id:'brand'}]})};
 await runFunction('app/login/page.jsx','redirectAfterLogin',{supabase:{from:()=>query},withTimeout:p=>p,router:{replace:p=>paths.push(p)},getSafeNextPath:()=>'/calendar',t:x=>x})(verified);
 assert.deepEqual(paths,['/calendar']);
});
await check('resend limiter rejects early clicks without extending the original deadline',async()=>{
 let time=0;const limit=createLoginCodeRateLimit({now:()=>time}),request={headers:new Headers({'x-forwarded-for':'192.0.2.1'})};
 assert.equal(limit(request,'a@example.com').limited,false);time=10000;assert.deepEqual(limit(request,'a@example.com'),{limited:true,retryAfterSeconds:45});
 time=54000;assert.equal(limit(request,'a@example.com').retryAfterSeconds,1);time=55000;assert.equal(limit(request,'a@example.com').limited,false);
 assert.equal(limit(request,'b@example.com').limited,false);assert.equal(limit({headers:new Headers({'x-forwarded-for':'192.0.2.2'})},'a@example.com').limited,false);
});
await check('HTTP status, RATE_LIMIT code and Retry-After drive the persisted cooldown',async()=>{
 const error=loginCodeRequestError({status:429,headers:new Headers({'Retry-After':'17'})},{code:'RATE_LIMIT',error:'Wait before requesting another code.'},'fallback');
 assert(isLoginCodeRateLimitError(error));assert.equal(error.retryAfterSeconds,17);assert(isLoginCodeRateLimitError({code:'RATE_LIMIT'}));assert(!isLoginCodeRateLimitError({status:500}));
 const saved=new Map(),storage={setItem:(k,v)=>saved.set(k,v),getItem:k=>saved.get(k)};saveLoginCodeCooldown(storage,'TEST@example.com',17,1000);
 assert.equal(remainingLoginCodeCooldown(storage,'test@example.com',2000),16);assert.equal(remainingLoginCodeCooldown(storage,'test@example.com',18000),0);
 assert.equal(remainingLoginCodeCooldown({getItem(){throw Error('blocked');}},'test'),0);
});
await check('actual blocked send-code route returns cooldown metadata without external requests',async()=>{
 const s=fs.readFileSync('app/api/auth/send-code/route.js','utf8').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,'').replace(/export /g,'');let calls=0;
 const context={Response,process:{env:{}},console,createLoginCodeRateLimit:()=>()=>({limited:true,retryAfterSeconds:21}),createClient:()=>{calls++;throw Error('outgoing');},fetch:async()=>{calls++;throw Error('outgoing');}};
 const fn=vm.runInNewContext(`${s}\nPOST`,context);const response=await fn({json:async()=>({email:'test@example.com'})});
 assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'21');assert.equal((await response.json()).code,'RATE_LIMIT');assert.equal(calls,0);
});
await check('actual rejected resend keeps the already-entered OTP and accepted result',async()=>{
 const state={digits:0,cooldown:0};const acceptedCodeRef={current:{email:'test@example.com',data:{user:verified}}};const error=Object.assign(new Error('Wait'),{code:'RATE_LIMIT',retryAfterSeconds:12});
 const fn=runFunction('app/login/page.jsx','handleSendCode',{loading:false,verifying:false,resendCooldown:0,email:'test@example.com',locale:'sv',normalizeEmail:v=>v,t:x=>x,
  setLoading(){},setMessage(){},setMessageType(){},setEmail(){},getSafeNextPath:()=>'',withTimeout:p=>p,
  fetch:async()=>{throw error;},isRateLimitError:isLoginCodeRateLimitError,setCodeSent(){},setResendCooldown:x=>state.cooldown=x,saveLoginCodeCooldown(){},window:{sessionStorage:{},location:{origin:'https://example.test'}},localStorage:{setItem(){}},
  OTP_RESEND_COOLDOWN_SECONDS:60,SAVED_LOGIN_EMAIL_KEY:'email',acceptedCodeRef,resetOtpDigits:()=>state.digits++});
 await fn({preventDefault(){}});assert.equal(state.cooldown,12);assert.equal(state.digits,0);assert.equal(acceptedCodeRef.current.data.user.id,verified.id);
});
console.log(`v144.343: ${checks} offline auth/session/cooldown regression groups passed. No live provider calls.`);
