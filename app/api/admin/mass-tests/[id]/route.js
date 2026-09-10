import crypto from "crypto";
import { adminContextError, getAdminContext } from "../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

function classifyRule(rule, occurrence, post) {
  const occurrenceStatus=String(occurrence?.status||"");
  if (occurrenceStatus==="failed_terminal" || post?.status==="failed") return "failed";
  if (post && ["pending_approval","approved","rejected","generating"].includes(String(post.status||""))) return post.status==="generating"?"running":"completed";
  if (["running","retry_pending"].includes(occurrenceStatus)) return "running";
  if (occurrenceStatus==="completed") return "completed";
  if (rule?.is_active===false && rule?.last_error) return "failed";
  return "waiting";
}

async function loadBatch(context,id) {
  const {data:batch,error:batchError}=await context.admin.from("admin_test_batches").select("*").eq("id",id).eq("created_by",context.user.id).maybeSingle();
  if (batchError) throw batchError; if(!batch) return null;
  const {data:rules,error:rulesError}=await context.admin.from("automation_rules").select("id, brand_profile_id, name, platform, content_type_id, content_type_label, content_format, is_active, next_run_at, last_error, admin_test_job_key, admin_test_repeat_index, queue_source, created_at, updated_at").eq("admin_test_batch_id",id).order("created_at",{ascending:true});
  if(rulesError) throw rulesError;
  const ruleIds=(rules||[]).map((r)=>r.id);
  const [{data:occurrences,error:occError},{data:posts,error:postError},{data:brands,error:brandError},{data:logs,error:logError}] = await Promise.all([
    ruleIds.length?context.admin.from("automation_occurrences").select("id, automation_rule_id, post_id, status, started_at, finished_at, failure_code, failure_stage, failure_message_internal, metadata, admin_test_job_key").in("automation_rule_id",ruleIds).order("started_at",{ascending:false}):Promise.resolve({data:[],error:null}),
    context.admin.from("posts").select("id, automation_rule_id, brand_profile_id, status, content, image_url, video_url, content_format, created_at, admin_test_job_key, admin_review_status").eq("admin_test_batch_id",id).order("created_at",{ascending:false}),
    context.admin.from("brand_profiles").select("id, business_name, website_url").eq("user_id",context.user.id),
    context.admin.from("automation_run_logs").select("id, rule_id, post_id, status, started_at, finished_at, duration_ms, error_message, products_selected, product_titles, product_urls, metadata, admin_test_job_key").eq("admin_test_batch_id",id).order("started_at",{ascending:false}),
  ]);
  if(occError) throw occError;if(postError) throw postError;if(brandError) throw brandError;
  if(logError && !/admin_test_batch_id|schema cache|does not exist/i.test(String(logError.message||""))) throw logError;
  const latestOccurrenceByRule=new Map(); for(const o of occurrences||[]) if(!latestOccurrenceByRule.has(o.automation_rule_id)) latestOccurrenceByRule.set(o.automation_rule_id,o);
  const latestPostByRule=new Map(); for(const p of posts||[]) if(!latestPostByRule.has(p.automation_rule_id)) latestPostByRule.set(p.automation_rule_id,p);
  const latestLogByRule=new Map(); for(const l of logs||[]) if(!latestLogByRule.has(l.rule_id)) latestLogByRule.set(l.rule_id,l);
  const brandMap=Object.fromEntries((brands||[]).map((b)=>[b.id,b]));
  const postIds=(posts||[]).map((p)=>p.id);
  let costRows=[];
  if(postIds.length){const c=await context.admin.from("post_generation_cost_summaries").select("post_id, amount, currency, complete, breakdown").in("post_id",postIds); if(!c.error) costRows=c.data||[];}
  const costMap=Object.fromEntries(costRows.map((c)=>[c.post_id,c]));
  const totalsByCurrency={}; for(const c of costRows){const cur=c.currency||"SEK";totalsByCurrency[cur]=(totalsByCurrency[cur]||0)+Number(c.amount||0);}
  const jobs=(rules||[]).map((rule)=>{const occurrence=latestOccurrenceByRule.get(rule.id)||null;const post=latestPostByRule.get(rule.id)||null;const log=latestLogByRule.get(rule.id)||null;const cost=post?costMap[post.id]||null:null;return {ruleId:rule.id,jobKey:rule.admin_test_job_key,brand:brandMap[rule.brand_profile_id]||{id:rule.brand_profile_id,business_name:"Unknown brand"},campaign:rule.queue_source==="campaign"?rule.name:null,contentTypeId:rule.content_type_id,contentTypeLabel:rule.content_type_label,contentFormat:rule.content_format,platform:rule.platform,status:classifyRule(rule,occurrence,post),occurrence,post:post?{...post,generationCost:cost}:null,runLog:log,error:occurrence?.failure_message_internal||log?.error_message||rule.last_error||null};});
  const counts={waiting:0,running:0,completed:0,failed:0}; for(const j of jobs) counts[j.status]=(counts[j.status]||0)+1;
  const done=counts.completed+counts.failed; const computedStatus=done>=jobs.length?(counts.failed?"completed_with_failures":"completed"):(counts.running?"running":"queued");
  if(batch.status!==computedStatus || (done>=jobs.length && !batch.finished_at)) await context.admin.from("admin_test_batches").update({status:computedStatus,finished_at:done>=jobs.length?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("id",id);
  return {batch:{...batch,status:computedStatus},jobs,counts,costTotals:totalsByCurrency};
}

export async function GET(request,{params}){const context=await getAdminContext(request);if(context.error)return adminContextError(context);try{const {id}=await params;const result=await loadBatch(context,id);if(!result)return Response.json({ok:false,error:"Masstestet hittades inte."},{status:404});return Response.json({ok:true,...result});}catch(error){return Response.json({ok:false,error:error.message||String(error)},{status:500});}}

export async function POST(request,{params}){
  const context=await getAdminContext(request);if(context.error)return adminContextError(context);const body=await request.json().catch(()=>({}));const {id}=await params;
  if(body?.action!=="rerun_failed") return Response.json({ok:false,error:"Unknown action."},{status:400});
  try{
    const result=await loadBatch(context,id);if(!result)return Response.json({ok:false,error:"Masstestet hittades inte."},{status:404});
    const failed=result.jobs.filter((j)=>j.status==="failed");if(!failed.length)return Response.json({ok:false,error:"There are no failed jobs to rerun."},{status:400});
    const failedIds=failed.map((j)=>j.ruleId);const {data:sourceRules,error}=await context.admin.from("automation_rules").select("*").in("id",failedIds);if(error)throw error;
    const nowIso=new Date().toISOString();const clones=(sourceRules||[]).map((source,index)=>{const next={...source};delete next.created_at;delete next.id;next.id=crypto.randomUUID();next.is_active=true;next.next_run_at=nowIso;next.run_date=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Stockholm",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());next.queue_locked_until=null;next.last_error=null;next.credit_reservation_status="legacy";next.credit_reserved_amount=0;next.credit_reserved_at=null;next.credit_consumed_at=null;next.credit_released_at=null;next.admin_test_job_key=`${source.admin_test_job_key||source.id}:rerun:${Date.now()}:${index}`;next.updated_at=nowIso;return next;});
    const {error:insertError}=await context.admin.from("automation_rules").insert(clones);if(insertError)throw insertError;
    await context.admin.from("admin_test_batches").update({status:"running",finished_at:null,total_jobs:Number(result.batch.total_jobs||0)+clones.length,updated_at:nowIso}).eq("id",id);
    return Response.json({ok:true,rerunCount:clones.length});
  }catch(error){return Response.json({ok:false,error:error.message||String(error)},{status:500});}
}
