import {blockDisabledAiBackgroundJob} from '../../../../lib/aiAutomationSwitch.js';
import {createClient} from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const RECIPIENT = 'contact@spreelo.com';
const APP_URL = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.spreelo.com').replace(/\/$/,'');
const esc = (value) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const isValidUrl = value => typeof value === 'string' && /^https:\/\/[^\s]+$/i.test(value);

async function inspectTest(db,test) {
  const {data:post,error:postError} = await db.from('posts')
    .select('id,status,content,image_url,video_url,video_status,image_status,content_format,video_error,created_at')
    .eq('admin_test_batch_id',test.batch_id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if (postError) throw postError;
  if (test.status === 'failed' && test.email_error) return {done:true,failed:true,post,error:test.email_error};
  const isVideo = ['ai_product_video','animated_website_item'].includes(test.content_type_id);
  if (post) {
    if (post.status === 'failed' || post.video_status === 'failed')
      return {done:true,failed:true,post,error:post.video_error || 'Genereringen misslyckades'};
    if (isVideo) {
      if (post.video_status === 'ready' && isValidUrl(post.video_url)) return {done:true,failed:false,post};
    } else if (post.status === 'pending_approval' || post.status === 'approved') {
      if (isValidUrl(post.image_url)) return {done:true,failed:false,post};
      if (test.content_type_id === 'carousel_website_item') {
        const {data:slides} = await db.from('post_slides').select('image_url')
          .eq('post_id',post.id).limit(1);
        if (slides?.some(s=>isValidUrl(s.image_url))) return {done:true,failed:false,post};
      }
    }
  }
  const {data:occurrences,error:occError} = await db.from('automation_occurrences')
    .select('status,failure_message_internal').eq('admin_test_batch_id',test.batch_id)
    .order('started_at',{ascending:false}).limit(1);
  if (occError) throw occError;
  if (occurrences?.[0]?.status === 'failed_terminal')
    return {done:true,failed:true,post,error:occurrences[0].failure_message_internal || 'Genereringen misslyckades'};
  if (Date.now() - new Date(test.created_at).getTime() > 4*60*60*1000)
    return {done:true,failed:true,post,error:'Testet slutfördes inte inom fyra timmar. Kontrollera admin-loggarna.'};
  return {done:false,post};
}

async function sendResult(db,test,result) {
  const {data:brand} = await db.from('brand_profiles').select('business_name,website_url')
    .eq('id',test.brand_profile_id).maybeSingle();
  const {data:slides} = result.post?.id ? await db.from('post_slides')
    .select('slide_order,image_url,headline').eq('post_id',result.post.id).order('slide_order') : {data:[]};
  const {data:cost} = result.post?.id ? await db.from('post_generation_cost_summaries')
    .select('amount,currency').eq('post_id',result.post.id).maybeSingle() : {data:null};
  const link = `${APP_URL}/admin/ai-control?testId=${encodeURIComponent(test.id)}`;
  const viewResult = `${APP_URL}/admin/post-approvals?view=queue&testBatch=${encodeURIComponent(test.batch_id)}`;
  const title = result.failed ? 'Misslyckat AI-modelltest' : 'Klart AI-modelltest';
  const content = String(result.post?.content || '').slice(0,12000);
  const text = [title,`Företag: ${brand?.business_name || 'Okänt'}`,`Funktion: ${test.purpose}`,
    `Testmodell: ${test.model}`,`Nuvarande modell: ${test.original_model}`,
    `Resultat: ${result.failed ? 'Misslyckades' : 'Färdigt'}`,
    result.error ? `Fel: ${result.error}` : '',
    cost?.amount != null ? `AI-kostnad: ${cost.amount} ${cost.currency || 'SEK'}` : '',
    content ? `Inläggstext:\n${content}` : '',
    result.post?.image_url ? `Bild: ${result.post.image_url}` : '',
    result.post?.video_url ? `Video: ${result.post.video_url}` : '',
    ...(slides||[]).map(s=>`Karusell ${s.slide_order}: ${s.image_url || ''}`),
    `Granska / godkänn modellbyte: ${link}`,`Öppna genererat inlägg: ${viewResult}`].filter(Boolean).join('\n\n');
  const mediaHtml = [
    isValidUrl(result.post?.image_url) ? `<p><img src="${esc(result.post.image_url)}" style="width:100%;max-width:520px;border-radius:12px" alt="Testbild" /></p>` : '',
    isValidUrl(result.post?.video_url) ? `<p><a href="${esc(result.post.video_url)}">Visa färdig video</a></p>` : '',
    ...(slides || []).filter(s=>isValidUrl(s.image_url)).map(s=>`<p><strong>Bild ${Number(s.slide_order)||''}</strong><br/><img src="${esc(s.image_url)}" style="width:100%;max-width:520px;border-radius:12px" alt="Karusellbild" /></p>`),
  ].join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#1e293b"><p style="font-size:12px;color:#6757c9;font-weight:bold;letter-spacing:.12em">SPREELO · AI CONTROL CENTER</p><h1>${esc(title)}</h1><p><strong>Företag:</strong> ${esc(brand?.business_name || 'Okänt')}<br/><strong>Funktion:</strong> ${esc(test.purpose)}<br/><strong>Testmodell:</strong> ${esc(test.model)}<br/><strong>Nuvarande modell:</strong> ${esc(test.original_model)}</p>${result.error?`<p style="color:#b91c1c">${esc(result.error)}</p>`:''}${cost?.amount!=null?`<p>AI-kostnad: ${esc(cost.amount)} ${esc(cost.currency||'SEK')}</p>`:''}<p style="white-space:pre-wrap;line-height:1.6">${esc(content)}</p>${mediaHtml}<p style="margin-top:24px"><a href="${esc(link)}" style="background:#4f46e5;color:white;padding:13px 18px;border-radius:10px;text-decoration:none">Granska och välj modell</a></p><p><a href="${esc(viewResult)}">Se hela körningen i admin</a></p><p style="font-size:12px;color:#64748b">Inget modellbyte har gjorts. Detta är ett admin-test.</p></div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method:'POST', signal:AbortSignal.timeout(25_000),
    headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type':'application/json',
      'Idempotency-Key':`ai-model-test/${test.id}`},
    body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL || 'Spreelo <noreply@spreelo.com>',
      to:RECIPIENT, subject:`Spreelo · ${title} · ${test.model}`, text, html}),
  });
  if (!r.ok) throw new Error(`Mejlleverans misslyckades (${r.status}): ${(await r.text()).slice(0,400)}`);
  return await r.json();
}

