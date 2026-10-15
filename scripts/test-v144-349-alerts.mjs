import assert from 'node:assert/strict';
import {sendTerminalVideoAdminAlert} from '../lib/videoTerminalAdminAlert.js';
const prior={RESEND_API_KEY:process.env.RESEND_API_KEY,ADMIN_ALERT_EMAIL:process.env.ADMIN_ALERT_EMAIL};
process.env.RESEND_API_KEY='fake-test-only-key';process.env.ADMIN_ALERT_EMAIL='ops@example.com';
const messages=[],calls=[];
const oldFetch=globalThis.fetch;
globalThis.fetch=async(url,params)=>{messages.push({url,body:JSON.parse(params.body)});return {ok:true,status:200};};
const admin={rpc:async(name,params)=>{calls.push({name,params});return {data:{should_email:calls.length===1,incident_id:'test-incident'},error:null};}};
const post={id:'test-post',user_id:'test-user',video_background_selection:{kling_source_storage_url:'https://example.com/video.mp4'}};
try{
const first=await sendTerminalVideoAdminAlert({supabase:admin,post,stage:'kling_advertising_design',code:'VIDEO_ADVERTISING_DESIGN_REJECTED',message:'Text not readable'});
const second=await sendTerminalVideoAdminAlert({supabase:admin,post,stage:'kling_advertising_design',code:'VIDEO_ADVERTISING_DESIGN_REJECTED',message:'Text not readable'});
assert.equal(first.sent,true);assert.equal(second.reason,'deduplicated');assert.equal(messages.length,1);
assert.match(messages[0].body.text,/Kling-filmen ska återanvändas/);
assert.equal(calls[0].params.p_dedupe_key,calls[1].params.p_dedupe_key);
assert.equal(calls[0].params.p_failure_code,'VIDEO_ADVERTISING_DESIGN_REJECTED');
console.log('PASS v144.349: Kling terminal alerts use durable incident deduplication and precise failure code');
} finally {globalThis.fetch=oldFetch;for(const key of Object.keys(prior))if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
