import {adminContextError,getAdminContext} from '../../../../lib/adminAuth';
export const dynamic='force-dynamic';
export async function GET(request){
 const ctx=await getAdminContext(request);if(ctx.error)return adminContextError(ctx);
 const {data,error}=await ctx.admin.from('ai_market_news').select('id,provider,title,url,published_at,discovered_at,severity,category,summary').order('discovered_at',{ascending:false}).limit(80);
 if(error)return Response.json({ok:false,error:error.message},{status:500});
 const {data:runs}=await ctx.admin.from('ai_market_watch_runs').select('*').order('day',{ascending:false}).limit(1);
 return Response.json({ok:true,items:data||[],lastRun:runs?.[0]||null});
}
