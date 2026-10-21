// No provider calls and no Supabase secrets. Run: node --test tests/kling-capacity-queue.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const file=await readFile(new URL("../lib/klingCapacityQueue.js",import.meta.url),"utf8");
const mod=await import("data:text/javascript;base64,"+Buffer.from(file).toString("base64"));
const {klingCapacityQueueEnabled,klingRuleCapacityKey,tryAdmitKlingRule,
  releaseUnattemptedKlingSlot,markKlingSubmissionAttempt,markKlingSubmissionAccepted,
  markKlingProviderTaskTerminal}=mod;

test("queue defaults to disabled and requires explicit true",()=>{
 assert.equal(klingCapacityQueueEnabled({}),false);
 assert.equal(klingCapacityQueueEnabled({SPREELO_KLING_CAPACITY_QUEUE_ENABLED:"false"}),false);
 assert.equal(klingCapacityQueueEnabled({SPREELO_KLING_CAPACITY_QUEUE_ENABLED:"true"}),true);
});
test("stable job identity from rule and schedule",()=>{
 assert.equal(klingRuleCapacityKey("abc","2026-10-21T08:00:00Z"),
   "rule:abc:2026-10-21T08:00:00.000Z");
 assert.throws(()=>klingRuleCapacityKey(null,"2026-10-21T08:00Z"));
});
test("full provider capacity returns deferral, not a POST",async()=>{
 const calls=[];
 const sb={rpc:async(name,args)=>{calls.push([name,args]);return {data:false,error:null}}};
 const ret=await tryAdmitKlingRule(sb,{id:"rule-1"},"2026-10-21T08:00:00Z");
 assert.equal(ret.admitted,false);
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],"try_admit_kling_capacity");
});
test("database faults fail closed, never silently grant capacity",async()=>{
 const sb={rpc:async()=>({data:null,error:{message:"migration missing"}})};
 await assert.rejects(tryAdmitKlingRule(sb,{id:"r"},"2026-10-21T08:00Z"),{code:"KLING_CAPACITY_GATE_UNAVAILABLE"});
});
test("release only delegates to guarded unattempted-only SQL RPC",async()=>{
 const calls=[];const sb={rpc:async(name,args)=>{calls.push([name,args]);return {data:true,error:null}}};
 await releaseUnattemptedKlingSlot(sb,"rule:abc:2026");
 assert.equal(calls[0][0],"release_unattempted_kling_capacity");
});
test("attempts and accepted tasks bind through the same post ID",async()=>{
 const prior=process.env.SPREELO_KLING_CAPACITY_QUEUE_ENABLED;
 process.env.SPREELO_KLING_CAPACITY_QUEUE_ENABLED="true";
 try{
  const calls=[];const sb={rpc:async(name,args)=>{calls.push([name,args]);return {data:true,error:null}}};
  await markKlingSubmissionAttempt(sb,"post-id");
  await markKlingSubmissionAccepted(sb,"post-id","task-id");
  await markKlingProviderTaskTerminal(sb,"post-id","completed");
  assert.deepEqual(calls.map(([name])=>name),[
    "mark_kling_capacity_attempt","mark_kling_capacity_submitted","complete_kling_capacity_slot"]);
 }finally{
  if(prior===undefined)delete process.env.SPREELO_KLING_CAPACITY_QUEUE_ENABLED;
  else process.env.SPREELO_KLING_CAPACITY_QUEUE_ENABLED=prior;
 }
});
