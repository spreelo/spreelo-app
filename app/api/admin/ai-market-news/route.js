import {adminContextError,getAdminContext} from '../../../../lib/adminAuth';
export const dynamic='force-dynamic';
const PAGE_SIZE=10;
export async function GET(request){
 const ctx=await getAdminContext(request);if(ctx.error)return adminContextError(ctx);
 const requested=Number(new URL(request.url).searchParams.get('page')||1);
 const page=Number.isSafeInteger(requested)?Math.max(1,Math.min(100,requested)):1;
 // Older v324-v331 SDK noise stays in the DB for audit history, but is never
 // returned to the curated Spreelo news view.
 const {data,error,count}=await ctx.admin.from('ai_market_news')
   .select('id,provider,title,url,published_at,discovered_at,severity,category,summary',{count:'exact'})
   .in('provider',['OpenAI','Kling'])
   .in('category',['model_release','deprecation','pricing','api_reliability'])
   .order('discovered_at',{ascending:false})
   .range((page-1)*PAGE_SIZE,page*PAGE_SIZE-1);
 if(error)return Response.json({ok:false,error:error.message},{status:500});
 const {data:runs}=await ctx.admin.from('ai_market_watch_runs').select('*').order('day',{ascending:false}).limit(1);
 const total=Number(count||0);
 return Response.json({ok:true,items:data||[],lastRun:runs?.[0]||null,page,pageSize:PAGE_SIZE,total,totalPages:Math.max(1,Math.ceil(total/PAGE_SIZE))});
}
