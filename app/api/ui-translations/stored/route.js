import {createClient} from '@supabase/supabase-js';
import {DEFAULT_UI_LOCALE,normalizeUiLocale} from '../../../../lib/i18n/defaultLabels.js';
import {readStoredUiTranslations} from '../../../../lib/i18n/storedUiTranslations.js';
export const dynamic='force-dynamic';
export const maxDuration=15;
export async function GET(request){
 const locale=normalizeUiLocale(new URL(request.url).searchParams.get('locale'));
 try{
  let labels={};
  if(locale!==DEFAULT_UI_LOCALE){
   const supabaseAdmin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(6000)})}});
   labels=await readStoredUiTranslations({supabaseAdmin,locale});
  }
  return Response.json({locale,labels},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Stored UI translations unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
