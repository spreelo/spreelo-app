import {blockDisabledAiBackgroundJob} from '../../../../lib/aiAutomationSwitch.js';
import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {syncOfficialPricing,scanActiveModelAvailability,scanOfficialDocumentation,sendImportantModelAlerts}
  from '../../../../lib/aiModelIntelligenceServer.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

const CHECKS=['pricing','availability','documentation'];
const isComplete=entry=>Boolean(entry && typeof entry==='object' && !entry.error);
const importantOnly=events=>(events||[]).filter(x=>x && (x.severity==='important'||x.severity==='critical') && x.id);
const uniqueEvents=events=>[...new Map(events.map(x=>[x.id,x])).values()];
export function pendingIntelligenceChecks(results){
  return CHECKS.filter(name=>!isComplete(results?.[name]));
}
export function mailBatchId(day,events){
  const eventIds=events.map(x=>x.id).sort().join(':');
  return `spreelo-intelligence-${createHash('sha256').update(`${day}:${eventIds}`).digest('hex').slice(0,32)}`;
}

export async function GET(request){
  const secret=process.env.CRON_SECRET;
  if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)
    return Response.json({ok:false,error:'Unauthorized'},{status:401});
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return Response.json({ok:false,error:'Database configuration missing'},{status:503});
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,
    {auth:{autoRefreshToken:false,persistSession:false}});
  const blocked=await blockDisabledAiBackgroundJob(db);
  if(blocked)return blocked;
  const day=new Date().toISOString().slice(0,10);
  const {data:previous,error:readError}=await db.from('ai_model_intelligence_runs')
    .select('day,results,mail_status,alert_count').eq('day',day).maybeSingle();
  if(readError)return Response.json({ok:false,error:readError.message},{status:503});

  // A failed job must be retried. A mail provider failure must also remain retryable;
  // never mark an incomplete daily run as checked for the whole day.
  const results={...(previous?.results||{})};
  const retryJobs=pendingIntelligenceChecks(results);
  let pendingMail=uniqueEvents(importantOnly(results.__pending_mail_events));
  if(!retryJobs.length && !pendingMail.length)
    return Response.json({ok:true,skipped:'already_checked_today'});

  let added=0;
  if(retryJobs.length){
    const {data:settings,error:settingsError}=await db.from('ai_model_settings').select('purpose,provider,model');
    if(settingsError)return Response.json({ok:false,error:settingsError.message},{status:503});
    const active=(settings||[]).filter(x=>x.provider==='openai').map(x=>x.model);
    const tasks={
      pricing:()=>syncOfficialPricing(db,active,day),
      availability:()=>scanActiveModelAvailability(db,day),
      documentation:()=>scanOfficialDocumentation(db,day),
    };
    for(const name of retryJobs){
      try {
        const response=await tasks[name]();
        const {events=[],...summary}=response;
        results[name]=summary;
        const fresh=importantOnly(events);
        pendingMail=uniqueEvents([...pendingMail,...fresh]);
        added+=events.length;
      }catch(e){results[name]={error:String(e?.message||e).slice(0,300)};}
    }
  }
  const remaining=pendingIntelligenceChecks(results);
  const successful=CHECKS.length-remaining.length;
  if(!successful && !previous)
    return Response.json({ok:false,error:'All intelligence checks failed; retry allowed',results},{status:503});

  // Persist the unsent event IDs/details BEFORE contacting Resend, so even a crash,
  // timeout or missing RESEND_API_KEY cannot silently lose important alerts.
  results.__pending_mail_events=pendingMail;
  const alertCount=Number(previous?.alert_count||0)+added;
  const initialMailStatus=pendingMail.length?'pending':(previous?.mail_status||'not_needed');
  const {error:saveError}=await db.from('ai_model_intelligence_runs').upsert({
    day,checked_at:new Date().toISOString(),results,alert_count:alertCount,
    mail_status:initialMailStatus,
  },{onConflict:'day'});
  if(saveError)return Response.json({ok:false,error:saveError.message,results},{status:503});

  let mail=initialMailStatus;
  if(pendingMail.length){
    mail=await sendImportantModelAlerts(pendingMail,{idempotencyKey:mailBatchId(day,pendingMail)});
    // Only clear after a successful response; failure remains retryable. The
    // day+event-set idempotency key protects the mail retry after a crash.
    if(mail==='sent')results.__pending_mail_events=[];
    const {error:mailSaveError}=await db.from('ai_model_intelligence_runs').update({
      results,mail_status:mail,checked_at:new Date().toISOString(),
    }).eq('day',day);
    if(mailSaveError)return Response.json({ok:false,error:mailSaveError.message,results},{status:503});
  }
  return Response.json({ok:remaining.length===0 && !results.__pending_mail_events.length,
    day,results:{...results,__pending_mail_events:undefined},
    pendingChecks:remaining,alerts:alertCount,mail,
    note:'No automatic model selection changes.'},
    {status:remaining.length||results.__pending_mail_events.length?503:200});
}
