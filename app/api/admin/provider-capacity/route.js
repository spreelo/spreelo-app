import { adminContextError, getAdminContext } from "../../../../lib/adminAuth.js";
import { loadProviderCapacity } from "../../../../lib/providerCapacityMonitor.js";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);
  try {
    const rows = await loadProviderCapacity(context.admin);
    // A separate snapshot, never represented as supplier-reported official usage.
    let klingQueue = null;
    if(process.env.SPREELO_KLING_CAPACITY_QUEUE_ENABLED==="true"){
      const {data,error}=await context.admin.rpc("kling_capacity_queue_snapshot");
      if(!error && data?.[0])klingQueue=data[0];
    }
    const [reportedResult, sourcesResult] = await Promise.all([
      context.admin.from("provider_capacity_reported_snapshots").select("provider,metric,scope,label,window_kind,unit,observed_count,limit_value,checked_at,reset_at,source,instructions,documentation_url").order("provider",{ascending:true}),
      context.admin.from("provider_capacity_source_status").select("provider,state,checked_at,last_success_at,message").order("provider",{ascending:true}),
    ]);
    const optionalMissing = (error) => /provider_capacity_reported_snapshots|provider_capacity_source_status|schema cache|does not exist|could not find/i.test(String(error?.message || ""));
    if (reportedResult.error && !optionalMissing(reportedResult.error)) throw reportedResult.error;
    if (sourcesResult.error && !optionalMissing(sourcesResult.error)) throw sourcesResult.error;
    return Response.json({ ok: true, rows, klingQueue, reported: reportedResult.data || [], sources: sourcesResult.data || [], reportedMigrationRequired: Boolean(reportedResult.error || sourcesResult.error), canEdit: Boolean(context.isPrimaryAdmin), updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error), migrationRequired: true }, { status: 503 });
  }
}

export async function PATCH(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);
  if (!context.isPrimaryAdmin) return Response.json({ ok: false, error: "Endast huvudadministratören kan ändra leverantörsgränser." }, { status: 403 });
  let input;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: "Ogiltig JSON." }, { status: 400 }); }
  const provider = String(input?.provider || "").trim();
  const metric = String(input?.metric || "").trim();
  const rawLimit = input?.limit_value;
  const limit = rawLimit === null || rawLimit === "" ? null : Number(rawLimit);
  const verification = String(input?.verification || "");
  if (!/^[a-z_]{2,48}$/.test(provider) || !/^[a-z_]{2,64}$/.test(metric) ||
      (limit !== null && (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1000000000)) ||
      !["unknown", "provisional", "confirmed"].includes(verification) ||
      (verification === "confirmed" && limit === null)) {
    return Response.json({ ok: false, error: "Ogiltig gräns eller verifieringsstatus." }, { status: 400 });
  }
  const { data, error } = await context.admin.from("provider_capacity_limits")
    .update({ limit_value: limit, verification, updated_at: new Date().toISOString() })
    .eq("provider", provider).eq("metric", metric)
    .select("provider,metric,limit_value,verification").maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return Response.json({ ok: false, error: "Mätvärdet finns inte." }, { status: 404 });
  return Response.json({ ok: true, limit: data });
}
