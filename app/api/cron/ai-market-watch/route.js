import {createClient} from '@supabase/supabase-js';
import {getConfiguredAdminEmails} from '../../../../lib/adminAuth.js';
import {WATCH_SOURCES,fetchFeed} from '../../../../lib/aiMarketWatch';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({ok:false,error:'Unauthorized'},{status:401});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const day=new Date().toISOString().slice(0,10);
 const {data:prior}=await db.from('ai_market_watch_runs').select('day').eq('day',day).maybeSingle();
 if(prior)return Response.json({ok:true,skipped:'already_checked_today'});
 let ok=0,failed=0;const incoming=[];
 for(const source of WATCH_SOURCES){try{const items=await fetchFeed(source);incoming.push(...items);ok++;}catch{failed++;}}
 if(!ok)return Response.json({ok:false,error:'All news feeds unavailable; will retry next run',failed},{status:503});
 const unique=[...new Map(incoming.map(x=>[x.id,x])).values()];
 const ids=unique.map(x=>x.id);
 const existing=new Set();
 for(let i=0;i<ids.length;i+=100){const {data}=await db.from('ai_market_news').select('id').in('id',ids.slice(i,i+100));for(const x of data||[])existing.add(x.id);}
 const fresh=unique.filter(x=>!existing.has(x.id));
 if(fresh.length){const {error}=await db.from('ai_market_news').upsert(fresh,{onConflict:'id',ignoreDuplicates:true});if(error)return Response.json({ok:false,error:error.message},{status:500});}
 const {error:runError}=await db.from('ai_market_watch_runs').insert({day,sources_ok:ok,sources_failed:failed,discovered:fresh.length});
 if(runError)return Response.json({ok:false,error:runError.message},{status:500});
 // Mail only significant NEW events. Do not block daily watch if mail provider fails.
 const important=fresh.filter(x=>x.severity!=='info');
 const recipients=[...new Set([...getConfiguredAdminEmails(),...String(process.env.ADMIN_ALERT_EMAIL||'').split(/[;,\n]/).map(x=>x.trim()).filter(Boolean)])];
 let mail='not_needed';
 if(important.length&&recipients.length&&process.env.RESEND_API_KEY){
  const base=String(process.env.NEXT_PUBLIC_APP_URL||process.env.APP_URL||'https://app.spreelo.com').replace(/\/$/,'');
  const lines=important.slice(0,12).map(x=>`${x.provider}: ${x.title}\n${x.url}`).join('\n\n');
  try{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL||'Spreelo <noreply@spreelo.com>',to:recipients,subject:`Spreelo AI-bevakning: ${important.length} viktiga uppdateringar`,text:`Nya händelser att granska (inte verifierade modellavvecklingar):\n\n${lines}\n\n${base}/admin/ai-control`})});mail=r.ok?'sent':`failed_${r.status}`;}catch{mail='failed';}
 }
 return Response.json({ok:true,checked:ok,failed,discovered:fresh.length,important:important.length,mail});
}
