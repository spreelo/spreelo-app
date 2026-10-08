import { adminContextError, getAdminContext } from '../../../../lib/adminAuth';
import { AI_PURPOSES, VERIFIED_MODEL_CAPABILITIES, isVerifiedForCapability } from '../../../../lib/aiModelControl';

export const dynamic = 'force-dynamic';

async function fetchOpenAiModels() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) return [];
  try {
    const r = await fetch('https://api.openai.com/v1/models', { headers:{Authorization:`Bearer ${key}`}, cache:'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.data || []).map(x => String(x.id || '')).filter(Boolean);
  } catch { return []; }
}

export async function GET(request) {
  const context = await getAdminContext(request); if (context.error) return adminContextError(context);
  const { data, error } = await context.admin.from('ai_model_settings').select('*').order('purpose');
  const rows = error ? [] : (data || []);
  const liveOpenAi = new Set(await fetchOpenAiModels());
  const purposes = AI_PURPOSES.map(p => {
    const row = rows.find(r => r.purpose === p.key);
    const current = row?.model || p.fallback;
    const verified = Object.keys(VERIFIED_MODEL_CAPABILITIES).filter(m => {
      if (!isVerifiedForCapability(m,p.capability)) return false;
      if (p.provider === 'openai') return m.startsWith('gpt-') && (liveOpenAi.size === 0 || liveOpenAi.has(m) || m === current);
      return m.startsWith('kling-');
    });
    if (!verified.includes(current)) verified.unshift(current); // never hide the live v322 choice
    return {...p, model:current, default_model:row?.default_model || p.fallback, options:[...new Set(verified)], changed_at:row?.changed_at || null, auto_replaced:Boolean(row?.auto_replaced), replacement_reason:row?.replacement_reason || null};
  });
  return Response.json({ok:true,purposes, catalogWarning:error ? 'AI Control SQL has not been applied yet. Spreelo is still using the v322 defaults.' : null});
}

export async function PATCH(request) {
  const context = await getAdminContext(request); if (context.error) return adminContextError(context);
  const body = await request.json().catch(()=>({}));
  const purpose = AI_PURPOSES.find(p=>p.key===String(body.purpose||''));
  if (!purpose) return Response.json({ok:false,error:'Unknown AI purpose.'},{status:400});
  const model = String(body.model||'').trim();
  if (!isVerifiedForCapability(model,purpose.capability)) return Response.json({ok:false,error:'This model is not verified for the required capability.'},{status:400});
  if (purpose.provider==='openai' && !model.startsWith('gpt-')) return Response.json({ok:false,error:'Only OpenAI GPT models are enabled in v323.'},{status:400});
  if (purpose.provider==='kling' && !model.startsWith('kling-')) return Response.json({ok:false,error:'Only Kling models are enabled for video in v323.'},{status:400});
  const payload={purpose:purpose.key,provider:purpose.provider,model,default_model:purpose.fallback,capability:purpose.capability,changed_by:context.user.id,changed_at:new Date().toISOString(),auto_replaced:false,replacement_reason:null};
  const {data,error}=await context.admin.from('ai_model_settings').upsert(payload,{onConflict:'purpose'}).select('*').single();
  if(error) return Response.json({ok:false,error:`${error.message}. Run supabase/v144_323_ai_control_center.sql first.`},{status:500});
  return Response.json({ok:true,setting:data});
}
