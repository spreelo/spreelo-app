import { getConfiguredAdminEmails } from "./adminAuth.js";

const FROM = process.env.RESEND_FROM_EMAIL || "Spreelo <noreply@spreelo.com>";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function thresholdReached(count, limit) {
  if (!Number.isFinite(limit) || limit <= 0) return false;
  return count >= Math.ceil(limit * 0.75);
}

function isMonthlyUsageUnusuallyEarly(localDay, count, limit) {
  if (!thresholdReached(count, limit)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(localDay || ""));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!Number.isFinite(daysInMonth) || daysInMonth <= 0) return false;
  const usageShare = Number(count) / Number(limit);
  const monthProgress = day / daysInMonth;
  return usageShare >= 0.75 && usageShare - monthProgress >= 0.15;
}

async function claimAlert(admin, { userId, alertKey, periodKey, plan, count, limit, brandProfileId }) {
  const { error } = await admin.from("brand_analysis_usage_alerts").insert({
    user_id: userId,
    alert_key: alertKey,
    period_key: periodKey,
    plan_key: plan || "free",
    usage_count: count,
    usage_limit: limit,
    brand_profile_id: brandProfileId || null,
  });
  if (!error) return true;
  if (String(error.code || "") === "23505") return false;
  throw error;
}

async function sendAlertEmail({ admin, userId, brandProfileId, plan, count, limit, alertKey }) {
  if (!process.env.RESEND_API_KEY) return;
  const recipients = getConfiguredAdminEmails();
  if (!recipients.length) return;

  const [{ data: userData }, { data: brand }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    brandProfileId
      ? admin.from("brand_profiles").select("business_name, website_url").eq("id", brandProfileId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const customerEmail = userData?.user?.email || userId;
  const brandName = brand?.business_name || "Unknown brand";
  const website = brand?.website_url || "—";
  const typeLabel = alertKey === "monthly_limit"
    ? "Monthly analysis limit reached"
    : alertKey === "daily_limit"
      ? "Daily analysis limit reached"
      : alertKey === "brand_reanalysis_burst"
        ? "Repeated brand analyses detected"
        : alertKey === "repeated_limit_hits"
          ? "Repeated attempts after analysis limit reached"
          : "High monthly analysis usage";
  const subject = `SPREELO · ANALYSIS USAGE · ${brandName}`;
  const text = [
    typeLabel,
    `Customer: ${customerEmail}`,
    `Brand: ${brandName}`,
    `Website: ${website}`,
    `Plan: ${String(plan || "free").toUpperCase()}`,
    `Usage: ${count} / ${limit}`,
  ].join("\n");

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: recipients,
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;background:#f5f6f8;padding:28px"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e6e8ed;border-radius:18px;padding:26px"><strong style="color:#17253b">SPREELO · ANALYSIS USAGE</strong><h2 style="color:#17253b">${escapeHtml(typeLabel)}</h2><p><b>Customer:</b> ${escapeHtml(customerEmail)}</p><p><b>Brand:</b> ${escapeHtml(brandName)}</p><p><b>Website:</b> ${escapeHtml(website)}</p><p><b>Plan:</b> ${escapeHtml(String(plan || "free").toUpperCase())}</p><p><b>Usage:</b> ${escapeHtml(count)} / ${escapeHtml(limit)}</p></div></div>`,
    }),
  }).catch(() => null);
}

export async function maybeSendAnalysisUsageAlerts(admin, {
  userId,
  brandProfileId,
  usage,
}) {
  if (!admin || !userId || !usage || usage.admin) return;
  const plan = String(usage.plan || "free").toLowerCase();
  const dailyCount = Number(usage.dailyCount || 0);
  const dailyLimit = Number(usage.dailyLimit || 0);
  const monthlyCount = Number(usage.monthlyCount || 0);
  const monthlyLimit = Number(usage.monthlyLimit || 0);
  const blockedCount = Number(usage.blockedCount || 0);
  const blockedReason = String(usage.reason || "").trim();
  const now = new Date();
  const timezone = String(usage.timezone || "UTC").trim() || "UTC";
  let localDay = now.toISOString().slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (values.year && values.month && values.day) localDay = `${values.year}-${values.month}-${values.day}`;
  } catch {}
  const monthKey = localDay.slice(0, 7);
  const dayKey = localDay;

  let recentBrandCount = 0;
  if (brandProfileId) {
    try {
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await admin
        .from("brand_analysis_usage_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("brand_profile_id", brandProfileId)
        .gte("occurred_at", since);
      if (!error) recentBrandCount = Number(count || 0);
    } catch {}
  }

  // One usage email per accepted analysis at most. Prefer the most important
  // threshold so hitting daily + monthly limits together never floods Admin.
  let candidate = null;
  if (usage.allowed === false && ["daily_limit", "monthly_limit"].includes(blockedReason) && blockedCount >= 3) {
    candidate = {
      alertKey: "repeated_limit_hits",
      periodKey: `${blockedReason}:${dayKey}`,
      count: blockedCount,
      limit: 3,
    };
  } else if (monthlyLimit > 0 && monthlyCount >= monthlyLimit) {
    candidate = { alertKey: "monthly_limit", periodKey: monthKey, count: monthlyCount, limit: monthlyLimit };
  } else if (dailyLimit > 0 && dailyCount >= dailyLimit) {
    candidate = { alertKey: "daily_limit", periodKey: dayKey, count: dailyCount, limit: dailyLimit };
  } else if (recentBrandCount >= 3 && brandProfileId) {
    candidate = {
      alertKey: "brand_reanalysis_burst",
      periodKey: `${brandProfileId}:${dayKey}`,
      count: recentBrandCount,
      limit: 3,
    };
  } else if (isMonthlyUsageUnusuallyEarly(localDay, monthlyCount, monthlyLimit)) {
    candidate = { alertKey: "monthly_75", periodKey: monthKey, count: monthlyCount, limit: monthlyLimit };
  }

  if (!candidate) return;
  try {
    const claimed = await claimAlert(admin, { userId, brandProfileId, plan, ...candidate });
    if (claimed) await sendAlertEmail({ admin, userId, brandProfileId, plan, ...candidate });
  } catch (error) {
    console.warn("Analysis usage alert failed", { userId, alertKey: candidate.alertKey, message: error?.message });
  }
}
