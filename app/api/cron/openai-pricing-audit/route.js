/** 144.390: passive discovery of account-visible OpenAI models and review-only tariffs. */
import { createClient } from '@supabase/supabase-js';
import { syncOpenAIModelCatalog } from '../../../../lib/openaiCatalogSync.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ok:false,error:'Unauthorized'}, {status:401});
  }
  if (process.env.VERCEL_ENV !== 'production' || process.env.SPREELO_OPENAI_PRICING_ENABLED !== 'true') {
    return Response.json({ok:true,skipped:'openai_pricing_not_enabled_in_production'});
  }
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return Response.json({ok:false,error:'Supabase configuration missing'},{status:503});
  try {
    const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const result=await syncOpenAIModelCatalog({db,apiKey:process.env.OPENAI_API_KEY});
    if(result.status==='failed')return Response.json(result,{status:503});
    return Response.json(result);
  } catch(error) {
    console.error('OpenAI model discovery failed',{message:String(error?.message||error)});
    return Response.json({ok:false,error:'OpenAI model discovery failed; previously approved prices were not altered'},{status:503});
  }
}
