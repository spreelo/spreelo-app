import {adminContextError,getAdminContext} from '../../../../lib/adminAuth.js';
import {AI_PURPOSES,isVerifiedForCapability} from '../../../../lib/aiModelControl.js';
import {recommendedReplacement,compareTextPrices} from '../../../../lib/aiModelIntelligence.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
  const context=await getAdminContext(request);
  if(context.error)return adminContextError(context);
  const db=context.admin;
  const [settingsResult,catalogResult,pricesResult,signalsResult,runResult]=await Promise.all([
    db.from('ai_model_settings').select('purpose,provider,model'),
    db.from('ai_model_catalog').select('provider,model,status,verified_capabilities,verified_at,last_seen_at').limit(1000),
    db.from('ai_model_pricing').select('provider,model,unit,amount_usd,source_url,verified_at').limit(1000),
    db.from('ai_model_availability_signals').select('*').eq('provider','openai').limit(200),
    db.from('ai_model_intelligence_runs').select('*').order('day',{ascending:false}).limit(1),
  ]);
  const fatal=[settingsResult,catalogResult,pricesResult,signalsResult,runResult].find(x=>x.error);
  if(fatal)return Response.json({ok:false,error:`AI Model Intelligence SQL is missing or unavailable: ${fatal.error.message}`},{status:503});
  const settings=settingsResult.data||[],catalog=catalogResult.data||[],prices=pricesResult.data||[];
  const signals=signalsResult.data||[];
  // Last known successful authenticated listing is approximated by the fresh catalog snapshot.
  // Recommendations require recently seen, approved API-tested models (never a guess).
  const fresh=Date.now()-2*86400000;
  const live=catalog.filter(x=>x.last_seen_at&&Date.parse(x.last_seen_at)>=fresh).map(x=>x.model);
  const recommendations=settings.map(s=>{
    const purpose=AI_PURPOSES.find(p=>p.key===s.purpose && p.provider===s.provider);
    if(!purpose)return null;
    const signal=signals.find(x=>x.model===s.model);
    const warn=Boolean(signal?.alert_status==='warning');
    if(!warn)return null;
    const approved=catalog.filter(c=>c.status==='approved' && c.verified_capabilities?.includes(purpose.capability));
    const replacement=recommendedReplacement({purpose,active:s.model,approved,availableModels:live,priceRows:prices});
    return {purpose:s.purpose,label:purpose.label,model:s.model,missingDays:signal.consecutive_missing,
      candidate:replacement,warning:'Modellen saknas i upprepade API-listningar. Inte bevis på avveckling. Byt aldrig utan test.'};
  }).filter(Boolean);
  const comparisons=[];
  for(const s of settings){
    const purpose=AI_PURPOSES.find(p=>p.key===s.purpose && p.provider==='openai');
    if(!purpose||!purpose.capability.startsWith('text'))continue;
    const candidates=catalog.filter(c=>c.provider==='openai' && c.model!==s.model &&
      c.status==='approved' && c.verified_capabilities?.includes(purpose.capability) && live.includes(c.model));
    for(const candidate of candidates.slice(0,8)){
      const value=compareTextPrices(prices,s.model,candidate.model);
      if(value)comparisons.push({purpose:s.purpose,label:purpose.label,currentModel:s.model,candidateModel:candidate.model,...value});
    }
  }
  return Response.json({ok:true,signals:signals.filter(x=>x.consecutive_missing>0),
    recommendations,comparisons:comparisons.slice(0,30),lastRun:runResult.data?.[0]||null,
    pricing:prices,sourceNotes:'USD Standard API list prices. Actual usage, cached tokens, tools, image and video pricing vary. No changes to active models.'});
}
