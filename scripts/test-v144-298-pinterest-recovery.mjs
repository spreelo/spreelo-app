import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('lib/pinterestOAuth.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const routeSource=fs.readFileSync('app/api/cron/refresh-pinterest-tokens/route.js','utf8');
let rows, calls, responseStatus, providerBody, failAccount, disconnectDuringFetch, dbFailure;
function reset(){rows=[];calls=[];responseStatus=200;providerBody={access_token:'new-access',refresh_token:'new-refresh',expires_in:2592000,refresh_token_expires_in:5184000};failAccount=false;disconnectDuringFetch=false;dbFailure=false;}
function db(){return {from(table){assert.equal(table,'social_connections');let update=null;const filters=[];const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,vs){filters.push(r=>vs.includes(r[k]));return q;},limit(){return q;},update(v){update=v;return q;},maybeSingle(){return resolve(true);},then(yes,no){return resolve(false).then(yes,no);}};
 async function resolve(single){if(dbFailure&&update)return {data:null,error:new Error('database unavailable')};const found=rows.filter(r=>filters.every(f=>f(r)));if(update)for(const r of found)Object.assign(r,update);return {data:single?(found[0]?{...found[0]}:null):found.map(r=>({...r})),error:null};}return q;}};}
const env={PINTEREST_APP_ID:'test',PINTEREST_APP_SECRET:'test',CRON_SECRET:'test'};
const context=vm.createContext({console:{info(){},warn(){},error(){}},Date,Buffer,URLSearchParams,process:{env},fetch:async(url,options={})=>{
 calls.push({url,grant:new URLSearchParams(options.body).get('grant_type'),continuous:new URLSearchParams(options.body).get('continuous_refresh')});
 if(url.endsWith('/user_account')){if(disconnectDuringFetch)rows[0].status='disconnected';return {ok:!failAccount,status:failAccount?503:200,json:async()=>failAccount?{message:'Temporary outage'}:{username:'test'}};}
 return {ok:responseStatus===200,status:responseStatus,json:async()=>providerBody};
},createClient:()=>db()});
vm.runInContext(source,context);
let alerts=0;
context.createSupabaseAdminClient=()=>db();context.NextResponse={json:(body,options={})=>({body,status:options.status||200})};
context.markConnectionExpiredAndAlert=async({connectionId})=>{alerts++;rows.find(r=>r.id===connectionId).status='expired';};
vm.runInContext(routeSource.slice(routeSource.indexOf('function isAuthorized')).replace(/export /g,''),context);
const request={headers:{get:()=> 'Bearer test'}};
const base=()=>({id:'test',user_id:'user',brand_profile_id:'brand',platform:'pinterest',page_id:'selected-board',page_access_token:'old-access',refresh_token:'old-refresh',status:'expired',permissions:['pins:write'],token_expires_at:'2026-09-07T11:23:36Z',refresh_token_expires_at:new Date(Date.now()+4*86400000).toISOString()});
reset();rows=[base()];let result=await context.GET(request);
assert.equal(result.body.summary.recovered,1);assert.equal(rows[0].status,'connected');assert.equal(rows[0].refresh_token,'new-refresh');assert.deepEqual(rows[0].permissions,['pins:write']);assert.equal(calls.filter(c=>c.grant==='refresh_token').length,1);assert.ok(rows[0].last_token_refresh_at);assert.equal(alerts,0);
reset();rows=[{...base(),status:'disconnected'}];result=await context.GET(request);assert.equal(result.body.summary.checked,0);assert.equal(calls.length,0);assert.equal(rows[0].status,'disconnected');
for(const change of [{refresh_token:null},{page_id:null},{refresh_token_expires_at:'2020-01-01T00:00:00Z'}]){reset();rows=[{...base(),...change}];result=await context.GET(request);assert.equal(result.body.summary.skipped,1);assert.equal(calls.length,0);}
reset();rows=[{...base(),status:'needs_reconnect'}];result=await context.GET(request);assert.equal(result.body.summary.recovered,1);
for(const status of [400,401,429,500]){reset();rows=[{...base(),status:'connected'}];responseStatus=status;providerBody={message:'Request failed'};result=await context.GET(request);assert.equal(rows[0].status,'connected',String(status));assert.equal(result.body.summary.transientFailures,1);assert.equal(result.body.summary.reconnectRequired,0);assert.ok(rows[0].last_connection_error);}
reset();rows=[{...base(),status:'connected'}];responseStatus=401;providerBody={error:'invalid_client',message:'Invalid client credentials',code:2};result=await context.GET(request);assert.equal(rows[0].status,'connected');assert.equal(result.body.summary.reconnectRequired,0);
reset();rows=[{...base(),status:'connected'}];responseStatus=400;providerBody={error:'invalid_grant',message:'Refresh token revoked'};result=await context.GET(request);assert.equal(rows[0].status,'expired');assert.equal(result.body.summary.reconnectRequired,1);
reset();rows=[base()];failAccount=true;result=await context.GET(request);assert.equal(result.body.summary.recovered,0);assert.equal(rows[0].status,'expired');assert.equal(result.body.summary.transientFailures,1);
reset();rows=[base()];disconnectDuringFetch=true;result=await context.GET(request);assert.equal(rows[0].status,'disconnected');assert.equal(result.body.summary.recovered,0);assert.equal(result.body.summary.skipped,1);
reset();rows=[base()];dbFailure=true;result=await context.GET(request);assert.equal(result.body.summary.recovered,0);assert.equal(rows[0].status,'expired');
reset();rows=[base()];await assert.rejects(context.refreshStoredPinterestConnection({supabaseAdmin:db(),connection:{...rows[0],refresh_token:'stale-refresh'},force:true}),e=>e.code==='PINTEREST_CONNECTION_CHANGED');assert.equal(rows[0].refresh_token,'old-refresh');
reset();await context.exchangePinterestCode({code:'test',appId:'test',appSecret:'test',redirectUri:'https://example.test'});assert.equal(calls[0].continuous,'true');
result=await context.GET({headers:{get:()=>''}});assert.equal(result.status,401);
const cron=JSON.parse(fs.readFileSync('vercel.json','utf8')).crons.find(c=>c.path==='/api/cron/refresh-pinterest-tokens');assert.equal(cron.schedule,'15 3 * * *');
console.log('PASS v144.298: expired and reconnect recovery, saved rotation, original scopes, user validation, disconnected/missing/expired grant exclusion, generic 400/401 and app credential isolation, 429/500, revoked grant, storage failure, disconnect race, concurrent rotation, continuous grants, cron authorization and daily schedule. No live requests or emails.');
