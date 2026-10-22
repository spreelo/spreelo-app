import { randomUUID } from 'node:crypto';
import { syncOpenAIModelCatalog } from '../../../../lib/openaiCatalogSync.js';
import { getAdminContext, adminContextError } from '../../../../lib/adminAuth.js';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
const RATE_SOURCE='https://developers.openai.com/api/docs/pricing';
function apiError(message,status=400){return Response.json({ok:false,error:message},{status});}

export async function GET(request){
  const ctx=await getAdminContext(request);
  if(ctx.error)return adminContextError(ctx);
  const [versions,audits,reconciliations,models,discoveryRuns]=await Promise.all([
    ctx.admin.from('openai_price_versions').select('id,model,service_tier,pricing_kind,version,input_usd_per_m,cached_input_usd_per_m,output_usd_per_m,image_input_usd_per_m,cached_image_input_usd_per_m,valid_from,valid_until,source_url,source_fingerprint,approved,approved_by,approved_at,created_at').order('created_at',{ascending:false}).limit(100),
    ctx.admin.from('openai_pricing_audit').select('checked_at,status,source_fingerprint,detail').eq('source_url',RATE_SOURCE).order('checked_at',{ascending:false}).limit(10),
    ctx.admin.from('openai_billing_reconciliations').select('day_utc,project_id,actual_usd,recorded_estimate_usd,unpriced_events,delta_usd,status,checked_at').order('day_utc',{ascending:false}).limit(30),
    ctx.admin.from('openai_model_catalog').select('model,first_seen_at,last_seen_at,provider_created_at,owned_by,listed_in_api,listed_on_pricing_page,pricing_status,pricing_note').order('first_seen_at',{ascending:false}).limit(500),
    ctx.admin.from('openai_model_discovery_runs').select('checked_at,status,models_seen,newly_seen,proposed_prices,ambiguous_prices,detail').order('checked_at',{ascending:false}).limit(10),
  ]);
  const error=versions.error||audits.error||reconciliations.error;
  const discoveryError=models.error||discoveryRuns.error;
  if(error){
    if(process.env.SPREELO_OPENAI_PRICING_ENABLED !== 'true') return Response.json({
      ok:true,configured:false,enabled:false,canApprove:false,versions:[],audits:[],reconciliations:[],models:[],discoveryRuns:[],discoveryConfigured:false,
    },{headers:{'Cache-Control':'no-store'}});
    return apiError('OpenAI cost tables missing or unavailable: '+String(error.message||error),503);
  }
  return Response.json({ok:true,configured:true,enabled:process.env.SPREELO_OPENAI_PRICING_ENABLED==='true',canApprove:ctx.isPrimaryAdmin,discoveryConfigured:!discoveryError,versions:versions.data||[],audits:audits.data||[],reconciliations:reconciliations.data||[],models:discoveryError?[]:models.data||[],discoveryRuns:discoveryError?[]:discoveryRuns.data||[]},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request){
  const ctx=await getAdminContext(request);
  if(ctx.error)return adminContextError(ctx);
  if(!ctx.isPrimaryAdmin)return apiError('Only the primary administrator can approve prices.',403);
  let body;
  try{body=await request.json();}catch{return apiError('Invalid JSON');}
  if(body?.action==='sync'){
    if(process.env.SPREELO_OPENAI_PRICING_ENABLED!=='true')return apiError('Model discovery is disabled',409);
    const result=await syncOpenAIModelCatalog({db:ctx.admin,apiKey:process.env.OPENAI_API_KEY});
    return Response.json(result,{status:result.status==='failed'?503:200,headers:{'Cache-Control':'no-store'}});
  }
  if(body?.action==='approve'){
    if(body.confirmOfficialPriceReview!==true)return apiError('Explicit official price review confirmation required');
    const id=Number(body.id);
    if(!Number.isSafeInteger(id)||id<1)return apiError('Invalid price revision ID');
    const {data:row,error:readError}=await ctx.admin.from('openai_price_versions').select('model,source_fingerprint,source_url,approved').eq('id',id).maybeSingle();
    // 144.391 also uses per-model official documentation, never third-party pages.
    const officialDetail = row?.source_url === `https://developers.openai.com/api/docs/models/${row?.model}`;
    if(readError||!row||row.approved||(!officialDetail && row.source_url!==RATE_SOURCE))return apiError('Unapproved official-source revision not found');
    const {data:audit,error:auditError}=await ctx.admin.from('openai_pricing_audit')
      .select('checked_at,source_fingerprint').eq('source_url',RATE_SOURCE).order('checked_at',{ascending:false}).limit(1).maybeSingle();
    if(auditError||!audit?.source_fingerprint||row.source_fingerprint!==audit.source_fingerprint || Date.now()-Date.parse(audit.checked_at)>48*3600_000)return apiError('Pricing audit missing, stale or changed. Run and review it again.');
    const {error}=await ctx.admin.rpc('approve_openai_price_version',{p_id:id,p_approved_by:ctx.user.email});
    if(error)return apiError('Tariff approval failed: '+error.message,409);
    return Response.json({ok:true});
  }
  if(body?.action!=='propose')return apiError('Unknown action');
  if(body.confirmOfficialPriceReview!==true)return apiError('Review published official prices before proposing.');
  const model=String(body.model||'').trim();
  const kind=String(body.pricing_kind||'text');
  const validFrom=String(body.valid_from||'');
  if(!/^[-\w.]{1,120}$/.test(model)||!['text','image'].includes(kind)||!Number.isFinite(Date.parse(validFrom)))return apiError('Invalid model, pricing type or effective time');
  const fields=['input_usd_per_m','cached_input_usd_per_m','output_usd_per_m',...(kind==='image'?['image_input_usd_per_m','cached_image_input_usd_per_m']:[])];
  const numbers=Object.fromEntries(fields.map(k=>[k,body[k]===null||body[k]===''?null:Number(body[k])]));
  if(fields.some(k=>numbers[k]===null||!Number.isFinite(numbers[k])||numbers[k]<0||numbers[k]>100000))return apiError('All tariff components must be valid non-negative USD amounts per million tokens');
  const {data:audit,error:auditError}=await ctx.admin.from('openai_pricing_audit')
    .select('checked_at,source_fingerprint').eq('source_url',RATE_SOURCE).order('checked_at',{ascending:false}).limit(1).maybeSingle();
  if(auditError||!audit?.source_fingerprint || Date.now()-Date.parse(audit.checked_at)>48*3600_000)return apiError('Run a recent (48-hour) OpenAI pricing audit before proposing rates.');
  const version='review-'+new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)+'-'+randomUUID().slice(0,8);
  const {error}=await ctx.admin.from('openai_price_versions').insert({
    model,service_tier:'standard',pricing_kind:kind,version,valid_from:new Date(validFrom).toISOString(),
    ...numbers,source_url:RATE_SOURCE,source_fingerprint:audit.source_fingerprint,approved:false
  });
  if(error)return apiError('Could not save draft: '+error.message,409);
  return Response.json({ok:true,version});
}
