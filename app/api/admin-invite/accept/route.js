import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getBearerToken, normalizeAdminEmail } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

function hashInviteToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function inviteRpcErrorCode(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("revoked")) return "ADMIN_INVITE_REVOKED";
  if (normalized.includes("already been used")) return "ADMIN_INVITE_USED";
  if (normalized.includes("expired")) return "ADMIN_INVITE_EXPIRED";
  if (normalized.includes("exact email") || normalized.includes("does not match")) return "ADMIN_INVITE_EMAIL_MISMATCH";
  return "ADMIN_INVITE_INVALID";
}

export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bearer = getBearerToken(request);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return Response.json({ ok: false, code: "ADMIN_INVITE_SERVER_CONFIG", error: "Server configuration is incomplete." }, { status: 500 });
  if (!bearer) return Response.json({ ok: false, code: "ADMIN_INVITE_LOGIN_REQUIRED", error: "You must be logged in to accept this invitation." }, { status: 401 });

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(bearer);
  if (authError || !user) return Response.json({ ok: false, code: "ADMIN_INVITE_INVALID_SESSION", error: "Your login session is not valid." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const token = String(body?.token || "").trim();
  if (!token || token.length < 32) return Response.json({ ok: false, code: "ADMIN_INVITE_INVALID", error: "The invitation link is invalid." }, { status: 400 });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const tokenHash = hashInviteToken(token);
  const { data, error } = await admin.rpc("spreelo_accept_admin_invite", {
    p_token_hash: tokenHash,
    p_user_id: user.id,
    p_email: normalizeAdminEmail(user.email),
  });
  if (error) return Response.json({ ok: false, code: inviteRpcErrorCode(error.message), error: "The invitation could not be accepted." }, { status: 400 });

  const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata || {}), spreelo_admin: true },
  });
  if (metadataError) {
    const nowIso = new Date().toISOString();
    await admin.from("spreelo_admin_team_members").update({ status: "revoked", revoked_at: nowIso, updated_at: nowIso }).eq("email", normalizeAdminEmail(user.email));
    await admin.from("spreelo_admin_team_invites").update({ revoked_at: nowIso }).eq("token_hash", tokenHash);
    return Response.json({ ok: false, code: "ADMIN_INVITE_SYNC_FAILED", error: "Admin access could not be synchronized. Ask the primary administrator to send a new invitation." }, { status: 500 });
  }

  return Response.json({ ok: true, member: data || null });
}