export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return Response.json({ok:false,error:'Unauthorized'},{status:401});
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,
    {auth:{persistSession:false,autoRefreshToken:false}});
  const blocked = await blockDisabledAiBackgroundJob(db);
  if (blocked) return blocked;
  if (!process.env.RESEND_API_KEY) return Response.json({ok:false,error:'RESEND_API_KEY saknas'},{status:503});
  const {data:pending,error} = await db.from('ai_model_test_requests').select('*')
    .in('status',['queued','running','ready','failed']).in('email_state',['pending','sending'])
    .order('created_at',{ascending:true}).limit(10);
  if (error) return Response.json({ok:false,error:error.message},{status:500});
  let sent=0,waiting=0,failed=0;
  for(const test of pending||[]) {
    try {
      // A previous worker may have crashed after claiming the email.
      if(test.email_state==='sending' && Date.now()-new Date(test.updated_at).getTime()<20*60*1000) {waiting++;continue;}
      const result=await inspectTest(db,test);
      if(!result.done) {waiting++;continue;}
      const now = new Date().toISOString();
      const {data:claim,error:claimError}=await db.from('ai_model_test_requests')
        .update({email_state:'sending',status:result.failed?'failed':'ready',updated_at:now,
          email_attempts:Number(test.email_attempts||0)+1,email_error:result.error||null,
          notified_post_id:result.post?.id||null})
        .eq('id',test.id).eq('email_state',test.email_state).eq('updated_at',test.updated_at).select('id');
      if (claimError || !claim?.length) {waiting++;continue;}
      try {
        const provider=await sendResult(db,test,result);
        await db.from('ai_model_test_requests').update({email_state:'sent',email_provider_id:provider.id||null,
          email_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',test.id).eq('email_state','sending');
        sent++;
      } catch(e) {
        failed++;
        await db.from('ai_model_test_requests').update({email_state:Number(test.email_attempts||0)>=4?'failed':'pending',
          email_error:String(e.message||e).slice(0,1000),updated_at:new Date().toISOString()})
          .eq('id',test.id).eq('email_state','sending');
      }
    } catch(e) { failed++; console.warn('AI model test result check error:',e.message||e); }
  }
  return Response.json({ok:true,checked:(pending||[]).length,sent,waiting,failed});
}
