const DEFAULT_TIMEOUT_MS = 6000;

function nowIso() {
  return new Date().toISOString();
}

function normalizeError(error) {
  if (error?.name === "AbortError") return "Timed out";
  return String(error?.message || error || "Unknown error").slice(0, 500);
}

async function timedFetch(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    return { response, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

function result(key, label, status, latencyMs = null, message = "", details = {}) {
  return {
    key,
    label,
    status,
    latencyMs: Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : null,
    message: String(message || "").slice(0, 500),
    details,
    checkedAt: nowIso(),
  };
}

async function checkSupabaseDatabase(admin) {
  const started = Date.now();
  try {
    const { error } = await admin.from("brand_profiles").select("id", { head: true, count: "estimated" }).limit(1);
    if (error) throw error;
    return result("supabase_database", "Supabase · Database", "up", Date.now() - started, "The database is responding normally.");
  } catch (error) {
    return result("supabase_database", "Supabase · Database", "down", Date.now() - started, normalizeError(error));
  }
}

async function checkSupabaseStorage(admin) {
  const started = Date.now();
  try {
    const { error } = await admin.storage.from("post-images").list("", { limit: 1 });
    if (error) throw error;
    return result("supabase_storage", "Supabase · Storage", "up", Date.now() - started, "File storage is responding normally.");
  } catch (error) {
    return result("supabase_storage", "Supabase · Storage", "down", Date.now() - started, normalizeError(error));
  }
}

async function checkAutomationWorkers(admin) {
  const started = Date.now();
  try {
    const { data, error } = await admin
      .from("automation_worker_leases")
      .select("lane_name,updated_at,expires_at")
      .order("updated_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) return result("smart_queue_workers", "Smart Queue · Workers", "degraded", Date.now() - started, "No worker heartbeats have been recorded yet.");
    const latestMs = Math.max(...rows.map((row) => new Date(row.updated_at || 0).getTime()).filter(Number.isFinite));
    const ageMs = Date.now() - latestMs;
    const status = ageMs <= 4 * 60 * 1000 ? "up" : ageMs <= 10 * 60 * 1000 ? "degraded" : "down";
    const laneCount = new Set(rows.map((row) => row.lane_name).filter(Boolean)).size;
    return result("smart_queue_workers", "Smart Queue · Workers", status, Date.now() - started, status === "up" ? `${laneCount} worker lanes are reporting normally.` : `The latest worker heartbeat is ${Math.round(ageMs / 60000)} minutes old.`, { laneCount, latestHeartbeat: new Date(latestMs).toISOString() });
  } catch (error) {
    const message = normalizeError(error);
    const status = /does not exist|schema cache|could not find/i.test(message) ? "unconfigured" : "down";
    return result("smart_queue_workers", "Smart Queue · Workers", status, Date.now() - started, message);
  }
}

async function checkOpenAI() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) return result("openai", "OpenAI", "unconfigured", null, "OPENAI_API_KEY is missing.");
  try {
    const { response, latencyMs } = await timedFetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (response.ok) return result("openai", "OpenAI", "up", latencyMs, "API and authentication are responding normally.");
    const body = await response.text().catch(() => "");
    return result("openai", "OpenAI", response.status >= 500 ? "down" : "degraded", latencyMs, `HTTP ${response.status}${body ? ` · ${body.slice(0, 160)}` : ""}`);
  } catch (error) {
    return result("openai", "OpenAI", "down", null, normalizeError(error));
  }
}

async function checkResend() {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  if (!key) return result("resend", "Resend · Email", "unconfigured", null, "RESEND_API_KEY is missing.");
  try {
    const { response, latencyMs } = await timedFetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (response.ok) return result("resend", "Resend · Email", "up", latencyMs, "API and authentication are responding normally.");
    return result("resend", "Resend · Email", response.status >= 500 ? "down" : "degraded", latencyMs, `HTTP ${response.status}`);
  } catch (error) {
    return result("resend", "Resend · Email", "down", null, normalizeError(error));
  }
}

async function checkStripe() {
  const key = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) return result("stripe", "Stripe · Payments", "unconfigured", null, "STRIPE_SECRET_KEY is missing.");
  try {
    const auth = Buffer.from(`${key}:`).toString("base64");
    const { response, latencyMs } = await timedFetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (response.ok) return result("stripe", "Stripe · Payments", "up", latencyMs, "API and authentication are responding normally.");
    return result("stripe", "Stripe · Payments", response.status >= 500 ? "down" : "degraded", latencyMs, `HTTP ${response.status}`);
  } catch (error) {
    return result("stripe", "Stripe · Payments", "down", null, normalizeError(error));
  }
}

