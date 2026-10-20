import { createClient } from "@supabase/supabase-js";
import { getConfiguredAdminEmails } from "./adminAuth.js";

export function monitorAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function loadProviderCapacity(admin) {
  const { data, error } = await admin.rpc("get_provider_capacity_snapshot");
  if (error) throw error;
  return data || [];
}

export function classifyCapacity(row) {
  if (row.window_kind === "concurrent" || row.monitoring_mode !== "instrumented" || row.limit_value == null) return null;
  const use = Number(row.observed_count);
  const limit = Number(row.limit_value);
  if (!Number.isFinite(use) || !Number.isFinite(limit) || limit <= 0) return null;
  // Do not alert against an unknown or unverified account-level limit.
  if (!["confirmed","documented"].includes(row.verification)) return null;
  const ratio = use / limit;
  return [100,95,85,70].find(t => ratio >= t / 100) ?? null;
}

function instructions(row) {
  return String(row.instructions || "Kontrollera leverantörens konto och begär högre kvot vid behov.");
}
export async function notifyProviderCapacity(admin, rows) {
  const recipients = getConfiguredAdminEmails();
  const apiKey = process.env.RESEND_API_KEY;
  const results = [];
  if (!apiKey || recipients.length === 0) return { skipped: "email_unconfigured", results };
  for (const row of rows) {
    let measured = row;
    // A five-minute cron must not miss a one-minute limit spike.
    // Inspect already-observed minute buckets since the last scheduled check;
    // still only one warning per level/provider/day to avoid an email storm.
    if (row.window_kind === "minute" &&
        row.monitoring_mode === "instrumented" &&
        row.limit_value != null &&
        ["confirmed", "documented"].includes(row.verification)) {
      const since = new Date(Date.now() - 7 * 60_000).toISOString();
      const { data: peak, error: peakError } = await admin
        .from("provider_capacity_usage_buckets")
        .select("bucket_start,request_count")
        .eq("provider", row.provider)
        .eq("metric", row.metric)
        .gte("bucket_start", since)
        .order("request_count", { ascending: false })
        .limit(1);
      if (peakError) throw peakError;
      if (peak?.[0]) {
        measured = {
          ...row,
          window_start: peak[0].bucket_start,
          observed_count: Number(peak[0].request_count),
          full_window_observed: new Date(row.coverage_started_at).getTime() <= new Date(peak[0].bucket_start).getTime(),
        };
      }
    }
    const threshold = classifyCapacity(measured);
    if (!threshold) continue;
    const period = row.window_kind === "minute"
      ? new Date().toISOString().slice(0, 10)
      : new Date(row.window_start).toISOString();
    // At most one email/threshold/provider/window, with up to three failed retries.
    const { data: claimed, error: claimError } = await admin.rpc("claim_provider_capacity_alert", {
      p_provider: row.provider, p_metric: row.metric, p_period_key: period,
      p_threshold: threshold, p_value: Number(measured.observed_count), p_limit: Number(row.limit_value),
    });
    if (claimError) throw claimError;
    if (!claimed) continue;
    const subject = `[Spreelo] ${row.provider} · kapacitetsvarning ${threshold}%`;
    const message = [
      `Leverantör: ${row.provider}`,
      `Mätning: ${row.label}`,
      `Observerat: ${measured.observed_count} av ${row.limit_value} ${row.unit}`,
      `Period: ${row.window_kind} (${row.window_kind === "minute" ? measured.window_start : period})`,
      measured.full_window_observed ? "Täckning: hel aktuell period" : "Täckning: delvis sedan mätstart",
      "Notera att användningen mäts via Spreelos API-anrop; leverantörens officiella kvot kan avvika.",
      `Åtgärd: ${instructions(row)}`,
      row.documentation_url ? `Leverantör: ${row.documentation_url}` : "",
      "Admin: https://app.spreelo.com/admin/provider-capacity",
    ].filter(Boolean).join("\n");
    let status = "failed", lastError = null;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || "Spreelo <noreply@spreelo.com>",
          to: recipients, subject, text: message,
        }),
      });
      if (!res.ok) lastError = `Resend HTTP ${res.status}`;
      else status = "sent";
    } catch (error) { lastError = String(error?.message || error).slice(0,300); }
    const { error: updateError } = await admin.from("provider_capacity_alerts")
      .update({ status, sent_at: status === "sent" ? new Date().toISOString() : null, last_error: lastError })
      .eq("id", claimed);
    if (updateError) console.error("Could not mark provider capacity alert", { id: claimed, message: updateError.message });
    results.push({ provider: row.provider, metric: row.metric, threshold, status });
  }
  return { results };
}
