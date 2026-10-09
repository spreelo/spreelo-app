import {blockDisabledAiBackgroundJob} from '../../../../lib/aiAutomationSwitch.js';
import {createClient} from '@supabase/supabase-js';
import {syncDiscoveredModels,probePendingModels,checkMissingActiveModels,syncKlingDocumentedCandidates} from '../../../../lib/aiModelDiscovery';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`) return Response.json({ok:false,error:'Unauthorized'},{status:401});
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY) return Response.json({ok:false,error:'Database configuration missing'},{status:503});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const blocked=await blockDisabledAiBackgroundJob(db);
  if(blocked)return blocked;
 try {
   const sync=await syncDiscoveredModels(db);
   const kling=await syncKlingDocumentedCandidates(db);
   const probes=await probePendingModels(db);
   const alerts=await checkMissingActiveModels(db);
   return Response.json({ok:true,...sync,kling,probes,alerts,note:'Only successfully probed capabilities become selectable; existing production models unchanged. Kling documentation candidates remain pending until separately verified.'});
 } catch(e){return Response.json({ok:false,error:String(e?.message||e)},{status:503});}
}