async function checkMeta() {
  const appId = String(process.env.META_APP_ID || "").trim();
  const appSecret = String(process.env.META_APP_SECRET || "").trim();
  if (!appId || !appSecret) return result("meta", "Meta Graph · Facebook/Instagram", "unconfigured", null, "Meta app credentials are missing.");
  const version = String(process.env.FACEBOOK_GRAPH_API_VERSION || "v24.0").replace(/^\/+/, "");
  const url = `https://graph.facebook.com/${version}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&grant_type=client_credentials`;
  try {
    const { response, latencyMs } = await timedFetch(url);
    if (response.ok) return result("meta", "Meta Graph · Facebook/Instagram", "up", latencyMs, "Graph API and app authentication are responding normally.");
    return result("meta", "Meta Graph · Facebook/Instagram", response.status >= 500 ? "down" : "degraded", latencyMs, `HTTP ${response.status}`);
  } catch (error) {
    return result("meta", "Meta Graph · Facebook/Instagram", "down", null, normalizeError(error));
  }
}

async function checkReachability({ key, label, url, configured = true }) {
  if (!configured) return result(key, label, "unconfigured", null, "The service is not configured.");
  try {
    const { response, latencyMs } = await timedFetch(url, { method: "GET" });
    const status = response.status >= 500 ? "down" : "up";
    return result(key, label, status, latencyMs, status === "up" ? `API endpoint reachable (HTTP ${response.status}).` : `HTTP ${response.status}`);
  } catch (error) {
    return result(key, label, "down", null, normalizeError(error));
  }
}

async function checkKling() {
  const configured = Boolean(String(process.env.KLING_API_KEY || process.env.KLING_ACCESS_KEY || "").trim());
  const raw = String(process.env.KLING_API_BASE_URL || "https://api-singapore.klingai.com").trim();
  let url = raw;
  try { url = new URL(raw).origin; } catch {}
  return checkReachability({ key: "kling", label: "Kling · AI video", url, configured });
}

async function checkShotstack() {
  const configured = Boolean(String(process.env.SHOTSTACK_API_KEY || "").trim());
  return checkReachability({ key: "shotstack", label: "Shotstack · Video rendering", url: "https://api.shotstack.io", configured });
}

