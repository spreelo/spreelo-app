import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function isAuthorized(request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization") || "";
  return authHeader === `Bearer ${cronSecret}`;
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function deleteExpiredRows(supabaseAdmin, tableName, columnName, cutoffIso) {
  const { error, count } = await supabaseAdmin
    .from(tableName)
    .delete({ count: "exact" })
    .lt(columnName, cutoffIso);

  if (error) {
    const message = String(error.message || "");

    if (
      message.toLowerCase().includes("could not find the table") ||
      message.toLowerCase().includes("does not exist") ||
      message.toLowerCase().includes("schema cache")
    ) {
      return { table: tableName, deleted: 0, skipped: true, reason: message };
    }

    throw new Error(`${tableName}: ${message}`);
  }

  return { table: tableName, deleted: count || 0, skipped: false };
}

export async function GET(request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();
    const nowIso = new Date().toISOString();

    const results = [];

    results.push(
      await deleteExpiredRows(supabaseAdmin, "account_deletion_logs", "purge_after", nowIso)
    );

    return NextResponse.json({
      ok: true,
      cleaned_at: nowIso,
      results,
    });
  } catch (error) {
    console.error("Retention cleanup error:", error);

    return NextResponse.json(
      { ok: false, error: error.message || "Could not run retention cleanup." },
      { status: 500 }
    );
  }
}
