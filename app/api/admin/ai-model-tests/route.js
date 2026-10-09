import crypto from 'node:crypto';
import {isPendingKlingVideoCandidate} from '../../../../lib/aiModelControl.js';
import { adminContextError, getAdminContext } from '../../../../lib/adminAuth.js';
import { buildMassTestRule } from '../../../../lib/adminMassTest.js';
import { AI_MODEL_TEST_RECIPES, findActiveAdminUserIds, getAiModelPurpose, modelAllowedForPurposeAsync, modelTestEligible } from '../../../../lib/aiModelTest.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(message, status = 400) { return Response.json({ok:false,error:message}, {status}); }

async function eligibleBrands(db) {
  const admins = await findActiveAdminUserIds(db);
  if (!admins.length) return [];
  const {data,error} = await db.from('brand_profiles')
    .select('id,user_id,business_name,website_url,website_product_source_url,website_product_mode_available,content_language,country_code,content_market,logo_url,logo_enabled_by_default')
    .in('user_id',admins).eq('website_product_mode_available',true).order('business_name',{ascending:true}).limit(500);
  if (error) throw error;
  return (data || []).filter(b => Boolean(b.website_product_source_url || b.website_url));
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    const {data:test,error} = await context.admin.from('ai_model_test_requests')
      .select('*').eq('id',id).eq('created_by',context.user.id).maybeSingle();
    if (error) return jsonError(error.message,500);
    if (!test) return jsonError('Testet hittades inte.',404);
    const {data:post} = await context.admin.from('posts')
      .select('id,status,content,image_url,video_url,video_status,created_at')
      .eq('admin_test_batch_id',test.batch_id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    return Response.json({ok:true,test,post:post || null});
  }
  try {
    const [brands, history] = await Promise.all([
      eligibleBrands(context.admin),
      context.admin.from('ai_model_test_requests').select('id,purpose,model,status,email_state,created_at,brand_profile_id')
        .eq('created_by',context.user.id).order('created_at',{ascending:false}).limit(20),
    ]);
    if (history.error) throw history.error;
    return Response.json({ok:true,brands:brands.map(b=>({id:b.id,ownerId:b.user_id,name:b.business_name,website:b.website_product_source_url || b.website_url})),tests:history.data || []});
  } catch(error) { return jsonError(error.message || String(error),500); }
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);
  const body = await request.json().catch(()=>({}));
  const purpose = getAiModelPurpose(body.purpose);
  const model = String(body.model || '').trim();
  const recipe = AI_MODEL_TEST_RECIPES[purpose?.key];
  if (!recipe) return jsonError('Den här funktionen saknar ett tillförlitligt genereringstest. Byt modell utan test.');
  if (!await modelTestEligible(context.admin,purpose,model)) return jsonError('Modellen är inte verifierad för den funktionen.');
  if (purpose.key === 'kling_video' && (process.env.KLING_API_FAMILY === 'legacy' || (!process.env.KLING_API_KEY && Boolean(process.env.KLING_ACCESS_KEY))))
    return jsonError('Kling är inställt på legacy-API. Modelltestet kräver det aktuella Kling-API:t.');
  const currentResult = await context.admin.from('ai_model_settings').select('model').eq('purpose',purpose.key).maybeSingle();
  if (currentResult.error) return jsonError(currentResult.error.message,500);
  const originalModel = currentResult.data?.model || purpose.fallback;
  if (originalModel === model) return jsonError('Välj en annan modell för att starta ett test.');

  try {
    // Re-check authorization on each POST; never trust a UI-provided owner id.
    const brands = await eligibleBrands(context.admin);
    const brand = brands.find(b=>b.id===String(body.brandProfileId||''));
    if (!brand) return jsonError('Företaget finns inte på ett aktivt adminkonto med godkänd webbutik.',403);
    const batchId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const now = new Date().toISOString();
    const jobKey = `ai-model-test:${requestId}`;
    const rule = buildMassTestRule({userId:brand.user_id,brand,platform:'Facebook + Instagram',contentTypeId:recipe,batchId,jobKey,repeatIndex:1,specialConfig:{},nowIso:now});
    const {error:batchError} = await context.admin.from('admin_test_batches').insert({
      id:batchId, created_by:context.user.id, title:`AI-modelltest · ${purpose.label} · ${brand.business_name}`,
      status:'queued',total_jobs:1,started_at:now,updated_at:now,
      settings:{run_mode:'asap',credit_bypass:true,source:'ai_model_test',ai_model_test_request_id:requestId},
    });
    if (batchError) throw batchError;
    const {error:testError} = await context.admin.from('ai_model_test_requests').insert({
      id:requestId, created_by:context.user.id,brand_owner_id:brand.user_id,brand_profile_id:brand.id,
      batch_id:batchId,purpose:purpose.key,model,original_model:originalModel,content_type_id:recipe,
      status:'queued',email_state:'pending',updated_at:now,
    });
    if (testError) {
      await context.admin.from('admin_test_batches').delete().eq('id',batchId);
      throw testError;
    }
    const {error:ruleError} = await context.admin.from('automation_rules').insert(rule);
    if (ruleError) {
      await context.admin.from('ai_model_test_requests').delete().eq('id',requestId);
      await context.admin.from('admin_test_batches').delete().eq('id',batchId);
      throw ruleError;
    }
    return Response.json({ok:true,id:requestId,batchId,status:'queued'});
  } catch(error) { return jsonError(error.message || String(error),500); }
}