async function persistStatus(admin, check) {
  const { data: previous, error: previousError } = await admin
    .from("system_health_status")
    .select("system_key,status,last_ok_at,last_failure_at,consecutive_failures")
    .eq("system_key", check.key)
    .maybeSingle();
  if (previousError && /does not exist|schema cache|could not find/i.test(String(previousError.message || ""))) {
    return { persisted: false, migrationRequired: true };
  }
  if (previousError) throw previousError;

  const bad = ["down", "degraded"].includes(check.status);
  const wasBad = previous && ["down", "degraded"].includes(previous.status);
  const nextConsecutiveFailures = bad ? Number(previous?.consecutive_failures || 0) + 1 : 0;
  const firstFailureAt = bad
    ? (Number(previous?.consecutive_failures || 0) > 0 ? previous?.last_failure_at : check.checkedAt)
    : previous?.last_failure_at || null;
  const payload = {
    system_key: check.key,
    label: check.label,
    status: check.status,
    latency_ms: check.latencyMs,
    message: check.message || null,
    details: check.details || {},
    checked_at: check.checkedAt,
    last_ok_at: check.status === "up" ? check.checkedAt : previous?.last_ok_at || null,
    last_failure_at: bad ? firstFailureAt : previous?.last_failure_at || null,
    consecutive_failures: nextConsecutiveFailures,
  };
  const { error: upsertError } = await admin.from("system_health_status").upsert(payload, { onConflict: "system_key" });
  if (upsertError) throw upsertError;

  // Avoid turning a single transient timeout into an outage in the history.
  // Current status changes immediately, but an incident is recorded after two
  // consecutive failed/degraded checks (normally ~5 minutes apart).
  if (bad && nextConsecutiveFailures >= 2) {
    const { data: openIncident } = await admin.from("system_health_incidents")
      .select("id,started_at")
      .eq("system_key", check.key)
      .is("resolved_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openIncident?.id) {
      await admin.from("system_health_incidents")
        .update({ latest_status: check.status, message: check.message || null, details: check.details || {}, updated_at: check.checkedAt })
        .eq("id", openIncident.id);
    } else {
      await admin.from("system_health_incidents").insert({
        system_key: check.key,
        label: check.label,
        started_at: firstFailureAt || check.checkedAt,
        opening_status: previous?.status && ["down", "degraded"].includes(previous.status) ? previous.status : check.status,
        latest_status: check.status,
        message: check.message || null,
        details: check.details || {},
        updated_at: check.checkedAt,
      });
    }
  } else if (!bad && wasBad) {
    const { data: openIncident } = await admin.from("system_health_incidents")
      .select("id,started_at")
      .eq("system_key", check.key)
      .is("resolved_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openIncident?.id) {
      const durationSeconds = Math.max(0, Math.round((new Date(check.checkedAt).getTime() - new Date(openIncident.started_at).getTime()) / 1000));
      await admin.from("system_health_incidents")
        .update({ resolved_at: check.checkedAt, duration_seconds: durationSeconds, latest_status: check.status, updated_at: check.checkedAt })
        .eq("id", openIncident.id);
    }
  }
  return { persisted: true, migrationRequired: false };
}

export async function runSystemHealthChecks({ admin, persist = true } = {}) {
  const checks = await Promise.all([
    checkSupabaseDatabase(admin),
    checkSupabaseStorage(admin),
    checkAutomationWorkers(admin),
    checkOpenAI(),
    checkResend(),
    checkStripe(),
    checkMeta(),
    checkKling(),
    checkShotstack(),
  ]);
  checks.unshift(result("vercel_cron", "Vercel · App & Cron-monitor", "up", null, "Spreelo health monitor is running."));

  let migrationRequired = false;
  if (persist && admin) {
    for (const check of checks) {
      try {
        const saved = await persistStatus(admin, check);
        migrationRequired ||= Boolean(saved?.migrationRequired);
      } catch (error) {
        console.warn("System health status could not persist", { system: check.key, message: normalizeError(error) });
      }
    }
  }
  return { checks, migrationRequired, checkedAt: nowIso() };
}

export function calculateUptimePercentage(incidents = [], periodStart, now = new Date()) {
  const startMs = new Date(periodStart).getTime();
  const endMs = now.getTime();
  const total = Math.max(1, endMs - startMs);
  let downtime = 0;
  for (const incident of incidents || []) {
    const incidentStart = Math.max(startMs, new Date(incident.started_at).getTime());
    const incidentEnd = Math.min(endMs, incident.resolved_at ? new Date(incident.resolved_at).getTime() : endMs);
    if (Number.isFinite(incidentStart) && Number.isFinite(incidentEnd) && incidentEnd > incidentStart) downtime += incidentEnd - incidentStart;
  }
  return Math.max(0, Math.min(100, ((total - downtime) / total) * 100));
}
