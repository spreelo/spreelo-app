import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";
import { calculateUptimePercentage, runSystemHealthChecks, isDatabaseConnectivityFailure } from "../../../../lib/systemHealth.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);
  try {
    const live = await runSystemHealthChecks({ admin: context.admin, persist: true });
    const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let incidents = [];
    let migrationRequired = live.migrationRequired;
    const { data, error } = await context.admin
      .from("system_health_incidents")
      .select("id,system_key,label,started_at,resolved_at,duration_seconds,opening_status,latest_status,message,details")
      .or(`resolved_at.is.null,resolved_at.gte.${periodStart}`)
      .order("started_at", { ascending: false })
      .limit(250);
    if (error) {
      if (/does not exist|schema cache|could not find/i.test(String(error.message || ""))) migrationRequired = true;
      else throw error;
    } else {
      incidents = data || [];
    }

    // Existing runtime incidents retain failures even if the five-minute probe
    // missed them. A point observation has no invented outage duration.
    const runtime=await context.admin.from('admin_runtime_incidents')
      .select('id,message,failure_code,first_seen_at,last_seen_at,event_count')
      .gte('last_seen_at',periodStart).order('last_seen_at',{ascending:false}).limit(100);
    const observedErrors=(runtime.data||[]).filter(item=>isDatabaseConnectivityFailure({message:item.message}))
      .map(item=>({id:`runtime:${item.id}`,system_key:'supabase_database',label:'Supabase · Database',started_at:item.last_seen_at,
        resolved_at:null,observation:true,message:item.message,event_count:item.event_count}));
    const bySystem = new Map();
    for (const incident of incidents) {
      if (!bySystem.has(incident.system_key)) bySystem.set(incident.system_key, []);
      bySystem.get(incident.system_key).push(incident);
    }
    const systems = live.checks.map((item) => ({
      ...item,
      uptime30d: item.measurement?.uptime ?? null,
      recordedIncidentUptime30d: calculateUptimePercentage(bySystem.get(item.key) || [], periodStart),
      incidents30d: (bySystem.get(item.key) || []).length,
    }));

    return Response.json({
      ok: true,
      checkedAt: live.checkedAt,
      migrationRequired,
      systems,
      incidents: [...incidents,...observedErrors].sort((a,b)=>new Date(b.started_at)-new Date(a.started_at)).slice(0,30),
      summary: {
        up: systems.filter((item) => item.status === "up").length,
        degraded: systems.filter((item) => item.status === "degraded").length,
        down: systems.filter((item) => item.status === "down").length,
        unconfigured: systems.filter((item) => item.status === "unconfigured").length,
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load system health." }, { status: 500 });
  }
}