export async function PATCH(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);
  const body = await request.json().catch(()=>({}));
  const action = String(body.action || '');
  if (!['approve','reject','retry_email'].includes(action)) return jsonError('Okänd åtgärd.');
  const {data:test,error} = await context.admin.from('ai_model_test_requests').select('*')
    .eq('id',String(body.id || '')).eq('created_by',context.user.id).maybeSingle();
  if (error) return jsonError(error.message,500);
  if (!test) return jsonError('Testet hittades inte.',404);
  if (action === 'retry_email') {
    if (test.email_state !== 'failed' || !['ready','failed'].includes(test.status)) return jsonError('Mejlet kan inte skickas om just nu.',409);
    const {error:retryError} = await context.admin.from('ai_model_test_requests')
      .update({email_state:'pending',email_attempts:0,email_error:null,updated_at:new Date().toISOString()})
      .eq('id',test.id).eq('email_state','failed');
    if (retryError) return jsonError(retryError.message,500);
    return Response.json({ok:true,email_state:'pending'});
  }
  if (test.status !== 'ready' || test.email_state !== 'sent') return jsonError('Testet måste vara färdigt och mejlet skickat innan du fattar beslut.',409);
  const now = new Date().toISOString();
  if (action === 'reject') {
    const {data, error:rejectError} = await context.admin.from('ai_model_test_requests')
      .update({status:'rejected',reviewed_at:now,reviewed_by:context.user.id,updated_at:now})
      .eq('id',test.id).eq('status','ready').select('id');
    if (rejectError) return jsonError(rejectError.message,500);
    if (!data?.length) return jsonError('Testet har redan hanterats.',409);
    return Response.json({ok:true,status:'rejected'});
  }
  const purpose = getAiModelPurpose(test.purpose);
  if (!await modelTestEligible(context.admin,purpose,test.model)) return jsonError('Modellen är inte längre valbar.',409);
  const {data:current,error:readError} = await context.admin.from('ai_model_settings').select('model').eq('purpose',test.purpose).maybeSingle();
  if (readError) return jsonError(readError.message,500);
  if ((current?.model || purpose.fallback) !== test.original_model)
    return jsonError('Den aktiva modellen har ändrats efter testet. Testa igen innan byte.',409);
  // A successful Kling test + delivered email + explicit admin approval is
  // the only way a discovered pending Kling candidate earns video capability.
  if (await isPendingKlingVideoCandidate(context.admin,purpose,test.model)) {
    const {data:catalogApproved,error:approvalError}=await context.admin.from('ai_model_catalog')
      .update({status:'approved',verified_capabilities:['image_to_video'],
        verified_at:now,verification_notes:'Real Spreelo admin image-to-video test succeeded; result emailed and approved by admin.'})
      .eq('provider','kling').eq('model',test.model).eq('status','pending_review').select('model');
    if (approvalError) return jsonError(approvalError.message,500);
    if (!catalogApproved?.length) return jsonError('Kling-kandidaten ändrades under granskningen. Gör om testet.',409);
  }
  const payload = {purpose:purpose.key,provider:purpose.provider,model:test.model,default_model:purpose.fallback,
    capability:purpose.capability,changed_by:context.user.id,changed_at:now,auto_replaced:false,replacement_reason:null};
  let saveError;
  if (current) {
    const {data:saved,error:e} = await context.admin.from('ai_model_settings').update(payload)
      .eq('purpose',test.purpose).eq('model',test.original_model).select('purpose');
    saveError=e;
    if (!saveError && !saved?.length) return jsonError('Modellen ändrades av en annan administratör. Försök igen.',409);
  } else {
    const {error:e} = await context.admin.from('ai_model_settings').insert(payload);
    saveError=e;
  }
  if (saveError) return jsonError(saveError.message,500);
  await context.admin.from('ai_model_test_requests').update({status:'approved',reviewed_at:now,reviewed_by:context.user.id,updated_at:now})
    .eq('id',test.id).eq('status','ready');
  return Response.json({ok:true,status:'approved',model:test.model});
}
